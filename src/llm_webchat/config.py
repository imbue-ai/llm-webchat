from pydantic import field_validator
from pydantic_settings import BaseSettings


class Config(BaseSettings):
    llm_conversation_ids: list[str] | None = None
    llm_webchat_javascript_plugins: list[str] | None = None
    llm_webchat_static_paths: list[str] | None = None

    @field_validator(
        "llm_conversation_ids", "llm_webchat_javascript_plugins", "llm_webchat_static_paths", mode="before"
    )
    @classmethod
    def split_comma_separated(cls, value: object) -> list[str] | None:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


def load_config() -> Config:
    return Config()
