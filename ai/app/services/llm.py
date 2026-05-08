"""LLM provider interfaces plus fake and Anthropic implementations."""

from __future__ import annotations

import json
import logging
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
logger = logging.getLogger(__name__)


def _empty_usage() -> dict[str, int]:
    return {"input_tokens": 0, "output_tokens": 0}


def _usage_dict(usage: Any) -> dict[str, int]:
    if usage is None:
        return _empty_usage()
    return {
        "input_tokens": int(getattr(usage, "input_tokens", 0) or 0),
        "output_tokens": int(getattr(usage, "output_tokens", 0) or 0),
    }


class LLMProvider(ABC):
    @property
    @abstractmethod
    def last_usage(self) -> dict[str, int]: ...

    @abstractmethod
    async def generate_json(
        self,
        system: str,
        user: str,
        schema_hint: str,
        *,
        model_override: str | None = None,
        max_tokens: int = 2000,
        temperature: float | None = None,
    ) -> dict: ...

    @abstractmethod
    def generate_stream(
        self,
        system: str,
        user: str,
        model_override: str | None = None,
        max_tokens: int = 4000,
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

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = base_url
        self._last_usage = _empty_usage()

    @property
    def last_usage(self) -> dict[str, int]:
        return dict(self._last_usage)

    async def generate_json(
        self,
        system: str,
        user: str,
        schema_hint: str,
        *,
        model_override: str | None = None,
        max_tokens: int = 2000,
        temperature: float | None = None,
    ) -> dict:
        self._last_usage = _empty_usage()
        blob = f"{system}\n{user}\n{schema_hint}".lower()
        if "review" in blob:
            return {"issues": [], "newItems": []}
        if "oneline_summary" in blob:
            # episode_summary v2 스키마 (curious-wiggling-thacker R-3)
            return {
                "oneline_summary": "[fake] 한 줄 요약",
                "summary": "[fake] 회차 요약 더미. 3~5 문장 분량의 줄거리.",
                "pov_character": "주인공",
                "present_characters": ["주인공", "조연1"],
                "present_locations": ["사무실"],
                "key_events": [{"order": 1, "event": "[fake] 사건"}],
                "time_progression": "한 시간",
                "tone": "잔잔한 일상",
                "cliffhanger": None,
                "foreshadow_planted": [],
                "keywords": ["fake", "테스트"],
            }
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
        max_tokens: int = 4000,
    ) -> AsyncIterator[str]:
        import asyncio

        self._last_usage = _empty_usage()
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
        self._last_usage = _empty_usage()
        return {"issues": [], "summary": "검수 결과 없음 (fake)", "score": 100}


