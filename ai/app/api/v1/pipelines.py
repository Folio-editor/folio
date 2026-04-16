"""POST /v1/pipelines/episode — 회차 인덱싱 파이프라인 트리거."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.middleware.auth import require_internal_api_key
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
    task_id: str
    status: str = "accepted"


@router.post("/episode", status_code=202, response_model=EpisodePipelineResponse)
async def trigger_episode_pipeline(req: EpisodePipelineRequest):
    result = chunk_and_embed_task.delay(
        episode_id=req.episode_id,
        work_id=req.work_id,
        writer_id=req.writer_id,
        content=req.content,
    )
    return EpisodePipelineResponse(task_id=result.id)
