import codecs
import json
import logging
import os
import queue
import select
import signal
import subprocess
import threading
import traceback
from collections.abc import AsyncIterator
from collections.abc import Iterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi import Request
from fastapi.responses import FileResponse
from fastapi.responses import HTMLResponse
from fastapi.responses import JSONResponse
from fastapi.responses import Response
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from llm_webchat.config import Config
from llm_webchat.database import conversation_exists
from llm_webchat.database import create_conversation
from llm_webchat.database import list_conversations
from llm_webchat.database import list_responses
from llm_webchat.database import open_database
from llm_webchat.event_queues import ConversationEventQueues
from llm_webchat.events import BufferBehavior
from llm_webchat.models import ConversationListResponse
from llm_webchat.models import CreateConversationRequest
from llm_webchat.models import CreateConversationResponse
from llm_webchat.models import ErrorResponse
from llm_webchat.models import ModelInfo
from llm_webchat.models import ModelListResponse
from llm_webchat.models import ResponseListResponse
from llm_webchat.models import SendMessageRequest
from llm_webchat.models import SendMessageResponse
from llm_webchat.models import ToolInfo
from llm_webchat.models import ToolListResponse
from llm_webchat.plugins import get_plugin_manager

logger = logging.getLogger(__name__)

STATIC_DIRECTORY = Path(__file__).parent / "static"


_FRONTEND_NOT_BUILT_HTML = (
    "<html><body><p>Frontend not built. Run <code>npm run build</code> in <code>frontend/</code>.</p></body></html>"
)


@asynccontextmanager
async def _lifespan(application: FastAPI) -> AsyncIterator[None]:
    application.state.database = open_database()
    conversation_event_queues = ConversationEventQueues()
    application.state.conversation_event_queues = conversation_event_queues

    plugin_manager = get_plugin_manager()
    plugin_manager.hook.register_event_broadcaster(broadcaster=conversation_event_queues.broadcast)

    is_main_thread = threading.current_thread() is threading.main_thread()
    original_sigint_handler = None

    if is_main_thread:
        original_sigint_handler = signal.getsignal(signal.SIGINT)

        def _graceful_shutdown_handler(signum: int, frame: object) -> None:
            conversation_event_queues.shutdown()
            if callable(original_sigint_handler):
                original_sigint_handler(signum, frame)

        signal.signal(signal.SIGINT, _graceful_shutdown_handler)

    yield

    conversation_event_queues.shutdown()
    if is_main_thread and original_sigint_handler is not None:
        signal.signal(signal.SIGINT, original_sigint_handler)


def _build_plugin_script_tags(plugin_basenames: list[str], root_path: str) -> str:
    return "\n".join(f'<script src="{root_path}/plugins/{basename}"></script>' for basename in plugin_basenames)


def _inject_base_path_meta_tag(html_content: str, root_path: str) -> str:
    meta_tag = f'<meta name="llm-webchat-base-path" content="{root_path}">'
    return html_content.replace("</head>", f"{meta_tag}\n</head>")


def _inject_plugin_script_tags(html_content: str, plugin_basenames: list[str], root_path: str) -> str:
    script_tags = _build_plugin_script_tags(plugin_basenames, root_path)
    # This is fragile but should be fine in practice.
    return html_content.replace("</body>", f"{script_tags}\n</body>")


def _index(request: Request) -> Response:
    index_path = STATIC_DIRECTORY / "index.html"
    if index_path.exists():
        config: Config = request.app.state.config
        root_path = request.scope.get("root_path", "").rstrip("/")
        html_content = index_path.read_text()
        html_content = _inject_base_path_meta_tag(html_content, root_path)
        if config.javascript_plugin_basenames:
            html_content = _inject_plugin_script_tags(html_content, config.javascript_plugin_basenames, root_path)
        return HTMLResponse(html_content)
    return HTMLResponse(_FRONTEND_NOT_BUILT_HTML)


def _favicon() -> Response:
    favicon_path = STATIC_DIRECTORY / "favicon.ico"
    if favicon_path.exists():
        return FileResponse(favicon_path, media_type="image/x-icon")
    return Response(status_code=404)


def _list_conversations_endpoint(request: Request, count: int = 10) -> Response:
    database = request.app.state.database
    conversations = list_conversations(database, count=count)
    response = ConversationListResponse(conversations=conversations)
    return JSONResponse(content=response.model_dump())


def _conversation_not_found_response(conversation_id: str) -> JSONResponse:
    error = ErrorResponse(detail=f"Conversation '{conversation_id}' not found")
    return JSONResponse(content=error.model_dump(), status_code=404)


def _list_responses_endpoint(request: Request, conversation_id: str) -> Response:
    database = request.app.state.database
    if not conversation_exists(database, conversation_id):
        return _conversation_not_found_response(conversation_id)
    responses = list_responses(database, conversation_id)
    response = ResponseListResponse(responses=responses)
    return JSONResponse(content=response.model_dump())


def _list_models() -> JSONResponse:
    from llm import get_models

    models = get_models()
    model_infos = [ModelInfo(model_id=model.model_id) for model in models]
    response = ModelListResponse(models=model_infos)
    return JSONResponse(content=response.model_dump())


