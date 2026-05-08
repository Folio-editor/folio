"""MCP 도구: 회차 본문 평문 fetch + 회차 메타 목록 + Haiku 매개 분석 (Phase 4.5).

- list_episodes : episode 테이블 직접 조회 — 요약 유무와 무관하게 모든 회차 노출
- fetch_episode_plaintext : 본문 평문 (Vault Transit 경유) — 재작성·인용 시
- analyze_episode : 본문 fetch + Haiku 가 task 별 추출 → 압축본만 반환 (Sonnet 절감)
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.decrypt_resolver import (
    DecryptResolverError,
    decrypt_rows,
)
from app.services.providers import get_llm
from app.services.work_key_resolver import (
    WorkKeyResolverError,
    resolve_episode_plaintext,
)


async def list_episodes(
    session: AsyncSession,
    ctx: WriterContext,
) -> list[dict[str, Any]]:
    """작품의 모든 회차 메타 (episode 테이블 직접). 요약 유무 무관.

    반환: [{sort_order, title, status, word_count, has_summary}].
    title 은 v1: 암호문이면 backend Vault 경유 복호화.
    """
    r = await session.execute(
        sa_text(
            "SELECT ep.id, ep.title, ep.status, ep.word_count, ep.sort_order, "
            "       (es.episode_id IS NOT NULL) AS has_summary "
            "FROM episode ep "
            "LEFT JOIN episode_summary es ON es.episode_id = ep.id "
            "WHERE ep.work_id = :wid AND ep.writer_id = :wr "
            "ORDER BY ep.sort_order ASC"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id},
    )
    rows = [
        {
            "id": str(row[0]),
            "title": row[1],
            "status": row[2],
            "word_count": row[3],
            "sort_order": row[4],
            "has_summary": bool(row[5]),
        }
        for row in r.fetchall()
    ]
    try:
        rows = await decrypt_rows(ctx.work_id, rows, ["title"])
    except DecryptResolverError:
        # 복호화 실패 — 회차 존재 자체는 alle 노출 (agent 가 '없다' 단정 못 하도록)
        for r in rows:
            t = r.get("title")
            if isinstance(t, str) and t.startswith("v1:"):
                r["title"] = "(제목 암호화 미해제)"
    # id 는 LLM 노출 불필요 (sort_order 로 충분)
    return [
        {k: v for k, v in r.items() if k != "id"}
        for r in rows
    ]


async def fetch_episode_plaintext(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    sort_order: int,
) -> dict[str, Any]:
    r = await session.execute(
        sa_text(
            "SELECT id, title FROM episode "
            "WHERE work_id = :wid AND writer_id = :wr AND sort_order = :so LIMIT 1"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id, "so": sort_order},
    )
    row = r.fetchone()
    if row is None:
        return {"error": "episode_not_found", "sort_order": sort_order}

    episode_id, title = row[0], row[1]
    try:
        content = await resolve_episode_plaintext(str(episode_id), str(ctx.work_id))
    except WorkKeyResolverError as e:
        return {"error": "no_plaintext", "reason": str(e), "sort_order": sort_order}

    return {
        "sort_order": sort_order,
        "title": title,
        "content": content,
        "word_count": len(content),
    }


_ANALYZE_SYSTEM = (
    "당신은 회차 본문 분석 worker 입니다. 주어진 task 에 따라 본문에서 핵심만 추출해 "
    "JSON 으로 반환합니다. 추측·확장 금지. 본문에 명시된 내용만."
)


async def analyze_episode(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    sort_order: int,
    task: str,
) -> dict[str, Any]:
    """회차 평문 fetch + Haiku 가 task 별 추출. Sonnet 비용 ~70% 절감.

    예시 task:
      - "등장 인물별 페르소나 (이름·성격·외형) 추출"
      - "이번 화 핵심 사건 시간순 정리"
      - "심어진 복선·회수된 복선 추출"

    Sonnet 은 raw 본문 대신 Haiku 압축본만 받음 → 토큰 누적 폭주 방지.
    """
    # 1) 본문 fetch (재사용)
    text_result = await fetch_episode_plaintext(session, ctx, sort_order=sort_order)
    if "error" in text_result:
        return text_result
    plaintext = text_result["content"]

    # 2) Haiku 분석
    llm = get_llm()
    haiku_model = getattr(llm, "_haiku_model", None)
    if haiku_model is None:
        # Fake provider — 평문 그대로 반환 (테스트 모드)
        return {
            "sort_order": sort_order,
            "title": text_result["title"],
            "task": task,
            "analysis": plaintext[:2000],
            "usage": {"input_tokens": 0, "output_tokens": 0},
        }
    user_prompt = (
        f"[task]\n{task}\n\n"
        f"[회차 {sort_order} — {text_result['title']}]\n{plaintext}"
    )
    schema_hint = '{"analysis": "object or string — task 결과만 담을 것"}'
    try:
        result = await llm.generate_json(
            _ANALYZE_SYSTEM,
            user_prompt,
            schema_hint,
            model_override=haiku_model,
            max_tokens=2000,
        )
    except Exception as e:
        return {"error": "haiku_analysis_failed", "reason": str(e)[:200]}

    usage = getattr(llm, "last_usage", {"input_tokens": 0, "output_tokens": 0})
    return {
        "sort_order": sort_order,
        "title": text_result["title"],
        "task": task,
        "analysis": result.get("analysis") if isinstance(result, dict) else result,
        "usage": usage,
        "word_count": len(plaintext),
    }