class AnthropicLLM(LLMProvider):
    """Claude Messages API based implementation."""

    def __init__(
        self,
        api_key: str,
        sonnet_model: str,
        haiku_model: str,
        opus_model: str,
        base_url: str | None = None,
    ) -> None:
        if anthropic is None:
            raise RuntimeError("anthropic package is not installed.")
        self._api_key = api_key
        self._sonnet_model = sonnet_model
        self._haiku_model = haiku_model
        self._opus_model = opus_model
        self._base_url = base_url
        self._last_usage = _empty_usage()

        client_kwargs: dict[str, Any] = {"api_key": api_key}
        if base_url:
            client_kwargs["base_url"] = base_url
        self._client = anthropic.AsyncAnthropic(**client_kwargs)

    @property
    def last_usage(self) -> dict[str, int]:
        return dict(self._last_usage)

    async def generate_json(
        self,
        system: str,
        user: str,
        schema_hint: str,
        *,
        model_override: str | None = None,
        max_tokens: int = 2000,
        temperature: float | None = None,
    ) -> dict:
        system_prompt = (
            f"{system.rstrip()}\n\n"
            f"{_JSON_ONLY_SUFFIX}\n"
            f"응답 형식: {schema_hint}"
        )
        model = model_override or self._haiku_model
        create_kwargs: dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user}],
        }
        if "opus-4-7" not in model:
            create_kwargs["temperature"] = temperature if temperature is not None else 0.2
        response = await self._client.messages.create(**create_kwargs)
        self._last_usage = _usage_dict(getattr(response, "usage", None))
        logger.info(
            "LLM usage: input=%s, output=%s",
            self._last_usage["input_tokens"],
            self._last_usage["output_tokens"],
        )
        raw_text = _extract_text(response.content)
        return _parse_json_response(raw_text)

    async def generate_stream(
        self,
        system: str,
        user: str,
        model_override: str | None = None,
        max_tokens: int = 4000,
    ) -> AsyncIterator[str]:
        model = model_override or self._sonnet_model
        final_message = None

        stream_kwargs: dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
        if "opus-4-7" not in model:
            stream_kwargs["temperature"] = 0.7

        # 저수준 스트리밍 — SDK의 messages.stream() 고수준 헬퍼는
        # API 이벤트 순서를 엄격 검증하여 RuntimeError를 발생시키므로,
        # messages.create(stream=True)로 원시 이벤트를 직접 처리한다.
        response = await self._client.messages.create(**stream_kwargs, stream=True)
        usage_input = 0
        usage_output = 0
        async for event in response:
            etype = getattr(event, "type", "")
            if etype == "message_start" and hasattr(event, "message"):
                u = getattr(event.message, "usage", None)
                if u:
                    usage_input = int(getattr(u, "input_tokens", 0) or 0) or usage_input
            elif etype == "content_block_delta":
                delta = getattr(event, "delta", None)
                if delta and getattr(delta, "type", "") == "text_delta":
                    text = getattr(delta, "text", "")
                    if text:
                        yield text
            elif etype == "message_delta":
                # 일부 프록시(GMS 등)는 message_start 대신 message_delta에
                # 누적 usage를 싣는다. output·input 둘 다 가능하면 가져온다.
                u = getattr(event, "usage", None)
                if u:
                    o = int(getattr(u, "output_tokens", 0) or 0)
                    if o:
                        usage_output = o
                    i = int(getattr(u, "input_tokens", 0) or 0)
                    if i and not usage_input:
                        usage_input = i

        # 스트림에서 input_tokens를 받지 못한 경우(GMS 프록시가 이벤트를 생략한 케이스)
        # 로컬 토크나이저로 근사치를 계산해 0이 찍히는 것을 방지한다.
        if usage_input == 0:
            try:
                from app.services.chunker import count_tokens
                usage_input = count_tokens(system) + count_tokens(user)
            except Exception:
                pass

        self._last_usage = {"input_tokens": usage_input, "output_tokens": usage_output}
        logger.info(
            "LLM usage: input=%s, output=%s",
            self._last_usage["input_tokens"],
            self._last_usage["output_tokens"],
        )

    async def generate_with_tools(
        self,
        system: str,
        user: str,
        tools: list[dict[str, Any]],
        tool_executor: ToolExecutor,
    ) -> dict:
        messages: list[dict[str, Any]] = [{"role": "user", "content": user}]
        total_usage = _empty_usage()

        for _ in range(10):
            response = await self._client.messages.create(
                model=self._sonnet_model,
                max_tokens=4000,
                temperature=0.1,
                system=system,
                messages=messages,
                tools=tools,
            )
            usage = _usage_dict(getattr(response, "usage", None))
            total_usage["input_tokens"] += usage["input_tokens"]
            total_usage["output_tokens"] += usage["output_tokens"]

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
                    self._last_usage = total_usage
                    logger.info(
                        "LLM usage: input=%s, output=%s",
                        self._last_usage["input_tokens"],
                        self._last_usage["output_tokens"],
                    )
                    return {
                        "error": "도구 호출 결과가 비어 있습니다.",
                        "raw": _extract_text(response.content),
                    }

                messages.append({"role": "assistant", "content": assistant_content})
                messages.append({"role": "user", "content": tool_results})
                continue

            self._last_usage = total_usage
            logger.info(
                "LLM usage: input=%s, output=%s",
                self._last_usage["input_tokens"],
                self._last_usage["output_tokens"],
            )
            return _parse_json_response(_extract_text(response.content))

        self._last_usage = total_usage
        logger.info(
            "LLM usage: input=%s, output=%s",
            self._last_usage["input_tokens"],
            self._last_usage["output_tokens"],
        )
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
