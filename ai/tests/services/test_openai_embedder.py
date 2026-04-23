from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.services.embedder import EMBEDDING_DIM, OPENAI_BATCH_LIMIT, OpenAIEmbedder


def _make_embedding(value: float) -> list[float]:
    return [value] * EMBEDDING_DIM


def _make_client(create_fn):
    async def async_create(**kwargs):
        return create_fn(**kwargs)

    return SimpleNamespace(embeddings=SimpleNamespace(create=async_create))


@pytest.mark.asyncio
async def test_openai_embedder_returns_vectors_in_order():
    fake_response = SimpleNamespace(
        data=[
            SimpleNamespace(index=1, embedding=_make_embedding(1.0)),
            SimpleNamespace(index=0, embedding=_make_embedding(0.0)),
        ]
    )
    fake_client = _make_client(lambda **_: fake_response)

    with patch("app.services.embedder.AsyncOpenAI", return_value=fake_client):
        embedder = OpenAIEmbedder(api_key="test-key", model="text-embedding-3-small")
        vectors = await embedder.embed_batch(["안녕", "반가워"])

    assert len(vectors) == 2
    assert vectors[0][0] == 0.0
    assert vectors[1][0] == 1.0
    assert len(vectors[0]) == EMBEDDING_DIM


@pytest.mark.asyncio
async def test_openai_embedder_splits_large_batches():
    calls: list[int] = []

    def create(*, model: str, input: list[str]) -> SimpleNamespace:
        calls.append(len(input))
        return SimpleNamespace(
            data=[
                SimpleNamespace(index=index, embedding=_make_embedding(float(index)))
                for index, _ in enumerate(input)
            ]
        )

    fake_client = _make_client(create)
    texts = [f"text-{index}" for index in range(OPENAI_BATCH_LIMIT + 2)]

    with patch("app.services.embedder.AsyncOpenAI", return_value=fake_client):
        embedder = OpenAIEmbedder(api_key="test-key", model="text-embedding-3-small")
        vectors = await embedder.embed_batch(texts)

    assert calls == [OPENAI_BATCH_LIMIT, 2]
    assert len(vectors) == OPENAI_BATCH_LIMIT + 2


@pytest.mark.asyncio
async def test_openai_embedder_rejects_blank_input():
    fake_client = _make_client(lambda **_: None)

    with patch("app.services.embedder.AsyncOpenAI", return_value=fake_client):
        embedder = OpenAIEmbedder(api_key="test-key", model="text-embedding-3-small")
        with pytest.raises(ValueError):
            await embedder.embed_batch([""])
