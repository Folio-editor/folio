from __future__ import annotations

from app.services import providers as providers_module


def test_get_llm_passes_anthropic_base_url(monkeypatch):
    captured: dict[str, object] = {}

    class StubAnthropicLLM:
        def __init__(
            self,
            api_key: str,
            sonnet_model: str,
            haiku_model: str,
            opus_model: str,
            base_url: str | None = None,
        ) -> None:
            captured["api_key"] = api_key
            captured["sonnet_model"] = sonnet_model
            captured["haiku_model"] = haiku_model
            captured["opus_model"] = opus_model
            captured["base_url"] = base_url

    monkeypatch.setattr(providers_module, "AnthropicLLM", StubAnthropicLLM)
    monkeypatch.setattr(providers_module.settings, "llm_provider", "anthropic")
    monkeypatch.setattr(providers_module.settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(providers_module.settings, "claude_sonnet_model", "sonnet-model")
    monkeypatch.setattr(providers_module.settings, "claude_haiku_model", "haiku-model")
    monkeypatch.setattr(providers_module.settings, "claude_opus_model", "opus-model")
    monkeypatch.setattr(
        providers_module.settings,
        "anthropic_base_url",
        "https://gms.example.com/anthropic",
    )

    llm = providers_module.get_llm()

    assert isinstance(llm, StubAnthropicLLM)
    assert captured == {
        "api_key": "test-key",
        "sonnet_model": "sonnet-model",
        "haiku_model": "haiku-model",
        "opus_model": "opus-model",
        "base_url": "https://gms.example.com/anthropic",
    }
