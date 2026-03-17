from functools import cached_property
from pathlib import Path

from pydantic import field_validator
from pydantic import model_validator
from pydantic_settings import BaseSettings


class DuplicatePluginBasenameError(ValueError):
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
        return None

    @model_validator(mode="after")
    def validate_unique_plugin_basenames(self) -> "Config":
        if not self.llm_webchat_javascript_plugins:
            return self
        seen: dict[str, str] = {}
        for plugin_path in self.llm_webchat_javascript_plugins:
            basename = Path(plugin_path).name
            if basename in seen:
                raise DuplicatePluginBasenameError(
                    f"Duplicate plugin basename '{basename}': '{seen[basename]}' and '{plugin_path}'"
                )
            seen[basename] = plugin_path
        return self

    @cached_property
    def javascript_plugin_basename_to_path(self) -> dict[str, str]:
        if not self.llm_webchat_javascript_plugins:
            return {}
        return {Path(plugin_path).name: plugin_path for plugin_path in self.llm_webchat_javascript_plugins}


def load_config() -> Config:
    return Config()
