"""MCP 도구: cross-episode 분석 (Phase 4 §A-1).

3 도구:
- track_foreshadow : episode_summary.foreshadow_planted / foreshadow_paid_off 회차 매칭
- character_arc    : 인물의 회차별 등장 + 톤·핵심 사건 시계열
- timeline_scan    : 회차별 시간 흐름 + cliffhanger 시계열

모두 ctx.work_id + ctx.writer_id 격리. 외부 노출 식별자는 episode_id (UUID) 뿐 — 내부
DB 의 sort_order 는 정렬용으로만 사용, 반환 X.
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
) -> dict[str, Any]:
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
        "       planted.name, planted.description, "
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
    foreshadows = [
        {
            "planted_episode_id": str(row[0]) if row[0] else None,
            "name": row[1],
            "description": row[2],
            "paid_off_episode_id": str(row[3]) if row[3] else None,
            "is_resolved": row[3] is not None,
        }
        for row in r.fetchall()
    ]
    # ★ coverage 메타 제거 — list_all_oneline_summaries 에 동일 정보가 이미 있어 중복.
    # 한 turn 안에 4개 analytics 도구가 같은 메타를 반복 출력하던 ~1K chars 낭비 해소.
    # 사각지대 인지가 필요한 검수 상황은 list_all_oneline_summaries 호출 1회로 충분.
    return {
        "foreshadows": foreshadows,
    }


async def character_arc(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    name: str,
) -> dict[str, Any]:
    """특정 인물의 회차별 변화 추적. 시간 순 배열 반환 (배열 순서 = 시간 순).

    ★ oneline_summary 필드 제거 — list_all_oneline_summaries 에 이미 있어 중복 (회차당
    ~60 chars 절감). 본 도구는 인물 호 (tone/is_pov/key_events/cliffhanger) 에 집중.
    회차 흐름은 list_all_oneline_summaries 와 episode_id 로 cross-reference.
    """
    sql = (
        "SELECT ep.id, ep.title, es.tone, "
        "       (es.pov_character = :name) AS is_pov, es.key_events, es.cliffhanger "
        "FROM episode_summary es "
        "JOIN episode ep ON ep.id = es.episode_id "
        "WHERE es.work_id = :wid AND es.writer_id = :wr "
        "  AND es.present_characters @> jsonb_build_array(:name) "
        "ORDER BY ep.sort_order ASC"
    )
    r = await session.execute(
        sa_text(sql),
        {"wid": ctx.work_id, "wr": ctx.writer_id, "name": name},
    )
    rows = [
        {
            "episode_id": str(row[0]),
            "title": row[1],
            "tone": row[2],
            "is_pov": bool(row[3]),
            "key_events": row[4],
            "cliffhanger": row[5],
        }
        for row in r.fetchall()
    ]
    episodes = await _decrypt_summary_text(
        ctx.work_id, rows, ["title", "cliffhanger"]
    )
    # coverage 메타 제거 — list_all_oneline_summaries 의 메타로 충분.
    return {
        "character_name": name,
        "episodes": episodes,
    }


async def timeline_scan(
    session: AsyncSession,
    ctx: WriterContext,
) -> dict[str, Any]:
    """회차별 시간 흐름·끝점만 추출 (시간 순 배열). 시간선 일관성 검수용.

    ★ oneline_summary 필드 제거 — list_all_oneline_summaries 에 이미 있어 중복.
    회차 흐름은 list_all_oneline_summaries 와 episode_id 로 cross-reference.
    """
    sql = (
        "SELECT ep.id, ep.title, es.time_progression, es.cliffhanger "
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
            "episode_id": str(row[0]),
            "title": row[1],
            "time_progression": row[2],
            "cliffhanger": row[3],
        }
        for row in r.fetchall()
    ]
    episodes = await _decrypt_summary_text(
        ctx.work_id, rows, ["title", "time_progression", "cliffhanger"]
    )
    # coverage 메타 제거 — list_all_oneline_summaries 의 메타로 충분.
    return {
        "episodes": episodes,
    }
