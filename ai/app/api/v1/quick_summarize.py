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
    sort_order: int
    force_regenerate: bool = False


@router.post("")
async def quick_summarize(
    req: QuickSummarizeRequest,
    session: AsyncSession = Depends(get_session),
):
    """summarize_episode 도구 단발 호출.

    반환 형식 = 도구 반환값 그대로 (12-필드 + cached/generation_count/usage).
    에러는 도구가 dict 로 반환 → HTTP 422 로 변환.
    """
    ctx = WriterContext(writer_id=req.writer_id, work_id=req.work_id)
    result = await summarize_episode(
        session,
        ctx,
        sort_order=req.sort_order,
        force_regenerate=req.force_regenerate,
    )

    if isinstance(result, dict) and "error" in result:
        # 회차 미존재 / 평문 미해제 / Haiku 실패 — 422 로 그대로 노출
        raise HTTPException(status_code=422, detail=result)

    # session.execute 한 UPSERT 를 커밋. get_session 이 commit 까지 책임지면 불필요하지만
    # 명시적으로 처리해 트랜잭션 누락 방지.
    await session.commit()
    return result
