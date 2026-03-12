import pluggy

from llm_webchat.hookspecs import LlmWebchatHookSpec

_plugin_manager: pluggy.PluginManager | None = None


def get_plugin_manager() -> pluggy.PluginManager:
    global _plugin_manager
    if _plugin_manager is None:
        _plugin_manager = pluggy.PluginManager("llm_webchat")
        _plugin_manager.add_hookspecs(LlmWebchatHookSpec)
    return _plugin_manager