def _parse_tool_names(tool_list_output: str) -> list[str]:
    tool_names = []
    for line in tool_list_output.splitlines():
        if line and not line[0].isspace():
            name = line.split("(")[0].strip()
            if name:
                tool_names.append(name)
    return tool_names


def _list_tools(request: Request) -> JSONResponse:
    cached = getattr(request.app.state, "cached_tool_list_response", None)
    if cached is None:
        result = subprocess.run(
            ["llm", "tools", "list"],
            capture_output=True,
            text=True,
        )
        tool_names = _parse_tool_names(result.stdout)
        tool_infos = [ToolInfo(tool_name=name) for name in tool_names]
        cached = ToolListResponse(tools=tool_infos).model_dump()
        request.app.state.cached_tool_list_response = cached
    return JSONResponse(content=cached)


def _create_conversation(create_conversation_request: CreateConversationRequest, request: Request) -> JSONResponse:
    database = request.app.state.database
    conversation = create_conversation(database, create_conversation_request.name, create_conversation_request.model)
    response = CreateConversationResponse(id=conversation.id)
    return JSONResponse(content=response.model_dump(), status_code=201)


def _run_llm_subprocess(
    conversation_event_queues: ConversationEventQueues,
    conversation_id: str,
    message: str,
    model: str,
    system_prompt: str | None = None,
    tools: list[str] | None = None,
    tool_chain_limit: int = 20,
) -> None:
    try:
        conversation_event_queues.broadcast(
            conversation_id, {"type": "user_message", "content": message, "model": model}
        )
        conversation_event_queues.broadcast(conversation_id, {"type": "message_start"})

        # The --td argument causes tool calls to be output to stderr.
        # During typical operation, we don't expect anything else on stderr.
        # For simplicity, make stderr output part of the message stream.
        # We don't expect stdout and stderr to emit data at the same time so that should be fine.
        # Every time we transition from stdout to stderr or vice versa, we flush the current buffer
        # to ensure correct ordering and make sure stderr blocks are properly delimited by ``` code blocks.
        command = ["llm", "-m", model, "--cid", conversation_id, "--td", "--cl", str(tool_chain_limit)]
        if system_prompt:
            command.extend(["--system", system_prompt])
        for tool_name in tools or []:
            command.extend(["-T", tool_name])
        command.append(message)

        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        assert process.stdout is not None
        assert process.stderr is not None

        stderr_lines: list[str] = []
        tool_call_code_block_open = False
        last_output_was_stderr = False
        stdout_decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
        read_size = 1024
        flush_timeout_seconds = 0.05
        stdout_buffer = ""
        stderr_line_buffer = b""

        def _broadcast(content: str) -> None:
            conversation_event_queues.broadcast(conversation_id, {"type": "message_delta", "content": content})

        def _flush_stdout_buffer() -> None:
            nonlocal stdout_buffer
            stdout_buffer += stdout_decoder.decode(b"", final=False)
            if stdout_buffer:
                _broadcast(stdout_buffer)
                stdout_buffer = ""

        def _close_tool_call_code_block() -> None:
            nonlocal tool_call_code_block_open
            if tool_call_code_block_open:
                _broadcast("\n```\n\n")
                tool_call_code_block_open = False

        def _handle_stderr_line(raw_line: bytes) -> None:
            nonlocal tool_call_code_block_open, last_output_was_stderr
            line = raw_line.decode("utf-8", errors="replace").rstrip("\n")
            stderr_lines.append(line)
            _flush_stdout_buffer()
            if not tool_call_code_block_open:
                _broadcast("\n\n```\n" + line)
                tool_call_code_block_open = True
            else:
                _broadcast("\n" + line)
            last_output_was_stderr = True

        def _handle_stdout_data(raw_chunk: bytes) -> None:
            nonlocal stdout_buffer, last_output_was_stderr
            stdout_buffer += stdout_decoder.decode(raw_chunk)
            if last_output_was_stderr:
                _close_tool_call_code_block()
                last_output_was_stderr = False
            _flush_stdout_buffer()

        stdout_fd = process.stdout.fileno()
        stderr_fd = process.stderr.fileno()
        os.set_blocking(stdout_fd, False)
        os.set_blocking(stderr_fd, False)

        open_fds = {stdout_fd, stderr_fd}
        while open_fds:
            ready = select.select(list(open_fds), [], [], flush_timeout_seconds)[0]
            if not ready:
                _flush_stdout_buffer()
                continue
            for fd in ready:
                if fd == stderr_fd:
                    raw = os.read(stderr_fd, read_size)
                    if not raw:
                        open_fds.discard(stderr_fd)
                        continue
                    stderr_line_buffer += raw
                    while b"\n" in stderr_line_buffer:
                        raw_line, stderr_line_buffer = stderr_line_buffer.split(b"\n", 1)
                        _handle_stderr_line(raw_line)
                elif fd == stdout_fd:
                    raw = os.read(stdout_fd, read_size)
                    if not raw:
                        open_fds.discard(stdout_fd)
                        continue
                    _handle_stdout_data(raw)

        # Process any remaining partial stderr line.
        if stderr_line_buffer:
            _handle_stderr_line(stderr_line_buffer)

        # Finalize stdout decoder and flush.
        remaining = stdout_decoder.decode(b"", final=True)
        if remaining:
            if last_output_was_stderr:
                _close_tool_call_code_block()
                last_output_was_stderr = False
            stdout_buffer += remaining
        _flush_stdout_buffer()
        _close_tool_call_code_block()

        process.wait()

        if process.returncode != 0:
            stderr_output = "\n".join(stderr_lines)
            error_content = stderr_output.strip() or f"Process exited with code {process.returncode}"
            logger.error(
                "llm subprocess failed for conversation %s (exit code %d): %s",
                conversation_id,
                process.returncode,
                stderr_output.strip(),
            )
            conversation_event_queues.broadcast(conversation_id, {"type": "error", "content": error_content})

        conversation_event_queues.broadcast(
            conversation_id, {"type": "message_end", "buffer_behavior": BufferBehavior.FLUSH}
        )

    except Exception as exception:
        logger.error(
            "Exception in llm subprocess for conversation %s:\n%s",
            conversation_id,
            traceback.format_exc(),
        )
        conversation_event_queues.broadcast(conversation_id, {"type": "error", "content": str(exception)})
        conversation_event_queues.broadcast(
            conversation_id, {"type": "message_end", "buffer_behavior": BufferBehavior.FLUSH}
        )


