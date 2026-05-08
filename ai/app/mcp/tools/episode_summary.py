"""MCP 도구: episode_summary 기반 회차 메타 탐색.

4 도구 — list_all / list / get / search.
모든 도구는 ctx.work_id + ctx.writer_id 격리 조건을 SQL WHERE 에 강제.
episode 테이블의 sort_order 를 조인하여 회차 순서대로 정렬.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.decrypt_resolver import DecryptResolverError, decrypt_rows
from app.services.encrypt_resolver import summary_text_fields


async def _decrypt_summary_rows(work_id, rows: list[dict]) -> list[dict]:
    """summary 텍스트 필드 일괄 복호화 헬퍼. 실패 시 placeholder 로 대체."""
    if not rows:
        return rows
    fields = [f for f in summary_text_fields() if any(f in r for r in rows)]
    if not fields:
        return rows
    try:
        return await decrypt_rows(work_id, rows, fields)
    except DecryptResolverError:
        for r in rows:
            for f in fields:
                v = r.get(f)
                if isinstance(v, str) and v.startswith("v1:"):
                    r[f] = "(암호화 미해제)"
        return rows


# ============================================================
# 0) list_all_oneline_summaries — 작품 전체 흐름 1회 호출 (Phase 3 R-J)
# ============================================================


async def list_all_oneline_summaries(
    session: AsyncSession,
    ctx: WriterContext,
) -> list[dict[str, Any]]:
    """작품 전체 회차의 oneline_summary 만 sort_order 순서로 반환.

    토큰 효율: 회차당 ~45 tok × 300화 = ~13.5K tok (agent context 1회 진입에 충분).
    상세 필요 시 list_episode_summaries / get_episode_summary 로 drill-down.
    """
    sql = (
        "SELECT ep.sort_order, es.oneline_summary, es.pov_character, es.tone "
        "FROM episode_summary es "
        "JOIN episode ep ON ep.id = es.episode_id "
        "WHERE es.work_id = :wid AND es.writer_id = :wr "
        "ORDER BY ep.sort_order ASC"
    )
    r = await session.execute(
        sa_text(sql),
        {"wid": ctx.work_id, "wr": ctx.writer_id},
    )
    rows = [
        {
            "sort_order": row[0],
            "oneline_summary": row[1],
            "pov_character": row[2],
            "tone": row[3],
        }
        for row in r.fetchall()
    ]
    return await _decrypt_summary_rows(ctx.work_id, rows)


# ============================================================
# 1) list_episode_summaries — 범위 회차 요약 목록
# ============================================================

LIST_FIELDS = (
    "ep.sort_order, es.oneline_summary, es.pov_character, es.tone, "
    "es.present_characters, es.cliffhanger"
)


async def list_episode_summaries(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    start_sort: int | None = None,
    end_sort: int | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[dict[str, Any]]:
    where = ["es.work_id = :wid", "es.writer_id = :wr"]
    params: dict[str, Any] = {
        "wid": ctx.work_id,
        "wr": ctx.writer_id,
        "limit": min(limit, 100),
        "offset": max(offset, 0),
    }
    if start_sort is not None:
        where.append("ep.sort_order >= :start_sort")
        params["start_sort"] = start_sort
    if end_sort is not None:
        where.append("ep.sort_order <= :end_sort")
        params["end_sort"] = end_sort

    sql = (
        f"SELECT {LIST_FIELDS} "
        "FROM episode_summary es "
        "JOIN episode ep ON ep.id = es.episode_id "
        f"WHERE {' AND '.join(where)} "
        "ORDER BY ep.sort_order ASC "
        "LIMIT :limit OFFSET :offset"
    )
    r = await session.execute(sa_text(sql), params)
    rows = [
        {
            "sort_order": row[0],
            "oneline_summary": row[1],
            "pov_character": row[2],
            "tone": row[3],
            "present_characters": row[4],
            "cliffhanger": row[5],
        }
        for row in r.fetchall()
    ]
    return await _decrypt_summary_rows(ctx.work_id, rows)


# ============================================================
# 2) get_episode_summary — 단건 상세 (sort_order 기준)
# ============================================================

DETAIL_FIELDS = (
    "ep.sort_order, ep.title, "
    "es.oneline_summary, es.summary, es.pov_character, "
    "es.present_characters, es.present_locations, es.key_events, "
    "es.time_progression, es.tone, es.cliffhanger, "
    "es.foreshadow_planted, es.foreshadow_paid_off, es.referenced_world_notes, "
    "es.keywords, es.word_count, es.is_confirmed"
)


async def get_episode_summary(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    sort_order: int,
) -> dict[str, Any] | None:
    sql = (
        f"SELECT {DETAIL_FIELDS} "
        "FROM episode_summary es "
        "JOIN episode ep ON ep.id = es.episode_id "
        "WHERE es.work_id = :wid AND es.writer_id = :wr AND ep.sort_order = :sort_order "
        "LIMIT 1"
    )
    r = await session.execute(
        sa_text(sql),
        {"wid": ctx.work_id, "wr": ctx.writer_id, "sort_order": sort_order},
    )
    row = r.fetchone()
    if row is None:
        return None
    out = {
        "sort_order": row[0],
        "title": row[1],
        "oneline_summary": row[2],
        "summary": row[3],
        "pov_character": row[4],
        "present_characters": row[5],
        "present_locations": row[6],
        "key_events": row[7],
        "time_progression": row[8],
        "tone": row[9],
        "cliffhanger": row[10],
        "foreshadow_planted": row[11],
        "foreshadow_paid_off": row[12],
        "referenced_world_notes": row[13],
        "keywords": row[14],
        "word_count": row[15],
        "is_confirmed": row[16],
    }
    decrypted = await _decrypt_summary_rows(ctx.work_id, [out])
    return decrypted[0]


# ============================================================
# 3) search_episode_summaries — FTS + JSONB containment 결합 검색
# ============================================================
#
# scope 형식:
#   "all"               — FTS only (default)
#   "character:<name>"  — FTS + present_characters @> '["<name>"]'
#   "location:<name>"   — FTS + present_locations  @> '["<name>"]'
#   "tone:<name>"       — FTS + tone = '<name>' (정확 매칭)


async def search_episode_summaries(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    keyword: str,
    scope: str = "all",
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Phase 4.6 — Option A: scope JSONB/평문 SQL 1차 필터 → batch 복호화 → Python substring 2차 필터.

    summary_tsv 가 암호화로 무의미해진 후 PostgreSQL FTS 대신 application-side 검색.
    부분문자열 매칭이라 어형 변화 (예: "발견"으로 "발견하다"·"발견했다") 도 hit.
    """
    where = ["es.work_id = :wid", "es.writer_id = :wr"]
    params: dict[str, Any] = {
        "wid": ctx.work_id,
        "wr": ctx.writer_id,
        "limit": min(limit * 5, 300),    # 1차 필터 후보 폭 — Python 단계 substring 매칭으로 좁힘
    }

    # scope 파싱 — JSONB containment 또는 평문 컬럼 매칭 (모두 SQL 인덱스 hit 가능)
    if scope and scope != "all" and ":" in scope:
        kind, value = scope.split(":", 1)
        value = value.strip()
        if kind == "character" and value:
            where.append("es.present_characters @> jsonb_build_array(:scope_val)")
            params["scope_val"] = value
        elif kind == "location" and value:
            where.append("es.present_locations @> jsonb_build_array(:scope_val)")
            params["scope_val"] = value
        elif kind == "tone" and value:
            where.append("es.tone = :scope_val")
            params["scope_val"] = value
        # 알 수 없는 kind 는 무시 (scope=all 동작)

    # SELECT 시 keyword fallback 매칭에 필요한 모든 컬럼 fetch
    # (자유형 텍스트는 ciphertext 가능, JSONB 는 평문)
    sql = (
        "SELECT ep.sort_order, es.oneline_summary, es.pov_character, es.tone, "
        "       es.present_characters, es.cliffhanger, es.summary, "
        "       es.present_locations, es.key_events, es.keywords "
        "FROM episode_summary es "
        "JOIN episode ep ON ep.id = es.episode_id "
        f"WHERE {' AND '.join(where)} "
        "ORDER BY ep.sort_order ASC "
        "LIMIT :limit"
    )
    r = await session.execute(sa_text(sql), params)
    rows = [
        {
            "sort_order": row[0],
            "oneline_summary": row[1],     # ciphertext 가능
            "pov_character": row[2],       # 평문
            "tone": row[3],                # 평문
            "present_characters": row[4],  # JSONB 평문
            "cliffhanger": row[5],         # ciphertext 가능
            "summary": row[6],             # ciphertext 가능
            "present_locations": row[7],   # JSONB 평문
            "key_events": row[8],          # JSONB 평문
            "keywords": row[9],            # JSONB 평문
        }
        for row in r.fetchall()
    ]
    if not rows:
        return rows

    # Batch 복호화 — oneline_summary / summary / cliffhanger 평문화
    decrypted = await _decrypt_summary_rows(ctx.work_id, rows)

    # Python substring 매칭 (Option A). keyword 정규화 — 대소문자 무시 + 공백 trim
    kw = keyword.strip().lower()
    if not kw:
        # keyword 비었으면 scope 필터만 적용된 결과 반환
        return [
            {k: v for k, v in r.items() if k != "summary"}    # summary 본문은 list 도구에서 노출 X
            for r in decrypted[: min(limit, 50)]
        ]

    def _match(row: dict) -> bool:
        for fname in ("oneline_summary", "summary", "cliffhanger", "tone", "pov_character"):
            v = row.get(fname)
            if isinstance(v, str) and kw in v.lower():
                return True
        # JSONB 평문 — 직렬화 후 substring 매칭 (단순)
        for fname in ("present_characters", "present_locations", "key_events", "keywords"):
            v = row.get(fname)
            if v is not None and kw in str(v).lower():
                return True
        return False

    hits = [r for r in decrypted if _match(r)]
    # 반환은 list 도구 형식 (summary 본문 제외) — list_episode_summaries 와 동일 구조
    return [
        {k: v for k, v in r.items() if k != "summary"}
        for r in hits[: min(limit, 50)]
    ]
