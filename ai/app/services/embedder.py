"""임베딩 Provider 인터페이스 + Fake/OpenAI 구현."""

from __future__ import annotations

import hashlib
import math
import random
from abc import ABC, abstractmethod

try:
    from openai import AsyncOpenAI
except ImportError:  # pragma: no cover - optional runtime dependency
    AsyncOpenAI = None  # type: ignore[assignment]

EMBEDDING_DIM = 1536
OPENAI_BATCH_LIMIT = 2048


class EmbedderProvider(ABC):
    @abstractmethod
    async def embed_batch(self, texts: list[str]) -> list[list[float]]: ...

    @property
    @abstractmethod
    def dimension(self) -> int: ...


class FakeEmbedder(EmbedderProvider):
    """Deterministic fake embeddings for local flow validation."""

    @property
    def dimension(self) -> int:
        return EMBEDDING_DIM

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]

    @staticmethod
    def _embed_one(text: str) -> list[float]:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        seed = int.from_bytes(digest[:8], "big")
        rng = random.Random(seed)
        vec = [rng.gauss(0.0, 1.0) for _ in range(EMBEDDING_DIM)]
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]


class OpenAIEmbedder(EmbedderProvider):
    """OpenAI text-embedding-3-* 기반 구현."""

    def __init__(self, api_key: str, model: str) -> None:
        if AsyncOpenAI is None:
            raise RuntimeError("openai package is not installed.")
        self._model = model
        self._client = AsyncOpenAI(api_key=api_key)

    @property
    def dimension(self) -> int:
        return EMBEDDING_DIM

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        normalized_texts = [self._validate_text(text) for text in texts]
        results: list[list[float]] = []
        for start in range(0, len(normalized_texts), OPENAI_BATCH_LIMIT):
            batch = normalized_texts[start : start + OPENAI_BATCH_LIMIT]
            resp = await self._client.embeddings.create(
                model=self._model,
                input=batch,
            )
            data = sorted(resp.data, key=lambda item: item.index)
            results.extend([list(item.embedding) for item in data])
        return results

    @staticmethod
    def _validate_text(text: str) -> str:
        if not text or not text.strip():
            raise ValueError("Embedding input must not be empty.")
        return text
