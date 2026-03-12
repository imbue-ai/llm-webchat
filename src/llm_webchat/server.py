from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse

from llm_webchat.plugins import get_plugin_manager


def _index() -> HTMLResponse:
    return HTMLResponse("<html><body><h1>Hello, world!</h1></body></html>")


def _list_conversations(count: int = 8) -> JSONResponse:
    return JSONResponse(content={"conversations": [], "message": "Hello, world!"})


def _get_conversation(conversation_id: str) -> JSONResponse:
    return JSONResponse(
        content={"id": conversation_id, "message": "Hello, world!"}
    )


def _create_conversation() -> JSONResponse:
    return JSONResponse(
        content={"message": "Hello, world!"}, status_code=201
    )


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

    plugin_manager = get_plugin_manager()
    plugin_manager.hook.endpoint(app=application)

    return application
