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
