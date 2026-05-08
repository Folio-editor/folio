"""MCP 도구: 에피소드 청크 벡터 유사도 검색 + Haiku 합성."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.providers import get_embedder, get_llm


async def search_episode_chunks(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    query: str,
    k: int = 5,
) -> list[dict]:
    embedder = get_embedder()
    vecs = await embedder.embed_batch([query])
    if not vecs:
        return []

    vec_str = "[" + ",".join(str(v) for v in vecs[0]) + "]"

    r = await session.execute(
        sa_text(
            "SELECT content, 1 - (embedding <=> cast(:vec AS vector)) AS similarity "
            "FROM episode_chunk "
            "WHERE work_id = :wid AND writer_id = :wr "
            "ORDER BY embedding <=> cast(:vec AS vector) "
            "LIMIT :k"
        ),
        {"vec": vec_str, "wid": ctx.work_id, "wr": ctx.writer_id, "k": k},
    )
    return [
        {"content": row[0], "similarity": round(float(row[1]), 4)}
        for row in r.fetchall()
    ]


_QUERY_SYSTEM = (
    "당신은 작품 회차 본문 chunks 에서 질의에 대한 답을 합성하는 worker 입니다. "
    "주어진 chunks 에 명시된 내용만 사용하고, chunks 에 없는 사실을 만들지 마세요. "
    "여러 회차 / chunk 가 모순되면 그대로 두 진술을 모두 보고하세요. "
    "JSON 의 answer 필드에 핵심만 담아 반환합니다."
)


async def query_episodes_by_chunks(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    query: str,
    k: int = 10,
    sort_order_min: int | None = None,
    sort_order_max: int | None = None,
) -> dict[str, Any]:
    """벡터 검색으로 query 와 가장 유사한 회차 chunk N개를 찾아 Haiku 가 답변 합성.

    300화 같은 대량 작품에서 회차마다 fetch + analyze 안 하고도 query 에 대한 답 가능.
    chunk 자체가 청킹·임베딩 단계 (chunk_and_embed_task) 에서 자동 생성된 본문 조각.

    절차:
      1. embedder 로 query → 벡터
      2. episode_chunk + episode JOIN — sort_order 범위 필터 (선택)
      3. cosine 유사도 top-k chunks
      4. Haiku 가 chunks 받아 answer 합성 (Sonnet 대신)

    비용 (k=10 기준):
      - 임베딩 1회 (text-embedding-3-small) ~$0.00002
      - Haiku in 5~10K + out 1K ~10 크레딧
      - Sonnet 은 압축된 answer (~1K) 만 받음

    반환: {query, matched_chunks: [..], answer: str, episodes: [sort_order...], usage}
    """
    embedder = get_embedder()
    vecs = await embedder.embed_batch([query])
    if not vecs:
        return {"error": "embedding_failed"}
    vec_str = "[" + ",".join(str(v) for v in vecs[0]) + "]"

    where = ["ec.work_id = :wid", "ec.writer_id = :wr"]
    params: dict[str, Any] = {
        "vec": vec_str,
        "wid": ctx.work_id,
        "wr": ctx.writer_id,
        "k": min(max(int(k), 1), 30),
    }
    if sort_order_min is not None:
        where.append("ep.sort_order >= :smin")
        params["smin"] = sort_order_min
    if sort_order_max is not None:
        where.append("ep.sort_order <= :smax")
        params["smax"] = sort_order_max

    sql = (
        "SELECT ec.content, ep.sort_order, "
        "       1 - (ec.embedding <=> cast(:vec AS vector)) AS similarity "
        "FROM episode_chunk ec "
        "JOIN episode ep ON ep.id = ec.episode_id "
        f"WHERE {' AND '.join(where)} "
        "ORDER BY ec.embedding <=> cast(:vec AS vector) "
        "LIMIT :k"
    )
    r = await session.execute(sa_text(sql), params)
    rows = r.fetchall()
    if not rows:
        return {
            "query": query,
            "matched_chunks": [],
            "answer": "검색 결과 없음 — 작품에 임베딩된 청크가 없거나 query 와 유사한 본문 부재. "
                      "chunk_and_embed_task 가 회차마다 자동 실행되지만 막 작성된 회차는 잠시 대기 필요.",
            "episodes": [],
            "usage": {"input_tokens": 0, "output_tokens": 0},
        }

    matched_chunks = [
        {
            "sort_order": row[1],
            "content": row[0],
            "similarity": round(float(row[2]), 4),
        }
        for row in rows
    ]
    episodes = sorted({c["sort_order"] for c in matched_chunks})

    # Haiku 합성
    llm = get_llm()
    haiku_model = getattr(llm, "_haiku_model", None)
    if haiku_model is None:
        # Fake provider — chunks 그대로 반환
        return {
            "query": query,
            "matched_chunks": matched_chunks,
            "answer": "(fake provider — Haiku 합성 생략)",
            "episodes": episodes,
            "usage": {"input_tokens": 0, "output_tokens": 0},
        }

    chunks_text = "\n---\n".join(
        f"[{c['sort_order']}화 chunk · sim={c['similarity']}]\n{c['content']}"
        for c in matched_chunks
    )
    user_prompt = f"[질의]\n{query}\n\n[검색된 chunks]\n{chunks_text}"
    try:
        result = await llm.generate_json(
            _QUERY_SYSTEM,
            user_prompt,
            '{"answer": "string — 질의에 대한 답"}',
            model_override=haiku_model,
            max_tokens=1500,
        )
    except Exception as e:
        return {
            "query": query,
            "matched_chunks": matched_chunks,
            "answer": None,
            "error": "haiku_synthesis_failed",
            "reason": str(e)[:200],
            "episodes": episodes,
        }

    usage = getattr(llm, "last_usage", {"input_tokens": 0, "output_tokens": 0})
    return {
        "query": query,
        "answer": result.get("answer") if isinstance(result, dict) else None,
        "matched_chunks_count": len(matched_chunks),
        "episodes": episodes,
        "usage": usage,
    }
