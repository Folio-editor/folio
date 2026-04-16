"""임베딩 Provider 인터페이스 + Fake/OpenAI 구현.

SSAFY GMS 키 발급 전까지 FakeEmbedder로 Phase 2 파이프라인 구조를 검증한다.
키 도착 후 OpenAIEmbedder 본체 구현 + EMBEDDING_PROVIDER=openai 전환.
"""

from __future__ import annotations

import hashlib
import math
import random
from abc import ABC, abstractmethod

EMBEDDING_DIM = 1536


class EmbedderProvider(ABC):
    @abstractmethod
    async def embed_batch(self, texts: list[str]) -> list[list[float]]: ...

    @property
    @abstractmethod
    def dimension(self) -> int: ...


class FakeEmbedder(EmbedderProvider):
    """결정적(deterministic) 더미 임베딩. 같은 텍스트 → 같은 벡터, L2 norm = 1."""

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
    """SSAFY GMS 키 발급 후 구현 예정."""

    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model

    @property
    def dimension(self) -> int:
        return EMBEDDING_DIM

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError("SSAFY GMS 키 발급 후 활성화")
