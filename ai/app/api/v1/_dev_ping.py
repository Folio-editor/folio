"""Dev 전용 엔드포인트 — Celery 배선 확인용. 운영에선 제거 또는 경로 차단."""

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.celery_app import celery_app
from app.middleware.auth import require_internal_api_key
from app.tasks import ping_task

router = APIRouter(
    prefix="/_dev/ping",
    tags=["_dev"],
    dependencies=[Depends(require_internal_api_key)],
)


class PingRequest(BaseModel):
    msg: str = "ping"


class PingEnqueued(BaseModel):
    task_id: str


class PingResult(BaseModel):
    task_id: str
    status: str
    result: str | None = None


@router.post("", response_model=PingEnqueued, status_code=202)
async def enqueue_ping(body: PingRequest) -> PingEnqueued:
    async_result = ping_task.delay(body.msg)
    return PingEnqueued(task_id=async_result.id)


@router.get("/{task_id}", response_model=PingResult)
async def get_ping_result(task_id: str) -> PingResult:
    async_result = AsyncResult(task_id, app=celery_app)
    if async_result.state == "PENDING" and async_result.result is None:
        raise HTTPException(status_code=404, detail="task not found or still queued")
    return PingResult(
        task_id=task_id,
        status=async_result.state,
        result=async_result.result if async_result.successful() else None,
    )
