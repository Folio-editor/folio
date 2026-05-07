"""MCP 도구: episode_summary 기반 회차 메타 탐색.

3 도구 — list / get / search.
모든 도구는 ctx.work_id + ctx.writer_id 격리 조건을 SQL WHERE 에 강제.
episode 테이블의 sort_order 를 조인하여 회차 순서대로 정렬.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext


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
    return [
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
    return {
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
    where = ["es.work_id = :wid", "es.writer_id = :wr"]
    params: dict[str, Any] = {
        "wid": ctx.work_id,
        "wr": ctx.writer_id,
        "kw": keyword,
        "limit": min(limit, 50),
    }

    # FTS — plainto_tsquery 는 keyword 안전 escaping 자동 처리
    where.append("es.summary_tsv @@ plainto_tsquery('simple', :kw)")

    # scope 파싱
    if scope and scope != "all":
        if ":" in scope:
            kind, value = scope.split(":", 1)
            value = value.strip()
            if kind == "character" and value:
                # JSONB 배열 containment — present_characters @> '["앤"]'::jsonb
                where.append("es.present_characters @> jsonb_build_array(:scope_val)")
                params["scope_val"] = value
            elif kind == "location" and value:
                where.append("es.present_locations @> jsonb_build_array(:scope_val)")
                params["scope_val"] = value
            elif kind == "tone" and value:
                where.append("es.tone = :scope_val")
                params["scope_val"] = value
            # 알 수 없는 kind 는 무시 (scope=all 동작)

    sql = (
        f"SELECT {LIST_FIELDS} "
        "FROM episode_summary es "
        "JOIN episode ep ON ep.id = es.episode_id "
        f"WHERE {' AND '.join(where)} "
        "ORDER BY ep.sort_order ASC "
        "LIMIT :limit"
    )
    r = await session.execute(sa_text(sql), params)
    return [
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
