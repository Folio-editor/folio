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
from app.services.text_extractor import extract_plain_text
from app.services.work_key_resolver import (
    WorkKeyResolverError,
    resolve_episode_plaintext,
)


async def _decrypt_chunk_content(work_id, rows: list[dict]) -> list[dict]:
    """chunk 행의 content + title 일괄 복호화. 둘 다 v1: ciphertext 가능.

    title 도 복호화 — Haiku worker 가 chunks_text 헤더에서 회차 평문 라벨('12화', '17화')
    로 식별해 합성 정확도 향상. title 미복호화 시 v1: base64 가 헤더에 노출되어 Haiku 가
    chunk 출처 회차를 구분 못함.
    """
    if not rows:
        return rows
    fields = ["content"]
    if any("title" in r for r in rows):
        fields.append("title")
    try:
        return await decrypt_rows(work_id, rows, fields)
    except DecryptResolverError:
        for r in rows:
            for f in fields:
                v = r.get(f)
                if isinstance(v, str) and v.startswith("v1:"):
                    r[f] = "(암호화 미해제)" if f == "content" else "(제목 암호화 미해제)"
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
    task: str | None = None,
    k: int = 10,
    full_episode_count: int = 0,
) -> dict[str, Any]:
    """벡터 검색으로 chunk N개 → Haiku 가 task 지시에 따라 합성.

    ★ query 와 task 는 명확히 분리된 역할:
      - **query**: 임베딩 모델용 — chunk 와의 벡터 유사도 매칭만 담당. 본문 어휘에
        가까운 묘사·인물·사건 단어로 작성해야 sim ↑.
      - **task**: Haiku 합성 지시 — 검색된 chunks 를 받은 후 무엇을 추출/평가/판단할지.
        추상 메타 단어 OK ('일관성 평가', '모순 후보 탐색' 등 자유 분석 지시).

    task 미지정 시 query 를 그대로 합성 지시로 사용 (backward compat).

    Args:
      query: 본문 어휘 기반 검색어. 예: '가후 어머니 표정 가르치다 어린 시절 웃음'.
      task: Haiku 가 chunks 에서 수행할 작업 지시. 예: '가후의 감정 부재 설정이
        회차별로 일관되게 유지되는지 평가하고, 모순 정황을 인용해 정리해줘'.
      k: 검색 chunk 수 (기본 10, 상한 30).
      full_episode_count: top sim 회차 N개의 풀 본문 포함 (기본 0, 상한 3).
        chunk 잘림 문제 보완. 1~2 권장 (회차당 ~4K 토큰).

    반환: {query, task, matched_chunks_count, full_episodes_used, answer, episodes, usage}
    """
    full_episode_count = max(0, min(int(full_episode_count or 0), 3))
    task_text = (task or "").strip() or query    # task 없으면 query 로 fallback
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
    # 회차별 (id, title) 쌍 — 후속 propose_* 도구의 episode_id 인자에 사용.
    # 동시에 회차별 최고 sim 추적 — full_episode_count 우선순위에 사용.
    seen: dict[str, str] = {}
    episode_top_sim: dict[str, float] = {}
    for c in matched_chunks:
        eid = c.get("episode_id")
        if not isinstance(eid, str):
            continue
        if eid not in seen:
            seen[eid] = c.get("title")
        sim = c.get("similarity", 0.0)
        if eid not in episode_top_sim or sim > episode_top_sim[eid]:
            episode_top_sim[eid] = sim
    episodes = [{"episode_id": eid, "title": title} for eid, title in seen.items()]

    # 상위 sim 회차 N개의 풀 본문 fetch (옵션). chunk 잘림 문제 보완.
    # 본문 fetch 실패한 회차는 fallback — chunks 만 전달.
    full_episodes: list[dict[str, Any]] = []
    full_episode_ids: set[str] = set()
    if full_episode_count > 0:
        top_eids = sorted(
            episode_top_sim, key=lambda e: -episode_top_sim[e]
        )[:full_episode_count]
        for eid in top_eids:
            try:
                raw_body = await resolve_episode_plaintext(eid, str(ctx.work_id))
            except WorkKeyResolverError:
                continue
            if not raw_body:
                continue
            # ★ TipTap JSON → 평문 추출. resolve_episode_plaintext 는 TipTap doc 을 그대로
            # 반환하므로 그대로 Haiku 에 넣으면 {"type":"paragraph",...} wrapper 가 토큰의
            # 절반을 차지. 평문 추출 후 전달 — Haiku 입력 토큰 ~50% 절감.
            plain_body = extract_plain_text(raw_body)
            if not plain_body:
                continue
            full_episodes.append({
                "episode_id": eid,
                "title": seen.get(eid, "(제목 없음)"),
                "content": plain_body,
            })
            full_episode_ids.add(eid)

    llm = get_llm()
    haiku_model = getattr(llm, "_haiku_model", None)
    if haiku_model is None:
        return {
            "query": query,
            "matched_chunks": matched_chunks,
            "full_episodes": full_episodes,
            "answer": "(fake provider — Haiku 합성 생략)",
            "episodes": episodes,
            "usage": {"input_tokens": 0, "output_tokens": 0},
        }

    # Haiku 입력 구성 — full episode body 가 있는 회차는 chunk 중복 제거.
    # sim 값은 Haiku 합성에 도움 X — 부동소수 score 를 보면 가중치 추론 오류 유발 가능.
    # 회차 평문 title 만 헤더로 사용.
    chunks_for_prompt = [
        c for c in matched_chunks if c.get("episode_id") not in full_episode_ids
    ]
    sections: list[str] = []
    if full_episodes:
        full_text = "\n\n===\n\n".join(
            f"[{fe['title']} — 풀 본문]\n{fe['content']}"
            for fe in full_episodes
        )
        sections.append(f"[유사도 상위 회차 풀 본문]\n{full_text}")
    if chunks_for_prompt:
        chunks_text = "\n---\n".join(
            f"[{c.get('title')}]\n{c['content']}"
            for c in chunks_for_prompt
        )
        sections.append(f"[추가 관련 chunks]\n{chunks_text}")
    body_block = "\n\n".join(sections) if sections else "(컨텍스트 없음)"
    # Haiku 입력 — task 가 핵심 (수행 지시). query 는 벡터 검색용이라 합성 지시로는 부적합.
    # task 미지정 시 query 로 fallback (task_text 가 이미 처리).
    user_prompt = (
        f"[지시]\n{task_text}\n\n"
        f"[검색에 쓰인 query 단서]\n{query}\n\n"
        f"{body_block}"
    )
    try:
        result = await llm.generate_json(
            _QUERY_SYSTEM,
            user_prompt,
            '{"answer": "string — 질의에 대한 답"}',
            model_override=haiku_model,
            max_tokens=1500,
            cache_system=True,    # 같은 turn 안 multi-call 시 system 캐시 hit (5분 ephemeral)
        )
    except Exception as e:
        return {
            "query": query,
            "task": task_text,
            "matched_chunks": matched_chunks,
            "full_episodes": [
                {k: v for k, v in fe.items() if k != "content"}
                for fe in full_episodes
            ],
            "answer": None,
            "error": "haiku_synthesis_failed",
            "reason": str(e)[:200],
            "episodes": episodes,
        }

    usage = getattr(llm, "last_usage", {"input_tokens": 0, "output_tokens": 0})
    # full_episodes 본문은 결과 dict 에 다시 넣지 않음 — 이미 Haiku answer 로 합성됐고
    # 오케스트레이터 컨텍스트에 raw 본문 중복 적재하면 토큰 폭증. 식별자만 노출.
    return {
        "query": query,
        "task": task_text,
        "answer": result.get("answer") if isinstance(result, dict) else None,
        "matched_chunks_count": len(matched_chunks),
        "full_episodes_used": [
            {"episode_id": fe["episode_id"], "title": fe["title"]}
            for fe in full_episodes
        ],
        "episodes": episodes,
        "usage": usage,
    }
