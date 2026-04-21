"""POST /v1/pipelines/episode 인덱싱 파이프라인 트리거.

chain: chunk_and_embed -> generate_summary
"""

from celery import chain
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.middleware.auth import require_internal_api_key
from app.tasks.chunk_and_embed import chunk_and_embed_task
from app.tasks.generate_summary import generate_summary_task

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
    args = (req.episode_id, req.work_id, req.writer_id, req.content)

    pipeline = chain(
        chunk_and_embed_task.s(*args),
        generate_summary_task.si(*args),
    )
    result = pipeline.apply_async()
    return EpisodePipelineResponse(task_id=result.id)
