from __future__ import annotations

from app.config import Settings


def test_anthropic_api_key_uses_empty_string_when_both_keys_missing(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("CLAUDE_API_KEY", raising=False)

    settings = Settings(_env_file=None)

    assert settings.anthropic_api_key == ""


def test_anthropic_api_key_falls_back_to_claude_api_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("CLAUDE_API_KEY", "claude-key-only")

    settings = Settings(_env_file=None)

    assert settings.anthropic_api_key == "claude-key-only"


def test_anthropic_api_key_prefers_explicit_anthropic_key(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "anthropic-key")
    monkeypatch.setenv("CLAUDE_API_KEY", "claude-key-only")

    settings = Settings(_env_file=None)

    assert settings.anthropic_api_key == "anthropic-key"


def test_anthropic_base_url_defaults_to_none(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_BASE_URL", raising=False)

    settings = Settings(_env_file=None)

    assert settings.anthropic_base_url is None


def test_anthropic_base_url_reads_from_env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_BASE_URL", "https://gms.example.com/anthropic")

    settings = Settings(_env_file=None)

    assert settings.anthropic_base_url == "https://gms.example.com/anthropic"
