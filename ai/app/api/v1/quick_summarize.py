"""POST /v1/quick/summarize — 단발 회차 요약 생성 (Sonnet 우회, Haiku 1회).

Phase 4 도구 카드 '회차 요약 생성' 의 백엔드 진입점.
agent thread / 시나리오 시스템을 거치지 않고 summarize_episode 도구를 직접 호출 →
Haiku 1회만 사용 (~5 크레딧). episode_summary 테이블 UPSERT 부산물 그대로 활용
(캐시 hit 시 Haiku 0회).

신뢰 모델: spellcheck.py 와 동일 — `require_internal_api_key` (Spring proxy 만 호출
가능). work/writer ownership 검증은 Spring 측에서 이미 수행하고 통과한 호출이라고 가정.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import text as sa_text

from app.db.session import get_session
from app.middleware.auth import require_internal_api_key
from app.mcp.context import WriterContext
from app.mcp.tools.episode_plaintext import summarize_episode

router = APIRouter(
    prefix="/quick/summarize",
    tags=["quick"],
    dependencies=[Depends(require_internal_api_key)],
)


class QuickSummarizeRequest(BaseModel):
    work_id: UUID
    writer_id: UUID
    # 호환성: backend Java 가 sort_order 로 호출. 내부 변환해 episode_id 로 MCP 도구 호출.
    sort_order: int | None = None
    episode_id: UUID | None = None
    force_regenerate: bool = False


@router.post("")
async def quick_summarize(
    req: QuickSummarizeRequest,
    session: AsyncSession = Depends(get_session),
):
    """summarize_episode 도구 단발 호출. backend 호환층 — sort_order 받으면 episode_id 변환."""
    ctx = WriterContext(writer_id=req.writer_id, work_id=req.work_id)

    if req.episode_id is None and req.sort_order is None:
        raise HTTPException(status_code=400, detail={"error": "missing_identifier"})

    ep_id: str
    if req.episode_id is not None:
        ep_id = str(req.episode_id)
    else:
        r = await session.execute(
            sa_text(
                "SELECT id FROM episode "
                "WHERE work_id = :wid AND writer_id = :wr AND sort_order = :so LIMIT 1"
            ),
            {"wid": req.work_id, "wr": req.writer_id, "so": req.sort_order},
        )
        row = r.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail={"error": "episode_not_found"})
        ep_id = str(row[0])

    result = await summarize_episode(
        session,
        ctx,
        episode_id=ep_id,
        force_regenerate=req.force_regenerate,
    )

    if isinstance(result, dict) and "error" in result:
        # 회차 미존재 / 평문 미해제 / Haiku 실패 — 422 로 그대로 노출
        raise HTTPException(status_code=422, detail=result)

    # session.execute 한 UPSERT 를 커밋. get_session 이 commit 까지 책임지면 불필요하지만
    # 명시적으로 처리해 트랜잭션 누락 방지.
    await session.commit()
    return result
