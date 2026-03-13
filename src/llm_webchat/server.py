from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi import Request
from fastapi.responses import FileResponse
from fastapi.responses import HTMLResponse
from fastapi.responses import JSONResponse
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from llm_webchat.database import list_conversations
from llm_webchat.database import list_responses
from llm_webchat.database import open_database
from llm_webchat.models import ConversationListResponse
from llm_webchat.models import ResponseListResponse
from llm_webchat.plugins import get_plugin_manager

STATIC_DIRECTORY = Path(__file__).parent / "static"

_FRONTEND_NOT_BUILT_HTML = (
    "<html><body><p>Frontend not built. Run <code>npm run build</code> in <code>frontend/</code>.</p></body></html>"
)


@asynccontextmanager
async def _lifespan(application: FastAPI) -> AsyncIterator[None]:
    application.state.database = open_database()
    yield


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
