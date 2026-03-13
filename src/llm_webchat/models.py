from pydantic import BaseModel


class Conversation(BaseModel, frozen=True):
    id: str
    name: str
    model: str


class ConversationListResponse(BaseModel, frozen=True):
    conversations: list[Conversation]


class Message(BaseModel, frozen=True):
    id: str
    conversation_id: str
    content: str


class ResponseItem(BaseModel, frozen=True):
    id: str
    model: str
    prompt: str | None
    system: str | None
    response: str
    conversation_id: str
    datetime_utc: str
    duration_ms: int | None
    input_tokens: int | None
    output_tokens: int | None


class ResponseListResponse(BaseModel, frozen=True):
    responses: list[ResponseItem]


class SendMessageRequest(BaseModel, frozen=True):
    message: str


class SendMessageResponse(BaseModel, frozen=True):
    status: str
