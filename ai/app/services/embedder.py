"""Embedding providers for fake and OpenAI-backed vector generation."""

from __future__ import annotations

import hashlib
import math
import random
from abc import ABC, abstractmethod

from openai import OpenAI

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
    """OpenAI embedding provider using text-embedding models."""

    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model
        self._client = OpenAI(api_key=api_key)

    @property
    def dimension(self) -> int:
        return EMBEDDING_DIM

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        normalized_texts = [self._validate_text(text) for text in texts]
        embeddings: list[list[float]] = []

        for start in range(0, len(normalized_texts), OPENAI_BATCH_LIMIT):
            batch = normalized_texts[start:start + OPENAI_BATCH_LIMIT]
            response = self._client.embeddings.create(model=self._model, input=batch)
            for item in sorted(response.data, key=lambda data: data.index):
                embeddings.append(list(item.embedding))

        return embeddings

    @staticmethod
    def _validate_text(text: str) -> str:
        if not text or not text.strip():
            raise ValueError("Embedding input must not be empty.")
        return text
