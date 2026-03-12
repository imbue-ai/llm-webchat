from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.responses import HTMLResponse
from fastapi.responses import JSONResponse
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from llm_webchat.plugins import get_plugin_manager

STATIC_DIRECTORY = Path(__file__).parent / "static"

_FRONTEND_NOT_BUILT_HTML = (
    "<html><body><p>Frontend not built. Run <code>npm run build</code> in <code>frontend/</code>.</p></body></html>"
)


def _index() -> Response:
    index_path = STATIC_DIRECTORY / "index.html"
    if index_path.exists():
        return FileResponse(index_path, media_type="text/html")
    return HTMLResponse(_FRONTEND_NOT_BUILT_HTML)


def _list_conversations(count: int = 8) -> JSONResponse:
    return JSONResponse(content={"conversations": [], "message": "Hello, world!"})


def _get_conversation(conversation_id: str) -> JSONResponse:
    return JSONResponse(content={"id": conversation_id, "message": "Hello, world!"})


def _create_conversation() -> JSONResponse:
    return JSONResponse(content={"message": "Hello, world!"}, status_code=201)


def _send_message(conversation_id: str) -> JSONResponse:
    return JSONResponse(
        content={
            "conversation_id": conversation_id,
            "message": "Hello, world!",
        }
    )


def _stream_events(conversation_id: str) -> JSONResponse:
    return JSONResponse(
        content={
            "conversation_id": conversation_id,
            "message": "Hello, world!",
        }
    )


def create_application() -> FastAPI:
    application = FastAPI()

    application.add_api_route("/", _index, methods=["GET"])
    application.add_api_route("/api/conversations", _list_conversations, methods=["GET"])
    application.add_api_route("/api/conversations/{conversation_id}", _get_conversation, methods=["GET"])
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
