import math

import pytest

from app.services.embedder import EMBEDDING_DIM, FakeEmbedder


@pytest.mark.asyncio
async def test_dimension_is_1536():
    emb = FakeEmbedder()
    [vec] = await emb.embed_batch(["hello"])
    assert len(vec) == EMBEDDING_DIM == 1536


@pytest.mark.asyncio
async def test_deterministic_same_input_same_vector():
    emb = FakeEmbedder()
    [v1] = await emb.embed_batch(["동일한 입력"])
    [v2] = await emb.embed_batch(["동일한 입력"])
    assert v1 == v2


@pytest.mark.asyncio
async def test_different_input_different_vector():
    emb = FakeEmbedder()
    [v1] = await emb.embed_batch(["입력 A"])
    [v2] = await emb.embed_batch(["입력 B"])
    assert v1 != v2


@pytest.mark.asyncio
async def test_l2_norm_is_approximately_one():
    emb = FakeEmbedder()
    [vec] = await emb.embed_batch(["norm check"])
    norm = math.sqrt(sum(v * v for v in vec))
    assert math.isclose(norm, 1.0, abs_tol=1e-9)


@pytest.mark.asyncio
async def test_batch_preserves_order_and_count():
    emb = FakeEmbedder()
    texts = ["a", "b", "c", "d"]
    vectors = await emb.embed_batch(texts)
    assert len(vectors) == 4
    # 순서 유지 검증: 개별 호출과 동일해야 함
    individuals = [(await emb.embed_batch([t]))[0] for t in texts]
    assert vectors == individuals
