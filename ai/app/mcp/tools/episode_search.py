"""MCP 도구: 에피소드 청크 벡터 유사도 검색 + Haiku 합성 + 회차-기준 관련성 탐색.

외부 식별자는 episode_id (UUID) 만. 내부 sort_order 는 정렬에만 사용.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.decrypt_resolver import DecryptResolverError, decrypt_rows
from app.services.providers import get_embedder, get_llm


async def _decrypt_chunk_content(work_id, rows: list[dict]) -> list[dict]:
    if not rows:
        return rows
    try:
        return await decrypt_rows(work_id, rows, ["content"])
    except DecryptResolverError:
        for r in rows:
            v = r.get("content")
            if isinstance(v, str) and v.startswith("v1:"):
                r["content"] = "(암호화 미해제)"
        return rows


async def find_relevant_episodes(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    reference_episode_id: str,
    k: int = 5,
    exclude_self: bool = True,
) -> dict[str, Any]:
    """기준 회차의 chunk 임베딩과 의미상 가까운 다른 회차 top-k 반환.

    DB-only — Haiku 호출 X. ~1 크레딧.
    반환: {reference_episode_id, top: [{id, title, max_sim, avg_sim, chunk_count}]}
    """
    capped_k = min(max(int(k), 1), 20)

    diag_sql = (
        "SELECT "
        "  (SELECT COUNT(*) FROM episode_chunk ec "
        "     WHERE ec.work_id = :wid AND ec.writer_id = :wr AND ec.episode_id = :ref) AS ref_chunks, "
        "  (SELECT COUNT(*) FROM episode_chunk ec "
        "     WHERE ec.work_id = :wid AND ec.writer_id = :wr "
        "       AND (NOT :excl OR ec.episode_id <> :ref)) AS other_chunks, "
        "  (SELECT ep_prev.id FROM episode_chunk ec "
        "     JOIN episode ep_prev ON ep_prev.id = ec.episode_id "
        "     JOIN episode ep_ref ON ep_ref.id = :ref "
        "     WHERE ec.work_id = :wid AND ec.writer_id = :wr "
        "       AND ep_prev.sort_order < ep_ref.sort_order "
        "     ORDER BY ep_prev.sort_order DESC LIMIT 1) AS prev_with_chunks_id"
    )
    diag = (await session.execute(
        sa_text(diag_sql),
        {"wid": ctx.work_id, "wr": ctx.writer_id, "ref": reference_episode_id, "excl": exclude_self},
    )).fetchone()
    ref_chunks = int(diag[0] or 0)
    other_chunks = int(diag[1] or 0)
    suggested_ref_id = str(diag[2]) if diag[2] is not None else None

    if ref_chunks == 0:
        return {
            "reference_episode_id": reference_episode_id,
            "top": [],
            "ref_chunks": 0,
            "other_chunks": other_chunks,
            "suggested_reference_episode_id": suggested_ref_id,
            "message": (
                f"기준 회차 episode_id={reference_episode_id} 본문이 비어있거나 임베딩 미생성. "
                + (
                    f"이전 임베딩된 회차 id={suggested_ref_id} 로 다시 호출하세요. "
                    if suggested_ref_id is not None
                    else "다른 회차들도 본문 없음 — list_episodes 의 word_count>0 회차로 reference 변경. "
                )
                + f"(다른 회차 chunk 총 {other_chunks}개)"
            ),
        }
    if other_chunks == 0:
        return {
            "reference_episode_id": reference_episode_id,
            "top": [],
            "ref_chunks": ref_chunks,
            "other_chunks": 0,
            "message": (
                f"기준 회차는 chunk {ref_chunks}개 있지만 다른 회차들은 모두 본문 없음. "
                "비교 대상 부재 — list_episodes 로 작성된 회차 확인."
            ),
        }

    sql = (
        "WITH ref AS ("
        "  SELECT ec.embedding FROM episode_chunk ec "
        "  WHERE ec.work_id = :wid AND ec.writer_id = :wr AND ec.episode_id = :ref"
        "), other AS ("
        "  SELECT ep.id AS episode_id, ep.title, "
        "         1 - (ec.embedding <=> ref.embedding) AS sim "
        "  FROM episode_chunk ec "
        "  JOIN episode ep ON ep.id = ec.episode_id "
        "  CROSS JOIN ref "
        "  WHERE ec.work_id = :wid AND ec.writer_id = :wr "
        "    AND (NOT :excl OR ec.episode_id <> :ref)"
        ") "
        "SELECT episode_id, title, "
        "       MAX(sim) AS max_sim, "
        "       AVG(sim) AS avg_sim, "
        "       COUNT(*) AS chunk_count "
        "FROM other "
        "GROUP BY episode_id, title "
        "ORDER BY max_sim DESC "
        "LIMIT :k"
    )
    r = await session.execute(
        sa_text(sql),
        {
            "wid": ctx.work_id,
            "wr": ctx.writer_id,
            "ref": reference_episode_id,
            "excl": exclude_self,
            "k": capped_k,
        },
    )
    rows = r.fetchall()
    if not rows:
        return {
            "reference_episode_id": reference_episode_id,
            "top": [],
            "ref_chunks": ref_chunks,
            "other_chunks": other_chunks,
            "message": "쿼리 결과 0 — 데이터 정합성 의심.",
        }
    top = [
        {
            "id": str(row[0]),
            "title": row[1],
            "max_sim": round(float(row[2]), 4),
            "avg_sim": round(float(row[3]), 4),
            "chunk_count": int(row[4]),
        }
        for row in rows
    ]
    try:
        top = await decrypt_rows(ctx.work_id, top, ["title"])
    except DecryptResolverError:
        for r in top:
            t = r.get("title")
            if isinstance(t, str) and t.startswith("v1:"):
                r["title"] = "(제목 암호화 미해제)"
    return {
        "reference_episode_id": reference_episode_id,
        "top": top,
    }


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
            "SELECT ep.id, ep.title, ec.content, "
            "       1 - (ec.embedding <=> cast(:vec AS vector)) AS similarity "
            "FROM episode_chunk ec "
            "JOIN episode ep ON ep.id = ec.episode_id "
            "WHERE ec.work_id = :wid AND ec.writer_id = :wr "
            "ORDER BY ec.embedding <=> cast(:vec AS vector) "
            "LIMIT :k"
        ),
        {"vec": vec_str, "wid": ctx.work_id, "wr": ctx.writer_id, "k": k},
    )
    rows = [
        {
            "episode_id": str(row[0]),
            "title": row[1],
            "content": row[2],
            "similarity": round(float(row[3]), 4),
        }
        for row in r.fetchall()
    ]
    return await _decrypt_chunk_content(ctx.work_id, rows)


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
) -> dict[str, Any]:
    """벡터 검색으로 query 와 가장 유사한 회차 chunk N개를 찾아 Haiku 가 답변 합성.

    회차 범위 필터는 제거됨 — 작품 전체 대상으로 검색. 필요 시 별도 도구로 분리.
    반환: {query, matched_chunks, answer, episodes: [{episode_id, title}], usage}
    """
    embedder = get_embedder()
    vecs = await embedder.embed_batch([query])
    if not vecs:
        return {"error": "embedding_failed"}
    vec_str = "[" + ",".join(str(v) for v in vecs[0]) + "]"

    sql = (
        "SELECT ep.id, ep.title, ec.content, "
        "       1 - (ec.embedding <=> cast(:vec AS vector)) AS similarity "
        "FROM episode_chunk ec "
        "JOIN episode ep ON ep.id = ec.episode_id "
        "WHERE ec.work_id = :wid AND ec.writer_id = :wr "
        "ORDER BY ec.embedding <=> cast(:vec AS vector) "
        "LIMIT :k"
    )
    r = await session.execute(
        sa_text(sql),
        {
            "vec": vec_str,
            "wid": ctx.work_id,
            "wr": ctx.writer_id,
            "k": min(max(int(k), 1), 30),
        },
    )
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
            "episode_id": str(row[0]),
            "title": row[1],
            "content": row[2],
            "similarity": round(float(row[3]), 4),
        }
        for row in rows
    ]
    matched_chunks = await _decrypt_chunk_content(ctx.work_id, matched_chunks)
    # 회차별 (id, title) 쌍 — 후속 propose_* 도구의 episode_id 인자에 사용
    seen: dict[str, str] = {}
    for c in matched_chunks:
        eid = c.get("episode_id")
        if isinstance(eid, str) and eid not in seen:
            seen[eid] = c.get("title")
    episodes = [{"episode_id": eid, "title": title} for eid, title in seen.items()]

    llm = get_llm()
    haiku_model = getattr(llm, "_haiku_model", None)
    if haiku_model is None:
        return {
            "query": query,
            "matched_chunks": matched_chunks,
            "answer": "(fake provider — Haiku 합성 생략)",
            "episodes": episodes,
            "usage": {"input_tokens": 0, "output_tokens": 0},
        }

    chunks_text = "\n---\n".join(
        f"[{c.get('title')} · sim={c['similarity']}]\n{c['content']}"
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
