"""POST /v1/pipelines/episode 인덱싱 + /episode-summary 요약 파이프라인 트리거.

pipelines:
  - chunk_and_embed (모든 본문 변경)
  - generate_summary (status='완성' 1회 + 폭주 가드)

Phase 2 R-C 재설계 — 응답을 `PipelineResponse` 단일 모델로 통일.
필드: task_id?, status, reason?, idempotency_key.
"""

import hashlib
import logging
import uuid
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.episode_chunk import EpisodeChunk
from app.db.models.episode_summary import EpisodeSummary
from app.db.session import get_session
from app.middleware.auth import require_internal_api_key
from app.services.text_extractor import extract_plain_text
from app.services.work_key_resolver import (
    WorkKeyResolverError,
    resolve_episode_plaintext,
)
from app.tasks.chunk_and_embed import chunk_and_embed_task
from app.tasks.generate_summary import generate_summary_task

logger = logging.getLogger(__name__)

# 폭주 가드 임계 (R-2)
SUMMARY_COOLDOWN_MINUTES = 30      # 마지막 호출 이후 cooldown
SUMMARY_DAILY_LIMIT = 3            # 24h 내 동일 episode 재생성 횟수

router = APIRouter(
    prefix="/pipelines",
    tags=["pipelines"],
    dependencies=[Depends(require_internal_api_key)],
)


# ============================================================
# 공용 모델 (Phase 2 R-C)
# ============================================================


class EpisodePipelineRequest(BaseModel):
    episode_id: str
    work_id: str
    writer_id: str
    # backend SyncService 호출 시 None — 라우터가 work_key_resolver 로 직접 평문 fetch
    content: str | None = None


class PipelineResponse(BaseModel):
    """모든 AI 파이프라인 엔드포인트 공용 응답.

    status:
        - "accepted" — task 가 큐에 적재됨, task_id 존재
        - "skipped"  — 폭주 가드/평문 미발급/콘텐츠 변경 0 등으로 skip, task_id null
    reason:
        skip 사유 코드 (e.g. "content_unchanged", "cooldown", "daily_limit",
        "no_plaintext"). 디버깅·관측 용.
    idempotency_key:
        "<pipeline>:<episode_id>:<content_hash 16char>" 포맷.
        backend 가 그대로 [AI-TRACE] 로그·ai_job 추적 키로 활용.
    """

    task_id: str | None = None
    status: Literal["accepted", "skipped"] = "accepted"
    reason: str | None = None
    idempotency_key: str | None = None


def _content_hash(plain: str) -> str:
    return hashlib.sha256(plain.encode("utf-8")).hexdigest()


def _idempotency_key(pipeline: str, episode_id: str, content_hash: str) -> str:
    return f"{pipeline}:{episode_id}:{content_hash[:16]}"


# ============================================================
# /episode — 청킹·임베딩 파이프라인
# ============================================================


