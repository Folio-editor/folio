import pytest

from app.services.llm import FakeLLM


@pytest.mark.asyncio
async def test_summary_schema_keys():
    llm = FakeLLM()
    result = await llm.generate_json(
        system="summary prompt",
        user="episode body",
        schema_hint="summary schema",
    )
    assert set(result.keys()) == {
        "summary",
        "characters",
        "newTerms",
        "foreshadowingCandidates",
    }
    assert set(result["characters"].keys()) == {"existing", "new"}
    assert llm.last_usage == {"input_tokens": 0, "output_tokens": 0}


@pytest.mark.asyncio
async def test_review_schema_keys():
    llm = FakeLLM()
    result = await llm.generate_json(
        system="review prompt",
        user="review body",
        schema_hint="review schema",
    )
    assert set(result.keys()) == {"issues", "newItems"}
    assert llm.last_usage == {"input_tokens": 0, "output_tokens": 0}


@pytest.mark.asyncio
async def test_stream_yields_non_empty_chunks():
    llm = FakeLLM()
    chunks = [c async for c in llm.generate_stream("sys", "usr")]
    assert len(chunks) > 0
    assert all(isinstance(c, str) and len(c) > 0 for c in chunks)
    assert "".join(chunks).startswith("[fake draft]")
    assert llm.last_usage == {"input_tokens": 0, "output_tokens": 0}


@pytest.mark.asyncio
async def test_stream_accepts_model_override():
    llm = FakeLLM()
    chunks = [c async for c in llm.generate_stream("sys", "usr", model_override="opus")]
    assert len(chunks) > 0
    assert "".join(chunks).startswith("[fake draft]")
    assert llm.last_usage == {"input_tokens": 0, "output_tokens": 0}


@pytest.mark.asyncio
async def test_generate_with_tools_returns_review_shape():
    llm = FakeLLM()

    async def tool_executor(name: str, inputs: dict):
        return {"name": name, "inputs": inputs}

    result = await llm.generate_with_tools("sys", "usr", [], tool_executor)

    assert result == {
        "issues": [],
        "summary": "검수 결과 없음 (fake)",
        "score": 100,
    }
    assert llm.last_usage == {"input_tokens": 0, "output_tokens": 0}
