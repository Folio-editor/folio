"""LLM provider interfaces plus fake/Anthropic implementations."""

from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any, Awaitable, Callable

try:
    import anthropic
except ImportError:  # pragma: no cover - optional runtime dependency
    anthropic = None

ToolExecutor = Callable[[str, dict[str, Any]], Awaitable[Any]]
_CODE_BLOCK_RE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL | re.IGNORECASE)
_JSON_ONLY_SUFFIX = (
    "반드시 JSON으로만 응답하라. 마크다운 코드블록(```)을 사용하지 마라. "
    "설명이나 인사말을 붙이지 마라. JSON만 출력하라."
)


class LLMProvider(ABC):
    @abstractmethod
    async def generate_json(self, system: str, user: str, schema_hint: str) -> dict: ...

    @abstractmethod
    def generate_stream(
        self,
        system: str,
        user: str,
        model_override: str | None = None,
    ) -> AsyncIterator[str]: ...

    @abstractmethod
    async def generate_with_tools(
        self,
        system: str,
        user: str,
        tools: list[dict[str, Any]],
        tool_executor: ToolExecutor,
    ) -> dict: ...


class FakeLLM(LLMProvider):
    """Fixed fake responses for local flow validation."""

    async def generate_json(self, system: str, user: str, schema_hint: str) -> dict:
        blob = f"{system}\n{user}\n{schema_hint}".lower()
        if "review" in blob:
            return {"issues": [], "newItems": []}
        return {
            "summary": "[fake] 회차 요약 더미",
            "characters": {"existing": [], "new": []},
            "newTerms": [],
            "foreshadowingCandidates": [],
        }

    async def generate_stream(
        self,
        system: str,
        user: str,
        model_override: str | None = None,
    ) -> AsyncIterator[str]:
        import asyncio

        text = (
            "[fake draft] "
            "리운은 사무실 의자에 앉아 창밖을 바라보았다. "
            "회색 하늘 아래 도시의 불빛들이 하나둘 켜지고 있었다. "
            "오늘도 의뢰가 세 건이나 남아 있었다. "
            "그는 책상 위의 서류를 집어 들었다. "
            "다음 의뢰인의 이름이 눈에 들어왔다. "
            "낯선 이름이었지만, 어딘가 익숙한 느낌이 들었다."
        )
        for index in range(0, len(text), 2):
            yield text[index : index + 2]
            await asyncio.sleep(0.03)

    async def generate_with_tools(
        self,
        system: str,
        user: str,
        tools: list[dict[str, Any]],
        tool_executor: ToolExecutor,
    ) -> dict:
        return {"issues": [], "summary": "검수 결과 없음 (fake)", "score": 100}


class AnthropicLLM(LLMProvider):
    """Claude Messages API based implementation."""

    def __init__(
        self,
        api_key: str,
        sonnet_model: str,
        haiku_model: str,
        opus_model: str,
    ) -> None:
        if anthropic is None:
            raise RuntimeError("anthropic package is not installed.")
        self._api_key = api_key
        self._sonnet_model = sonnet_model
        self._haiku_model = haiku_model
        self._opus_model = opus_model
        self._client = anthropic.AsyncAnthropic(api_key=api_key)

    async def generate_json(self, system: str, user: str, schema_hint: str) -> dict:
        system_prompt = (
            f"{system.rstrip()}\n\n"
            f"{_JSON_ONLY_SUFFIX}\n"
            f"응답 형식: {schema_hint}"
        )
        response = await self._client.messages.create(
            model=self._haiku_model,
            max_tokens=2000,
            temperature=0.2,
            system=system_prompt,
            messages=[{"role": "user", "content": user}],
        )
        raw_text = _extract_text(response.content)
        return _parse_json_response(raw_text)

    async def generate_stream(
        self,
        system: str,
        user: str,
        model_override: str | None = None,
    ) -> AsyncIterator[str]:
        model = model_override or self._sonnet_model
        async with self._client.messages.stream(
            model=model,
            max_tokens=8000,
            temperature=0.7,
            system=system,
            messages=[{"role": "user", "content": user}],
        ) as stream:
            async for text in stream.text_stream:
                if text:
                    yield text

    async def generate_with_tools(
        self,
        system: str,
        user: str,
        tools: list[dict[str, Any]],
        tool_executor: ToolExecutor,
    ) -> dict:
        messages: list[dict[str, Any]] = [{"role": "user", "content": user}]

        for _ in range(10):
            response = await self._client.messages.create(
                model=self._sonnet_model,
                max_tokens=4000,
                temperature=0.1,
                system=system,
                messages=messages,
                tools=tools,
            )

            if response.stop_reason == "tool_use":
                assistant_content: list[dict[str, Any]] = []
                tool_results: list[dict[str, Any]] = []

                for block in response.content:
                    if getattr(block, "type", None) == "text":
                        assistant_content.append({"type": "text", "text": block.text})
                        continue

                    if getattr(block, "type", None) != "tool_use":
                        continue

                    tool_input = block.input if isinstance(block.input, dict) else {}
                    assistant_content.append(
                        {
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": tool_input,
                        }
                    )
                    result = await tool_executor(block.name, tool_input)
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": _serialize_tool_result(result),
                        }
                    )

                if not tool_results:
                    return {
                        "error": "도구 호출 결과가 비어 있습니다.",
                        "raw": _extract_text(response.content),
                    }

                messages.append({"role": "assistant", "content": assistant_content})
                messages.append({"role": "user", "content": tool_results})
                continue

            return _parse_json_response(_extract_text(response.content))

        return {"error": "tool_use loop exceeded limit"}


def _extract_text(content_blocks: list[Any]) -> str:
    texts = [
        block.text
        for block in content_blocks
        if getattr(block, "type", None) == "text" and hasattr(block, "text")
    ]
    return "".join(texts).strip()


def _strip_code_block(text: str) -> str:
    match = _CODE_BLOCK_RE.match(text.strip())
    if match:
        return match.group(1).strip()
    return text.strip()


def _parse_json_response(raw_text: str) -> dict:
    candidates = [raw_text.strip()]

    cleaned = _strip_code_block(raw_text)
    if cleaned and cleaned not in candidates:
        candidates.append(cleaned)

    for candidate in candidates:
        if not candidate:
            continue
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue

        if isinstance(parsed, dict):
            return parsed
        return {"result": parsed}

    return {"error": "JSON 파싱 실패", "raw": raw_text}


def _serialize_tool_result(result: Any) -> str:
    if isinstance(result, str):
        return result
    return json.dumps(result, ensure_ascii=False, default=str)
