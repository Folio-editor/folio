from __future__ import annotations

import os
from functools import lru_cache

from openai import OpenAI

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSION = 1536
OPENAI_BATCH_LIMIT = 2048


def embed_text(text: str) -> list[float]:
    """Convert a single text input into a 1536-dimension embedding."""
    normalized_text = _validate_text(text)
    client = _get_client()
    response = client.embeddings.create(model=EMBEDDING_MODEL, input=normalized_text)
    return list(response.data[0].embedding)


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts, splitting requests into OpenAI-sized batches."""
    if not texts:
        return []

    normalized_texts = [_validate_text(text) for text in texts]
    client = _get_client()
    embeddings: list[list[float]] = []

    for start in range(0, len(normalized_texts), OPENAI_BATCH_LIMIT):
        batch = normalized_texts[start:start + OPENAI_BATCH_LIMIT]
        response = client.embeddings.create(model=EMBEDDING_MODEL, input=batch)
        for item in sorted(response.data, key=lambda data: data.index):
            embeddings.append(list(item.embedding))

    return embeddings


def _validate_text(text: str) -> str:
    if not text or not text.strip():
        raise ValueError("Embedding input must not be empty.")
    return text


@lru_cache(maxsize=1)
def _get_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise EnvironmentError("OPENAI_API_KEY is not set.")
    return OpenAI(api_key=api_key)
