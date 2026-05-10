"""MCP 도구: cross-episode 분석 (Phase 4 §A-1).

3 도구:
- track_foreshadow : episode_summary.foreshadow_planted / foreshadow_paid_off 회차 매칭
- character_arc    : 인물의 회차별 등장 + 톤·핵심 사건 시계열
- timeline_scan    : 회차별 시간 흐름 + cliffhanger 시계열

모두 ctx.work_id + ctx.writer_id 격리 + episode 의 sort_order 정렬.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.decrypt_resolver import DecryptResolverError, decrypt_rows


async def _decrypt_summary_text(work_id, rows: list[dict], fields: list[str]) -> list[dict]:
    """summary 텍스트 필드 일괄 복호화. 실패 시 placeholder."""
    if not rows or not fields:
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


async def track_foreshadow(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    name: str | None = None,
) -> list[dict[str, Any]]:
    """복선 추적. planted 회차와 paid_off 회차를 짝지어 반환.

    회수 안 된 복선(paid_off=NULL)을 검수에 활용.
    name 지정 시 해당 이름 매칭만, 미지정 시 전체 작품 복선.
    """
    sql = (
        "WITH planted AS ("
        "  SELECT ep.id AS episode_id, ep.sort_order AS planted_sort, "
        "         fp.value->>'name' AS name, fp.value->>'description' AS description "
        "  FROM episode_summary es "
        "  JOIN episode ep ON ep.id = es.episode_id "
        "  CROSS JOIN LATERAL jsonb_array_elements(coalesce(es.foreshadow_planted,'[]'::jsonb)) fp "
        "  WHERE es.work_id = :wid AND es.writer_id = :wr "
        "), paid AS ("
        "  SELECT ep.id AS episode_id, ep.sort_order AS paid_sort, "
        "         CASE WHEN jsonb_typeof(fo.value)='string' THEN fo.value#>>'{}' "
        "              ELSE fo.value->>'name' END AS name "
        "  FROM episode_summary es "
        "  JOIN episode ep ON ep.id = es.episode_id "
        "  CROSS JOIN LATERAL jsonb_array_elements(coalesce(es.foreshadow_paid_off,'[]'::jsonb)) fo "
        "  WHERE es.work_id = :wid AND es.writer_id = :wr "
        ") "
        "SELECT planted.episode_id AS planted_episode_id, "
        "       planted.planted_sort, planted.name, planted.description, "
        "       (SELECT min(paid_sort) FROM paid WHERE paid.name = planted.name "
        "         AND paid.paid_sort >= planted.planted_sort) AS paid_off_sort, "
        "       (SELECT episode_id FROM paid WHERE paid.name = planted.name "
        "         AND paid.paid_sort >= planted.planted_sort "
        "         ORDER BY paid_sort ASC LIMIT 1) AS paid_off_episode_id "
        "FROM planted "
        + ("WHERE planted.name = :name " if name else "")
        + "ORDER BY planted.planted_sort ASC"
    )
    params: dict[str, Any] = {"wid": ctx.work_id, "wr": ctx.writer_id}
    if name:
        params["name"] = name
    r = await session.execute(sa_text(sql), params)
    return [
        {
            "planted_episode_id": str(row[0]) if row[0] else None,
            "planted_sort": row[1],
            "name": row[2],
            "description": row[3],
            "paid_off_sort": row[4],
            "paid_off_episode_id": str(row[5]) if row[5] else None,
            "is_resolved": row[4] is not None,
        }
        for row in r.fetchall()
    ]


async def character_arc(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    name: str,
    start_sort: int | None = None,
    end_sort: int | None = None,
) -> list[dict[str, Any]]:
    """특정 인물의 회차별 변화 추적.

    present_characters @> [name] 조건으로 해당 인물 등장 회차만 추출.
    sort_order 별 tone / pov_여부 / key_events 시계열 반환.
    """
    where = [
        "es.work_id = :wid",
        "es.writer_id = :wr",
        "es.present_characters @> jsonb_build_array(:name)",
    ]
    params: dict[str, Any] = {"wid": ctx.work_id, "wr": ctx.writer_id, "name": name}
    if start_sort is not None:
        where.append("ep.sort_order >= :s")
        params["s"] = start_sort
    if end_sort is not None:
        where.append("ep.sort_order <= :e")
        params["e"] = end_sort

    sql = (
        "SELECT ep.id, ep.sort_order, es.oneline_summary, es.tone, "
        "       (es.pov_character = :name) AS is_pov, es.key_events, es.cliffhanger "
        "FROM episode_summary es "
        "JOIN episode ep ON ep.id = es.episode_id "
        f"WHERE {' AND '.join(where)} "
        "ORDER BY ep.sort_order ASC"
    )
    r = await session.execute(sa_text(sql), params)
    rows = [
        {
            "episode_id": str(row[0]),
            "sort_order": row[1],
            "oneline_summary": row[2],
            "tone": row[3],
            "is_pov": bool(row[4]),
            "key_events": row[5],
            "cliffhanger": row[6],
        }
        for row in r.fetchall()
    ]
    # tone 평문 / oneline_summary, cliffhanger 암호화 → 후자만 복호화
    return await _decrypt_summary_text(ctx.work_id, rows, ["oneline_summary", "cliffhanger"])


async def timeline_scan(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    start_sort: int | None = None,
    end_sort: int | None = None,
) -> list[dict[str, Any]]:
    """회차별 시간 흐름·끝점만 추출. 시간선 일관성 검수용."""
    where = ["es.work_id = :wid", "es.writer_id = :wr"]
    params: dict[str, Any] = {"wid": ctx.work_id, "wr": ctx.writer_id}
    if start_sort is not None:
        where.append("ep.sort_order >= :s")
        params["s"] = start_sort
    if end_sort is not None:
        where.append("ep.sort_order <= :e")
        params["e"] = end_sort

    sql = (
        "SELECT ep.id, ep.sort_order, es.oneline_summary, es.time_progression, es.cliffhanger "
        "FROM episode_summary es "
        "JOIN episode ep ON ep.id = es.episode_id "
        f"WHERE {' AND '.join(where)} "
        "ORDER BY ep.sort_order ASC"
    )
    r = await session.execute(sa_text(sql), params)
    rows = [
        {
            "episode_id": str(row[0]),
            "sort_order": row[1],
            "oneline_summary": row[2],
            "time_progression": row[3],
            "cliffhanger": row[4],
        }
        for row in r.fetchall()
    ]
    return await _decrypt_summary_text(
        ctx.work_id, rows, ["oneline_summary", "time_progression", "cliffhanger"]
    )
