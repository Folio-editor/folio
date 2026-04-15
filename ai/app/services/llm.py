"""LLM Provider 인터페이스 + Fake/Anthropic 구현.

SSAFY GMS 키 발급 전까지 FakeLLM으로 Phase 3 JSON 파싱·SSE 스트리밍 구조 검증.
키 도착 후 AnthropicLLM 본체 구현 + LLM_PROVIDER=anthropic 전환.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator


class LLMProvider(ABC):
    @abstractmethod
    async def generate_json(self, system: str, user: str, schema_hint: str) -> dict: ...

    @abstractmethod
    def generate_stream(self, system: str, user: str) -> AsyncIterator[str]: ...


class FakeLLM(LLMProvider):
    """프롬프트 키워드 기반 고정 JSON. docs/ai-pipeline.md 스키마와 일치."""

    async def generate_json(self, system: str, user: str, schema_hint: str) -> dict:
        blob = f"{system}\n{user}\n{schema_hint}".lower()
        if "review" in blob:
            return {"issues": [], "newItems": []}
        # default: summary 스키마
        return {
            "summary": "[fake] 회차 요약 더미",
            "characters": {"existing": [], "new": []},
            "newTerms": [],
            "foreshadowingCandidates": [],
        }

    async def generate_stream(self, system: str, user: str) -> AsyncIterator[str]:
        text = "[fake draft] 이 문장은 SSAFY GMS 키 발급 전 테스트용 더미 스트림입니다."
        for i in range(0, len(text), 2):
            yield text[i : i + 2]


class AnthropicLLM(LLMProvider):
    """SSAFY GMS 키 발급 후 구현 예정."""

    def __init__(self, api_key: str, sonnet_model: str, haiku_model: str) -> None:
        self._api_key = api_key
        self._sonnet_model = sonnet_model
        self._haiku_model = haiku_model

    async def generate_json(self, system: str, user: str, schema_hint: str) -> dict:
        raise NotImplementedError("SSAFY GMS 키 발급 후 활성화")

    async def generate_stream(self, system: str, user: str) -> AsyncIterator[str]:
        raise NotImplementedError("SSAFY GMS 키 발급 후 활성화")
        yield  # pragma: no cover — AsyncIterator 타입 유지용
