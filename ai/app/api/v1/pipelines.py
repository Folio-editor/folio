"""POST /v1/pipelines/episode 인덱싱 파이프라인 트리거.

pipeline: chunk_and_embed
"""

import hashlib
import json
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.episode_chunk import EpisodeChunk
from app.db.session import get_session
from app.middleware.auth import require_internal_api_key
from app.services.chunker import chunk_text
from app.services.text_extractor import extract_plain_text
from app.tasks.chunk_and_embed import chunk_and_embed_task

router = APIRouter(
    prefix="/pipelines",
    tags=["pipelines"],
    dependencies=[Depends(require_internal_api_key)],
)


class EpisodePipelineRequest(BaseModel):
    episode_id: str
    work_id: str
    writer_id: str
    content: str


class EpisodePipelineResponse(BaseModel):
    task_id: str | None = None
    status: str = "accepted"
    reason: str | None = None


def _build_chunk_signature(content: str) -> tuple[list[str], str]:
    plain_text = extract_plain_text(content)
    chunks = chunk_text(plain_text)
    serialized = json.dumps(chunks, ensure_ascii=False, separators=(",", ":"))
    digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    return chunks, digest


@router.post("/episode", status_code=202, response_model=EpisodePipelineResponse)
async def trigger_episode_pipeline(
    req: EpisodePipelineRequest,
    session: AsyncSession = Depends(get_session),
):
    args = (req.episode_id, req.work_id, req.writer_id, req.content)
    _, request_signature = _build_chunk_signature(req.content)

    existing = await session.execute(
        select(EpisodeChunk.content)
        .where(EpisodeChunk.episode_id == uuid.UUID(req.episode_id))
        .order_by(EpisodeChunk.chunk_index)
    )
    existing_chunks = existing.scalars().all()
    if existing_chunks:
        serialized = json.dumps(existing_chunks, ensure_ascii=False, separators=(",", ":"))
        existing_signature = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
        if existing_signature == request_signature:
            return EpisodePipelineResponse(
                status="skipped",
                reason="content unchanged",
            )

    result = chunk_and_embed_task.apply_async(args=args)
    return EpisodePipelineResponse(task_id=result.id)
