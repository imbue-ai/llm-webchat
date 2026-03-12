import pluggy

hookspec = pluggy.HookspecMarker("llm_webchat")
hookimpl = pluggy.HookimplMarker("llm_webchat")


class LlmWebchatHookSpec:
    @hookspec
    def endpoint(self, app: object) -> None:
        """Register additional endpoints on the FastAPI application."""
