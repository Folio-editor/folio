from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import llm as llm_module


def _text_block(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def _tool_use_block(tool_id: str, name: str, inputs: dict) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", id=tool_id, name=name, input=inputs)


def _response(stop_reason: str, content: list[SimpleNamespace]) -> SimpleNamespace:
    return SimpleNamespace(stop_reason=stop_reason, content=content)


class FakeStreamManager:
    def __init__(self, chunks: list[str]) -> None:
        self._chunks = chunks

    async def __aenter__(self) -> FakeStreamManager:
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False

    @property
    def text_stream(self):
        async def _iterator():
            for chunk in self._chunks:
                yield chunk

        return _iterator()


class FakeMessagesAPI:
    def __init__(self, responses: list[SimpleNamespace], stream_chunks: list[str] | None = None) -> None:
        self._responses = list(responses)
        self._stream_chunks = stream_chunks or []
        self.create_calls: list[dict] = []
        self.stream_calls: list[dict] = []

    async def create(self, **kwargs):
        self.create_calls.append(kwargs)
        return self._responses.pop(0)

    def stream(self, **kwargs):
        self.stream_calls.append(kwargs)
        return FakeStreamManager(self._stream_chunks)


def _install_fake_anthropic(monkeypatch: pytest.MonkeyPatch, messages_api: FakeMessagesAPI) -> None:
    fake_client = SimpleNamespace(messages=messages_api)
    monkeypatch.setattr(
        llm_module,
        "anthropic",
        SimpleNamespace(AsyncAnthropic=lambda api_key: fake_client),
    )


@pytest.mark.asyncio
async def test_generate_json_parses_plain_json(monkeypatch: pytest.MonkeyPatch):
    messages_api = FakeMessagesAPI(
        responses=[_response("end_turn", [_text_block('{"ok": true, "value": 1}')])]
    )
    _install_fake_anthropic(monkeypatch, messages_api)

    llm = llm_module.AnthropicLLM("test-key", "sonnet", "haiku", "opus")
    result = await llm.generate_json("system prompt", "user prompt", '{"ok": true}')

    assert result == {"ok": True, "value": 1}
    assert messages_api.create_calls[0]["model"] == "haiku"
    assert "반드시 JSON으로만 응답하라" in messages_api.create_calls[0]["system"]


@pytest.mark.asyncio
async def test_generate_json_strips_markdown_code_block(monkeypatch: pytest.MonkeyPatch):
    messages_api = FakeMessagesAPI(
        responses=[_response("end_turn", [_text_block('```json\n{"value": 123}\n```')])]
    )
    _install_fake_anthropic(monkeypatch, messages_api)

    llm = llm_module.AnthropicLLM("test-key", "sonnet", "haiku", "opus")
    result = await llm.generate_json("system prompt", "user prompt", '{"value": 0}')

    assert result == {"value": 123}


@pytest.mark.asyncio
async def test_generate_stream_yields_text_chunks(monkeypatch: pytest.MonkeyPatch):
    messages_api = FakeMessagesAPI(responses=[], stream_chunks=["안녕", "하세요"])
    _install_fake_anthropic(monkeypatch, messages_api)

    llm = llm_module.AnthropicLLM("test-key", "sonnet", "haiku", "opus")
    chunks = [chunk async for chunk in llm.generate_stream("system", "user")]

    assert chunks == ["안녕", "하세요"]
    assert messages_api.stream_calls[0]["model"] == "sonnet"


@pytest.mark.asyncio
async def test_generate_stream_uses_model_override(monkeypatch: pytest.MonkeyPatch):
    messages_api = FakeMessagesAPI(responses=[], stream_chunks=["op", "us"])
    _install_fake_anthropic(monkeypatch, messages_api)

    llm = llm_module.AnthropicLLM("test-key", "sonnet", "haiku", "opus")
    chunks = [chunk async for chunk in llm.generate_stream("system", "user", model_override="opus")]

    assert chunks == ["op", "us"]
    assert messages_api.stream_calls[0]["model"] == "opus"


@pytest.mark.asyncio
async def test_generate_with_tools_handles_tool_loop(monkeypatch: pytest.MonkeyPatch):
    messages_api = FakeMessagesAPI(
        responses=[
            _response(
                "tool_use",
                [_tool_use_block("tool-1", "get_plan", {"section": "all"})],
            ),
            _response(
                "end_turn",
                [_text_block('{"issues": [], "summary": "ok", "score": 100}')],
            ),
        ]
    )
    _install_fake_anthropic(monkeypatch, messages_api)

    llm = llm_module.AnthropicLLM("test-key", "sonnet", "haiku", "opus")
    tool_calls: list[tuple[str, dict]] = []

    async def tool_executor(name: str, inputs: dict):
        tool_calls.append((name, inputs))
        return {"section": "all", "content": "plan result"}

    result = await llm.generate_with_tools(
        system="review system",
        user="review user",
        tools=[{"name": "get_plan"}],
        tool_executor=tool_executor,
    )

    assert result == {"issues": [], "summary": "ok", "score": 100}
    assert tool_calls == [("get_plan", {"section": "all"})]
    assert len(messages_api.create_calls) == 2

    second_messages = messages_api.create_calls[1]["messages"]
    assert second_messages[1]["role"] == "assistant"
    assert second_messages[2]["role"] == "user"
    assert second_messages[2]["content"][0]["type"] == "tool_result"
