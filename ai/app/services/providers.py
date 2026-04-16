"""Provider 팩토리 — 환경변수 값에 따라 fake/real 인스턴스 반환.

태스크/엔드포인트 코드는 이 함수만 호출 → 구현 교체 시 env 한 줄만 변경.
"""

from __future__ import annotations

from app.config import settings
from app.services.embedder import EmbedderProvider, FakeEmbedder, OpenAIEmbedder
from app.services.llm import AnthropicLLM, FakeLLM, LLMProvider


def get_embedder() -> EmbedderProvider:
    provider = settings.embedding_provider.lower()
    if provider == "fake":
        return FakeEmbedder()
    if provider == "openai":
        return OpenAIEmbedder(
            api_key=settings.openai_api_key,
            model=settings.embedding_model,
        )
    raise ValueError(f"unknown EMBEDDING_PROVIDER: {provider}")


def get_llm() -> LLMProvider:
    provider = settings.llm_provider.lower()
    if provider == "fake":
        return FakeLLM()
    if provider == "anthropic":
        return AnthropicLLM(
            api_key=settings.anthropic_api_key,
            sonnet_model=settings.claude_sonnet_model,
            haiku_model=settings.claude_haiku_model,
        )
    raise ValueError(f"unknown LLM_PROVIDER: {provider}")
