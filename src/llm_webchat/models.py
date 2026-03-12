from pydantic import BaseModel


class Conversation(BaseModel, frozen=True):
    id: str


class Message(BaseModel, frozen=True):
    id: str
    conversation_id: str
    content: str
