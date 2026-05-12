"""MCP 도구: episode_summary 기반 회차 메타 탐색.

5 도구 — list_all / list / get / search + ensure_recent_summaries (inline backfill).
모든 도구는 ctx.work_id + ctx.writer_id 격리 조건을 SQL WHERE 에 강제.
episode 테이블의 sort_order 를 조인하여 회차 순서대로 정렬.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.decrypt_resolver import DecryptResolverError, decrypt_rows
from app.services.encrypt_resolver import summary_text_fields

logger = logging.getLogger(__name__)


async def get_summary_coverage(
    session: AsyncSession,
    ctx: WriterContext,
) -> dict[str, Any]:
    """현재 작품의 episode_summary 커버리지 메타.

    analytics 도구들(character_arc/timeline_scan/track_foreshadow)과
    list_*_summaries 류는 모두 episode_summary 행이 존재하는 회차만 결과에 포함한다.
    → 요약 안 된 회차는 silent하게 누락 → 모델이 "데이터 부재"를 "발견 없음"으로
    오해할 위험. 이 함수가 반환하는 coverage 를 결과 dict 에 동봉하면 모델이
    즉시 사각지대를 인지하고 summarize_episode 호출/재시도 판단 가능.

    Returns:
      {
        "summarized_count": N,
        "total_episode_count": M,
        "missing_summary_episode_ids": [...],   # status != 'trashed' 중 요약 없는 회차
        "coverage_complete": bool,
      }
    """
    r = await session.execute(
        sa_text(
            "SELECT ep.id, "
            "       CASE WHEN es.episode_id IS NULL THEN 0 ELSE 1 END as has_summary "
            "FROM episode ep "
            "LEFT JOIN episode_summary es "
            "       ON es.episode_id = ep.id AND es.work_id = ep.work_id "
            "WHERE ep.work_id = :wid AND ep.writer_id = :wr AND ep.status != 'trashed' "
            "ORDER BY ep.sort_order ASC"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id},
    )
    rows = r.fetchall()
    summarized = sum(1 for row in rows if row[1])
    total = len(rows)
    missing = [str(row[0]) for row in rows if not row[1]]
    return {
        "summarized_count": summarized,
        "total_episode_count": total,
        "missing_summary_episode_ids": missing,
        "coverage_complete": (total > 0 and len(missing) == 0),
    }


def _coverage_note(coverage: dict[str, Any]) -> str:
    """coverage dict 을 모델 친화적 한 줄 안내로 변환."""
    s = coverage["summarized_count"]
    t = coverage["total_episode_count"]
    m = len(coverage["missing_summary_episode_ids"])
    if m == 0:
        return f"요약 커버리지 완전 ({s}/{t})."
    return (
        f"[경고] 요약 커버리지 불완전 ({s}/{t}) — 미요약 회차 {m}건이 본 결과에 포함되지 않음. "
        "검수·시간선·복선 분석 사각지대 발생. 필요 시 summarize_episode 로 백필 후 재호출. "
        "missing_summary_episode_ids 참조."
    )


async def _decrypt_summary_rows(work_id, rows: list[dict]) -> list[dict]:
    """summary 텍스트 필드 + episode title 일괄 복호화 헬퍼. 실패 시 placeholder."""
    if not rows:
        return rows
    fields = [f for f in summary_text_fields() if any(f in r for r in rows)]
    # title 은 episode 테이블의 v1: 컬럼 (summary 가 아닌 episode 쪽). 함께 복호화 대상.
    if any("title" in r for r in rows):
        fields = list(fields) + ["title"]
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
) -> dict[str, Any]:
    """작품 전체 회차의 oneline_summary 만 시간 순으로 반환 + coverage 메타.

    episodes 배열 순서가 시간 순 (내부 sort_order 로 정렬되지만 외부엔 노출 X).
    coverage 메타로 미요약 회차 사각지대 즉시 인지 가능 — 결과에 없는 회차 = 미요약.
    상세 필요 시 get_episode_summary(episode_id) 로 drill-down.
    """
    sql = (
        "SELECT ep.id, ep.title, es.oneline_summary, es.pov_character, es.tone "
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
            "id": str(row[0]),
            "title": row[1],
            "oneline_summary": row[2],
            "pov_character": row[3],
            "tone": row[4],
        }
        for row in r.fetchall()
    ]
    episodes = await _decrypt_summary_rows(ctx.work_id, rows)
    coverage = await get_summary_coverage(session, ctx)
    return {
        "episodes": episodes,
        **coverage,
        "note": _coverage_note(coverage),
    }


# ============================================================
# 1) list_episode_summaries — 범위 회차 요약 목록
# ============================================================

LIST_FIELDS = (
    "ep.id, ep.title, "
    "es.oneline_summary, es.pov_character, es.tone, "
    "es.present_characters, es.cliffhanger"
)


async def list_episode_summaries(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    """요약 목록 (시간 순) + coverage 메타. 페이지네이션은 limit/offset 기반.
    범위 검색은 search_episode_summaries 사용.
    """
    sql = (
        f"SELECT {LIST_FIELDS} "
        "FROM episode_summary es "
        "JOIN episode ep ON ep.id = es.episode_id "
        "WHERE es.work_id = :wid AND es.writer_id = :wr "
        "ORDER BY ep.sort_order ASC "
        "LIMIT :limit OFFSET :offset"
    )
    r = await session.execute(
        sa_text(sql),
        {
            "wid": ctx.work_id,
            "wr": ctx.writer_id,
            "limit": min(limit, 100),
            "offset": max(offset, 0),
        },
    )
    rows = [
        {
            "id": str(row[0]),
            "title": row[1],
            "oneline_summary": row[2],
            "pov_character": row[3],
            "tone": row[4],
            "present_characters": row[5],
            "cliffhanger": row[6],
        }
        for row in r.fetchall()
    ]
    episodes = await _decrypt_summary_rows(ctx.work_id, rows)
    coverage = await get_summary_coverage(session, ctx)
    return {
        "episodes": episodes,
        "limit": min(limit, 100),
        "offset": max(offset, 0),
        **coverage,
        "note": _coverage_note(coverage),
    }


# ============================================================
# 2) get_episode_summary — 단건 상세 (sort_order 기준)
# ============================================================

DETAIL_FIELDS = (
    "ep.id, ep.title, "
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
    episode_id: str,
) -> dict[str, Any] | None:
    sql = (
        f"SELECT {DETAIL_FIELDS} "
        "FROM episode_summary es "
        "JOIN episode ep ON ep.id = es.episode_id "
        "WHERE es.work_id = :wid AND es.writer_id = :wr AND ep.id = :eid "
        "LIMIT 1"
    )
    r = await session.execute(
        sa_text(sql),
        {"wid": ctx.work_id, "wr": ctx.writer_id, "eid": episode_id},
    )
    row = r.fetchone()
    if row is None:
        return None
    out = {
        "id": str(row[0]),
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
        "SELECT ep.id, ep.title, "
        "       es.oneline_summary, es.pov_character, es.tone, "
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
            "id": str(row[0]),
            "title": row[1],
            "oneline_summary": row[2],
            "pov_character": row[3],
            "tone": row[4],
            "present_characters": row[5],
            "cliffhanger": row[6],
            "summary": row[7],
            "present_locations": row[8],
            "key_events": row[9],
            "keywords": row[10],
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


# ============================================================
# 5) ensure_recent_summaries — 대상 직전 N화 inline 백필
# ============================================================


async def ensure_recent_summaries(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    target_episode_id: str,
    max_count: int = 3,
) -> dict[str, Any]:
    """대상 회차 직전 N화의 요약을 inline 백필 (synchronous).

    검수/작성 시작 시 직전 컨텍스트 확보용. summarize_episode 를 호출하여 누락된
    요약을 즉시 생성한다. 회차당 Haiku 1회 비용 발생 — 호출자가 비용 인지해야 함.
    캐시 hit (이미 요약된 회차)은 Haiku 0회 (already_summarized 목록).

    Args:
      target_episode_id: 검수/작성 대상 회차 UUID.
      max_count: 직전 몇 화까지 백필 검토 (기본 3, 상한 3). 비용 폭주 방지.

    Returns:
      {
        target_episode_id, target_index,
        examined_range,                    # "N화~M화" 표시
        backfilled,                        # 이번에 새로 생성된 episode_id 들
        already_summarized,                # 이미 요약돼 있던 episode_id 들
        failed,                            # 백필 실패 episode_id 들 (본문 부재 등)
        backfilled_count,
        usage,                             # 누적 Haiku 토큰
        note,                              # 사람 친화 한 줄
      }
    """
    # 순환 import 방지 — summarize_episode 는 같은 mcp.tools 아래 모듈
    from app.mcp.tools.episode_plaintext import summarize_episode

    max_count = max(1, min(int(max_count or 3), 3))   # 상한 3 — 비용 폭주 방지

    # 대상 회차 위치 + 직전 회차들의 요약 유무를 한 번에 조회.
    r = await session.execute(
        sa_text(
            "SELECT ep.id, "
            "       (es.episode_id IS NOT NULL) AS has_summary "
            "FROM episode ep "
            "LEFT JOIN episode_summary es "
            "       ON es.episode_id = ep.id AND es.work_id = ep.work_id "
            "WHERE ep.work_id = :wid AND ep.writer_id = :wr AND ep.status != 'trashed' "
            "ORDER BY ep.sort_order ASC"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id},
    )
    rows = r.fetchall()
    episodes: list[tuple[str, bool]] = [(str(row[0]), bool(row[1])) for row in rows]

    target_idx = -1
    for i, (eid, _) in enumerate(episodes):
        if eid == target_episode_id:
            target_idx = i
            break
    if target_idx < 0:
        return {
            "error": "target_episode_not_found",
            "target_episode_id": target_episode_id,
        }
    if target_idx == 0:
        return {
            "target_episode_id": target_episode_id,
            "target_index": 0,
            "examined_range": "(none — 1화 이전 없음)",
            "backfilled": [],
            "already_summarized": [],
            "failed": [],
            "backfilled_count": 0,
            "usage": {"input_tokens": 0, "output_tokens": 0},
            "note": "대상이 첫 회차 — 직전화 백필 불필요.",
        }

    # 직전 max_count 화 (대상 제외). 1화 미만 인덱스로 안 내려감.
    start = max(0, target_idx - max_count)
    previous = episodes[start:target_idx]
    missing = [eid for eid, has in previous if not has]
    already = [eid for eid, has in previous if has]

    backfilled: list[str] = []
    failed: list[dict[str, str]] = []
    total_usage = {"input_tokens": 0, "output_tokens": 0}

    # ★ 각 회차 summarize_episode 호출을 자체 SAVEPOINT 로 격리.
    # execute_tool 의 외부 SAVEPOINT 하나만으로는 한 회차 실패 시 session 이
    # InFailedSQLTransactionError 상태로 빠져 후속 회차들이 줄줄이 실패한다.
    # 회차별 SAVEPOINT 로 감싸면 한 회차 rollback 이 다른 회차에 영향 없음.
    for eid in missing:
        try:
            async with session.begin_nested():
                result = await summarize_episode(session, ctx, episode_id=eid)
        except Exception as e:
            logger.warning(
                "ensure_recent_summaries.fail eid=%s err_type=%s err=%s",
                eid, type(e).__name__, str(e)[:200],
                exc_info=True,
            )
            failed.append(
                {"episode_id": eid, "reason": f"{type(e).__name__}: {str(e)[:100]}"}
            )
            continue
        if isinstance(result, dict) and "error" in result:
            failed.append({"episode_id": eid, "reason": result.get("error", "unknown")})
            continue
        backfilled.append(eid)
        if isinstance(result, dict):
            u = result.get("usage") or {}
            total_usage["input_tokens"] += int(u.get("input_tokens", 0) or 0)
            total_usage["output_tokens"] += int(u.get("output_tokens", 0) or 0)

    note_bits = [
        f"대상 직전 {len(previous)}화 검토",
        f"백필 {len(backfilled)}건",
        f"기존 요약 {len(already)}건",
    ]
    if failed:
        note_bits.append(f"실패 {len(failed)}건")

    return {
        "target_episode_id": target_episode_id,
        "target_index": target_idx,
        "examined_range": (
            f"sort_order 인덱스 {start}~{target_idx-1} (대상 직전 {len(previous)}화)"
        ),
        "backfilled": backfilled,
        "already_summarized": already,
        "failed": failed,
        "backfilled_count": len(backfilled),
        "usage": total_usage,
        "note": " / ".join(note_bits),
    }
