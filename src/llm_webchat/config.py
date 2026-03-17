from functools import cached_property
from pathlib import Path

from pydantic import field_validator
from pydantic import model_validator
from pydantic_settings import BaseSettings


class DuplicateStaticBasenameError(ValueError):
    pass


class Config(BaseSettings):
    model_config = {"frozen": False}

    llm_conversation_ids: list[str] | None = None
    llm_webchat_javascript_plugins: list[str] | None = None
    llm_webchat_static_paths: list[str] | None = None
    llm_webchat_host: str = "127.0.0.1"
    llm_webchat_port: int = 8000

    @field_validator(
        "llm_conversation_ids", "llm_webchat_javascript_plugins", "llm_webchat_static_paths", mode="before"
    )
    @classmethod
    def split_comma_separated(cls, value: object) -> list[str] | None:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        if isinstance(value, list):
            return value
        return None

    @model_validator(mode="after")
    def validate_unique_static_basenames(self) -> "Config":
        all_paths = [
            *(self.llm_webchat_javascript_plugins or []),
            *(self.llm_webchat_static_paths or []),
        ]
        if not all_paths:
            return self
        seen: dict[str, str] = {}
        for file_path in all_paths:
            basename = Path(file_path).name
            if basename in seen:
                raise DuplicateStaticBasenameError(
                    f"Duplicate static basename '{basename}': '{seen[basename]}' and '{file_path}'"
                )
            seen[basename] = file_path
        return self

    @cached_property
    def javascript_plugin_basenames(self) -> list[str]:
        if not self.llm_webchat_javascript_plugins:
            return []
        return [Path(plugin_path).name for plugin_path in self.llm_webchat_javascript_plugins]

    @cached_property
    def static_file_basename_to_path(self) -> dict[str, str]:
        all_paths = [
            *(self.llm_webchat_javascript_plugins or []),
            *(self.llm_webchat_static_paths or []),
        ]
        if not all_paths:
            return {}
        return {Path(file_path).name: file_path for file_path in all_paths}


def load_config() -> Config:
    return Config()