@router.post("/episode", status_code=202, response_model=PipelineResponse)
async def trigger_episode_pipeline(
    req: EpisodePipelineRequest,
    session: AsyncSession = Depends(get_session),
):
    plaintext = req.content
    if plaintext is None:
        try:
            plaintext = await resolve_episode_plaintext(req.episode_id, req.work_id)
        except WorkKeyResolverError as e:
            ikey = _idempotency_key("indexing", req.episode_id, "no_plaintext")
            logger.info(
                "episode_indexing.skip",
                extra={"episode_id": req.episode_id, "reason": "no_plaintext", "idempotency_key": ikey},
            )
            return PipelineResponse(
                status="skipped",
                reason=f"no_plaintext: {e}",
                idempotency_key=ikey,
            )

    args = (req.episode_id, req.work_id, req.writer_id, plaintext)
    plain_for_hash = extract_plain_text(plaintext)
    chash = _content_hash(plain_for_hash)
    ikey = _idempotency_key("indexing", req.episode_id, chash)

    # Phase 4.6: chunk content ciphertext 적재 후 idempotency 체크는 episode_chunk.content_hash
    # 컬럼으로 1 query 결정 (이전엔 chunks 본문 hash 비교 — ciphertext 변환 후 항상 mismatch).
    existing_hash = (await session.execute(
        select(EpisodeChunk.content_hash)
        .where(EpisodeChunk.episode_id == uuid.UUID(req.episode_id))
        .limit(1)
    )).scalar_one_or_none()
    if existing_hash and existing_hash == chash:
        logger.info(
            "episode_indexing.skip",
            extra={"episode_id": req.episode_id, "reason": "content_unchanged",
                   "idempotency_key": ikey},
        )
        return PipelineResponse(
            status="skipped",
            reason="content_unchanged",
            idempotency_key=ikey,
        )

    result = chunk_and_embed_task.apply_async(args=args)
    logger.info(
        "episode_indexing.accepted",
        extra={"episode_id": req.episode_id, "task_id": result.id, "idempotency_key": ikey},
    )
    return PipelineResponse(task_id=result.id, idempotency_key=ikey)


# ============================================================
# /episode-summary — Haiku 메타 요약 파이프라인 (프리미엄)
# ============================================================


async def _should_skip_summary(
    session: AsyncSession,
    episode_id: str,
    new_hash: str,
) -> tuple[bool, str | None]:
    """폭주 가드 — last summary row 조회 후 skip 사유 반환."""
    row = (await session.execute(
        select(
            EpisodeSummary.content_hash,
            EpisodeSummary.last_generated_at,
            EpisodeSummary.generation_count,
        ).where(EpisodeSummary.episode_id == uuid.UUID(episode_id))
    )).first()
    if row is None:
        return False, None

    last_hash, last_at, gen_count = row
    if last_hash and last_hash == new_hash:
        return True, "content_unchanged"
    if last_at is not None:
        if datetime.utcnow() - last_at < timedelta(minutes=SUMMARY_COOLDOWN_MINUTES):
            return True, "cooldown"
        # 24시간 내 일 limit — generation_count 누적치 단순 활용 (정확 일자 카운팅은 Phase 3)
        if datetime.utcnow() - last_at < timedelta(hours=24) and gen_count >= SUMMARY_DAILY_LIMIT:
            return True, "daily_limit"
    return False, None


@router.post("/episode-summary", status_code=202, response_model=PipelineResponse)
async def trigger_episode_summary(
    req: EpisodePipelineRequest,
    session: AsyncSession = Depends(get_session),
):
    plaintext = req.content
    if plaintext is None:
        try:
            plaintext = await resolve_episode_plaintext(req.episode_id, req.work_id)
        except WorkKeyResolverError as e:
            ikey = _idempotency_key("summary", req.episode_id, "no_plaintext")
            logger.info(
                "episode_summary.skip",
                extra={"episode_id": req.episode_id, "reason": "no_plaintext", "idempotency_key": ikey},
            )
            return PipelineResponse(
                status="skipped",
                reason=f"no_plaintext: {e}",
                idempotency_key=ikey,
            )

    plain = extract_plain_text(plaintext)
    new_hash = _content_hash(plain)
    ikey = _idempotency_key("summary", req.episode_id, new_hash)

    skip, reason = await _should_skip_summary(session, req.episode_id, new_hash)
    if skip:
        logger.info(
            "episode_summary.skip",
            extra={"episode_id": req.episode_id, "reason": reason, "idempotency_key": ikey},
        )
        return PipelineResponse(status="skipped", reason=reason, idempotency_key=ikey)

    args = (req.episode_id, req.work_id, req.writer_id, plaintext)
    result = generate_summary_task.apply_async(args=args)
    logger.info(
        "episode_summary.accepted",
        extra={"episode_id": req.episode_id, "task_id": result.id, "idempotency_key": ikey},
    )
    return PipelineResponse(task_id=result.id, idempotency_key=ikey)