def _send_message(conversation_id: str, send_message_request: SendMessageRequest, request: Request) -> JSONResponse:
    database = request.app.state.database
    if not conversation_exists(database, conversation_id):
        return _conversation_not_found_response(conversation_id)

    conversation_event_queues: ConversationEventQueues = request.app.state.conversation_event_queues
    config: Config = request.app.state.config

    thread = threading.Thread(
        target=_run_llm_subprocess,
        args=(
            conversation_event_queues,
            conversation_id,
            send_message_request.message,
            send_message_request.model,
            send_message_request.system_prompt,
            send_message_request.tools,
            config.llm_webchat_tool_chain_limit,
        ),
        daemon=True,
    )
    thread.start()

    response = SendMessageResponse(status="ok")
    return JSONResponse(content=response.model_dump())


def _stream_events(conversation_id: str, request: Request) -> Response:
    database = request.app.state.database
    if not conversation_exists(database, conversation_id):
        return _conversation_not_found_response(conversation_id)

    conversation_event_queues: ConversationEventQueues = request.app.state.conversation_event_queues
    event_queue = conversation_event_queues.register(conversation_id)

    def event_generator() -> Iterator[str]:
        keepalive_counter = 0
        try:
            while not conversation_event_queues.is_shutdown:
                try:
                    event = event_queue.get(timeout=1)
                    keepalive_counter = 0
                    if event is None:
                        break
                    yield f"data: {json.dumps(event)}\n\n"
                except queue.Empty:
                    keepalive_counter += 1
                    if keepalive_counter >= 8:
                        keepalive_counter = 0
                        yield ": keepalive\n\n"
        except GeneratorExit:
            pass
        finally:
            conversation_event_queues.unregister(conversation_id, event_queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


def _serve_static_file(basename: str, request: Request) -> Response:
    config: Config = request.app.state.config
    file_path_string = config.static_file_basename_to_path.get(basename)
    if file_path_string is None:
        error = ErrorResponse(detail=f"Static file '{basename}' not found")
        return JSONResponse(content=error.model_dump(), status_code=404)
    file_path = Path(file_path_string)
    if not file_path.is_file():
        error = ErrorResponse(detail=f"Static file not found on disk: {file_path}")
        return JSONResponse(content=error.model_dump(), status_code=404)
    return FileResponse(file_path)


def create_application(config: Config | None = None) -> FastAPI:
    application = FastAPI(lifespan=_lifespan)
    application.state.config = config or Config()

    plugin_manager = get_plugin_manager()
    plugin_manager.hook.endpoint(app=application)

    application.add_api_route("/", _index, methods=["GET"])
    application.add_api_route("/favicon.ico", _favicon, methods=["GET"])
    application.add_api_route("/api/models", _list_models, methods=["GET"])
    application.add_api_route("/api/tools", _list_tools, methods=["GET"])
    application.add_api_route("/api/conversations", _list_conversations_endpoint, methods=["GET"])
    application.add_api_route(
        "/api/conversations/{conversation_id}/responses", _list_responses_endpoint, methods=["GET"]
    )
    application.add_api_route("/api/conversations", _create_conversation, methods=["POST"])
    application.add_api_route("/api/conversations/{conversation_id}/message", _send_message, methods=["POST"])
    application.add_api_route("/api/conversations/{conversation_id}/stream", _stream_events, methods=["GET"])
    application.add_api_route("/plugins/{basename}", _serve_static_file, methods=["GET"])

    assets_directory = STATIC_DIRECTORY / "assets"
    if assets_directory.is_dir():
        application.mount("/assets", StaticFiles(directory=assets_directory), name="assets")

    application.add_api_route("/{path:path}", _index, methods=["GET"])

    return application
