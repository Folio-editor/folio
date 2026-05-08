"""MCP 도구: episode_summary 일괄 백필 큐 적재 (Phase 4.5).

agent 가 자신의 Sonnet/Haiku 토큰을 쓰지 않고 backend 의 generate_summary_task 를 회차 별
Celery 큐에 적재. 사용자가 "300화 작품인데 요약이 비어 있다" 같은 상황에 한 번 호출하면
백그라운드 worker 가 회차별로 Haiku 요약 → episode_summary INSERT.

호출자 비용:
  - DB SELECT (episode 메타) + Celery enqueue × N — agent 토큰 0
  - 실제 Haiku 비용은 별도 영수증으로 작가에게 청구 (기존 generate_summary_task 흐름과 동일)
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.tasks.generate_summary import generate_summary_task


async def request_episode_summary_backfill(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    start_sort: int | None = None,
    end_sort: int | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    """완성된 미요약 / stale 요약 회차들의 generate_summary_task 를 Celery 큐에 적재.

    엄격한 트리거 조건 (운영 토큰 폭주 방지):
      - **episode.status = '완성'** 만 (작성중 / draft 회차는 제외)
      - 다음 중 하나에 해당:
        a) episode_summary 행이 아예 없음 (백필)
        b) episode.updated_at > episode_summary.last_generated_at (수정 후 stale)
      - start_sort/end_sort 로 범위 제한 가능
      - limit (기본 50, 상한 200)

    비용 청구: 백그라운드 generate_summary_task 가 작가에게 영수증 발행 (token_receipt
    feature='episode_summary'). 사업자 부담 X.

    반환: {enqueued_count, fresh_count, stale_count, range, message}
    """
    capped_limit = min(max(int(limit), 1), 200)
    where = [
        "ep.work_id = :wid",
        "ep.writer_id = :wr",
        "ep.status = '완성'",      # 작성중 / draft / 일시 정지 등 제외
        "(es.episode_id IS NULL OR ep.updated_at > es.last_generated_at)",
    ]
    params: dict[str, Any] = {
        "wid": ctx.work_id,
        "wr": ctx.writer_id,
        "lim": capped_limit,
    }
    if start_sort is not None:
        where.append("ep.sort_order >= :s")
        params["s"] = start_sort
    if end_sort is not None:
        where.append("ep.sort_order <= :e")
        params["e"] = end_sort

    sql = (
        "SELECT ep.id, ep.sort_order, ep.title, ep.status, "
        "       (es.episode_id IS NULL) AS is_fresh, "
        "       (es.episode_id IS NOT NULL AND ep.updated_at > es.last_generated_at) AS is_stale "
        "FROM episode ep "
        "LEFT JOIN episode_summary es ON es.episode_id = ep.id "
        f"WHERE {' AND '.join(where)} "
        "ORDER BY ep.sort_order ASC LIMIT :lim"
    )
    r = await session.execute(sa_text(sql), params)
    rows = r.fetchall()
    if not rows:
        return {
            "enqueued_count": 0,
            "message": (
                "백필 대상 없음. status='완성' 회차 중 미요약/stale 항목이 없거나 범위 외. "
                "회차가 작성중 상태면 먼저 완성으로 변경해주세요."
            ),
        }

    enqueued: list[str] = []
    fresh = 0
    stale = 0
    for row in rows:
        episode_id = str(row[0])
        if row[4]:    # is_fresh
            fresh += 1
        if row[5]:    # is_stale
            stale += 1
        try:
            generate_summary_task.apply_async(
                kwargs={
                    "episode_id": episode_id,
                    "work_id": str(ctx.work_id),
                    "writer_id": str(ctx.writer_id),
                    "content": None,    # task 가 직접 backend 에서 평문 fetch (Vault Transit)
                }
            )
            enqueued.append(episode_id)
        except Exception:
            continue

    return {
        "enqueued_count": len(enqueued),
        "fresh_count": fresh,
        "stale_count": stale,
        "range": {
            "start_sort": rows[0][1],
            "end_sort": rows[-1][1],
        },
        "message": (
            f"{len(enqueued)}개 회차 큐 적재 (신규 {fresh} · 수정 후 stale {stale}). "
            "회차당 ~30~60초 소요. 완료 후 list_all_oneline_summaries 로 확인. "
            f"비용은 작가의 episode_summary 영수증으로 청구됩니다."
        ),
    }
