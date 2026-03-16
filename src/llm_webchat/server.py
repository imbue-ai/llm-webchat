import codecs
import json
import logging
import queue
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

from llm_webchat.database import create_conversation
from llm_webchat.database import list_conversations
from llm_webchat.database import list_responses
from llm_webchat.database import open_database
from llm_webchat.event_queues import ConversationEventQueues
from llm_webchat.models import ConversationListResponse
from llm_webchat.models import CreateConversationRequest
from llm_webchat.models import CreateConversationResponse
from llm_webchat.models import ResponseListResponse
from llm_webchat.models import SendMessageRequest
from llm_webchat.models import SendMessageResponse
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


def _index() -> Response:
    index_path = STATIC_DIRECTORY / "index.html"
    if index_path.exists():
        return FileResponse(index_path, media_type="text/html")
    return HTMLResponse(_FRONTEND_NOT_BUILT_HTML)


def _list_conversations_endpoint(request: Request, count: int = 10) -> Response:
    database = request.app.state.database
    conversations = list_conversations(database, count=count)
    response = ConversationListResponse(conversations=conversations)
    return JSONResponse(content=response.model_dump())


def _list_responses_endpoint(request: Request, conversation_id: str) -> Response:
    database = request.app.state.database
    responses = list_responses(database, conversation_id)
    response = ResponseListResponse(responses=responses)
    return JSONResponse(content=response.model_dump())


def _create_conversation(create_conversation_request: CreateConversationRequest, request: Request) -> JSONResponse:
    database = request.app.state.database
    conversation = create_conversation(database, create_conversation_request.name)
    response = CreateConversationResponse(id=conversation.id)
    return JSONResponse(content=response.model_dump(), status_code=201)


def _run_llm_subprocess(
    conversation_event_queues: ConversationEventQueues, conversation_id: str, message: str
) -> None:
    try:
        conversation_event_queues.broadcast(conversation_id, {"type": "user_message", "content": message})
        conversation_event_queues.broadcast(conversation_id, {"type": "message_start"})

        process = subprocess.Popen(
            ["llm", "--cid", conversation_id, message],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        assert process.stdout is not None
        decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
        while True:
            chunk = process.stdout.read(16)
            if not chunk:
                text = decoder.decode(b"", final=True)
                if text:
                    conversation_event_queues.broadcast(conversation_id, {"type": "message_delta", "content": text})
                break
            text = decoder.decode(chunk)
            if text:
                conversation_event_queues.broadcast(conversation_id, {"type": "message_delta", "content": text})

        process.wait()

        if process.returncode != 0:
            stderr_output = ""
            if process.stderr:
                stderr_output = process.stderr.read().decode("utf-8", errors="replace")
            error_content = stderr_output.strip() or f"Process exited with code {process.returncode}"
            logger.error(
                "llm subprocess failed for conversation %s (exit code %d): %s",
                conversation_id,
                process.returncode,
                stderr_output.strip(),
            )
            conversation_event_queues.broadcast(conversation_id, {"type": "error", "content": error_content})

        conversation_event_queues.broadcast(conversation_id, {"type": "message_end"})

    except Exception as exception:
        logger.error(
            "Exception in llm subprocess for conversation %s:\n%s",
            conversation_id,
            traceback.format_exc(),
        )
        conversation_event_queues.broadcast(conversation_id, {"type": "error", "content": str(exception)})
        conversation_event_queues.broadcast(conversation_id, {"type": "message_end"})


def _send_message(conversation_id: str, send_message_request: SendMessageRequest, request: Request) -> JSONResponse:
    conversation_event_queues: ConversationEventQueues = request.app.state.conversation_event_queues

    thread = threading.Thread(
        target=_run_llm_subprocess,
        args=(conversation_event_queues, conversation_id, send_message_request.message),
        daemon=True,
    )
    thread.start()

    response = SendMessageResponse(status="ok")
    return JSONResponse(content=response.model_dump())


def _stream_events(conversation_id: str, request: Request) -> StreamingResponse:
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
                    if keepalive_counter >= 30:
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


def create_application() -> FastAPI:
    application = FastAPI(lifespan=_lifespan)

    application.add_api_route("/", _index, methods=["GET"])
    application.add_api_route("/api/conversations", _list_conversations_endpoint, methods=["GET"])
    application.add_api_route(
        "/api/conversations/{conversation_id}/responses", _list_responses_endpoint, methods=["GET"]
    )
    application.add_api_route("/api/conversations", _create_conversation, methods=["POST"])
    application.add_api_route("/api/conversations/{conversation_id}/message", _send_message, methods=["POST"])
    application.add_api_route("/api/conversations/{conversation_id}/stream", _stream_events, methods=["GET"])

    assets_directory = STATIC_DIRECTORY / "assets"
    if assets_directory.is_dir():
        application.mount("/assets", StaticFiles(directory=assets_directory), name="assets")
    if STATIC_DIRECTORY.is_dir():
        application.mount("/static", StaticFiles(directory=STATIC_DIRECTORY), name="static")

    plugin_manager = get_plugin_manager()
    plugin_manager.hook.endpoint(app=application)

    return application
