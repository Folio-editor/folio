import pytest

from app.services.llm import FakeLLM


@pytest.mark.asyncio
async def test_summary_schema_keys():
    llm = FakeLLM()
    result = await llm.generate_json(
        system="요약 프롬프트",
        user="회차 본문 ...",
        schema_hint="summary schema",
    )
    assert set(result.keys()) == {
        "summary",
        "characters",
        "newTerms",
        "foreshadowingCandidates",
    }
    assert set(result["characters"].keys()) == {"existing", "new"}


@pytest.mark.asyncio
async def test_review_schema_keys():
    llm = FakeLLM()
    result = await llm.generate_json(
        system="review 프롬프트",
        user="검수 대상 원고",
        schema_hint="review schema",
    )
    assert set(result.keys()) == {"issues", "newItems"}


@pytest.mark.asyncio
async def test_stream_yields_non_empty_chunks():
    llm = FakeLLM()
    chunks = [c async for c in llm.generate_stream("sys", "usr")]
    assert len(chunks) > 0
    assert all(isinstance(c, str) and len(c) > 0 for c in chunks)
    assert "".join(chunks).startswith("[fake draft]")
