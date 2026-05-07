"""POST /v1/agent — agent thread 관리 + 메시지 동기/비동기 호출.

동기:
  POST /v1/agent/threads                    -> 새 thread
  POST /v1/agent/threads/{tid}/messages     -> 메시지 전송 (≤30s 시나리오)
  GET  /v1/agent/threads                    -> 목록
  GET  /v1/agent/threads/{tid}              -> 상세

비동기 (긴 시나리오):
  POST /v1/agent/threads/{tid}/messages/async -> {task_id}
  GET  /v1/agent/tasks/{tid}/events            -> SSE (Phase 5 — 1차는 polling)
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Literal

import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.runner import run_agent
from app.agent.scenarios import SCENARIOS
from app.agent.session import create_session, list_threads, load_session
from app.celery_app import celery_app
from app.db.session import get_session, async_session
from app.middleware.auth import require_internal_api_key
from app.tasks.agent_run import agent_run_task

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/agent",
    tags=["agent"],
    dependencies=[Depends(require_internal_api_key)],
)

# ── 시나리오별 sync/async 라우팅 ──
ASYNC_SCENARIOS = {"draft_next", "revision", "consistency_check", "extraction"}
MAX_USER_MESSAGE_LEN = 8000


# ─────── 모델 ───────


class CreateThreadRequest(BaseModel):
    work_id: str
    writer_id: str
    scenario: Literal[
        "auto",
        "draft_next", "consistency_check", "revision", "extraction", "qa", "ideation"
    ] = "auto"
    title: str | None = None


class CreateThreadResponse(BaseModel):
    thread_id: str
    scenario: str
    title: str | None = None


class MessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_USER_MESSAGE_LEN)


class AsyncMessageResponse(BaseModel):
    task_id: str
    thread_id: str
    scenario: str


class ThreadSummary(BaseModel):
    thread_id: str
    scenario: str
    title: str | None = None
    status: str
    last_activity_at: str | None = None
    created_at: str | None = None


class ThreadDetail(BaseModel):
    thread_id: str
    work_id: str
    writer_id: str
    scenario: str
    title: str | None = None
    status: str
    messages: list[dict[str, Any]]
    summary_so_far: str | None = None


# ─────── 엔드포인트 ───────


@router.post("/threads", response_model=CreateThreadResponse, status_code=201)
async def post_create_thread(
    req: CreateThreadRequest,
    db: AsyncSession = Depends(get_session),
) -> CreateThreadResponse:
    if req.scenario not in SCENARIOS:
        raise HTTPException(status_code=400, detail="unknown_scenario")
    tid = await create_session(
        db,
        work_id=uuid.UUID(req.work_id),
        writer_id=uuid.UUID(req.writer_id),
        scenario=req.scenario,
        title=req.title,
    )
    return CreateThreadResponse(thread_id=str(tid), scenario=req.scenario, title=req.title)


@router.post("/threads/{thread_id}/messages")
async def post_message(
    thread_id: str,
    req: MessageRequest,
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    sess = await load_session(db, uuid.UUID(thread_id))
    if sess is None:
        raise HTTPException(status_code=404, detail="thread_not_found")
    if sess["scenario"] in ASYNC_SCENARIOS:
        raise HTTPException(
            status_code=400,
            detail=f"scenario {sess['scenario']} requires /messages/async",
        )
    return await run_agent(
        db, thread_id=uuid.UUID(thread_id), user_message=req.message
    )


@router.post("/threads/{thread_id}/messages/async", response_model=AsyncMessageResponse)
async def post_message_async(
    thread_id: str,
    req: MessageRequest,
    db: AsyncSession = Depends(get_session),
) -> AsyncMessageResponse:
    sess = await load_session(db, uuid.UUID(thread_id))
    if sess is None:
        raise HTTPException(status_code=404, detail="thread_not_found")
    task = agent_run_task.apply_async(
        kwargs={"thread_id": thread_id, "user_message": req.message},
    )
    return AsyncMessageResponse(
        task_id=task.id, thread_id=thread_id, scenario=sess["scenario"]
    )


@router.get("/threads", response_model=list[ThreadSummary])
async def get_threads(
    work_id: str,
    writer_id: str,
    db: AsyncSession = Depends(get_session),
) -> list[ThreadSummary]:
    rows = await list_threads(db, uuid.UUID(work_id), uuid.UUID(writer_id))
    return [ThreadSummary(**r) for r in rows]


@router.post("/threads/{thread_id}/messages/stream")
async def post_message_stream(
    thread_id: str,
    req: MessageRequest,
):
    """SSE 스트리밍 — agent 실행을 인라인으로 돌리고 매 step 마다 event 발행.

    이벤트 형식: `data: {json}\n\n`
      - {type:"step", step_type, actor, tool_name?, input_tokens?, output_tokens?, user_tokens?}
      - {type:"done", thread_id, status, answer, suggestion_ids, receipt, budget}
      - {type:"error", error_type, error_message}

    Celery 비동기 폴링을 대체. 한 HTTP keep-alive 안에서 처리 (~60s 일반).
    """
    # thread 검증 (별도 짧은 세션)
    async with async_session() as db_check:
        sess = await load_session(db_check, _uuid(thread_id))
        if sess is None:
            raise HTTPException(status_code=404, detail="thread_not_found")

    return StreamingResponse(
        _agent_sse_generator(thread_id, req.message),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _uuid(s: str) -> uuid.UUID:
    return uuid.UUID(s)


async def _agent_sse_generator(thread_id: str, user_message: str):
    """run_agent 를 인라인 실행하면서 progress_callback 을 SSE event 로 변환."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=64)
    DONE = object()

    def emit(meta: dict) -> None:
        # progress_callback 은 sync 호출. queue.put_nowait 으로 비차단.
        # 1) planner 가 직접 보내는 이벤트 (text_delta / assistant_start / assistant_end)
        ev_type = meta.get("event_type")
        if ev_type == "text_delta":
            try:
                queue.put_nowait({"type": "text_delta", "text": meta.get("text", "")})
            except asyncio.QueueFull:
                pass
            return
        if ev_type in ("assistant_start", "assistant_end"):
            try:
                queue.put_nowait({"type": ev_type})
            except asyncio.QueueFull:
                pass
            return
        # 2) BudgetTracker 가 보내는 step 메타
        recent = meta.get("recent_lines", [])
        if recent:
            last = recent[-1]
            try:
                queue.put_nowait({
                    "type": "step",
                    "seq": last.get("seq"),
                    "step_type": last.get("step_type"),
                    "actor": last.get("actor"),
                    "tool_name": last.get("tool_name"),
                    "input_tokens": last.get("input_tokens", 0),
                    "output_tokens": last.get("output_tokens", 0),
                    "user_tokens": last.get("user_tokens", 0),
                    "iterations": meta.get("iterations"),
                    "cum_user_tokens": meta.get("user_tokens"),
                })
            except asyncio.QueueFull:
                pass    # event drop OK — 진행상태일 뿐

    async def run_task():
        try:
            async with async_session() as db:
                result = await run_agent(
                    db,
                    thread_id=_uuid(thread_id),
                    user_message=user_message,
                    progress_callback=emit,
                )
            await queue.put({"type": "done", **result})
        except Exception as e:
            logger.exception("agent.sse_failed thread=%s", thread_id)
            await queue.put({
                "type": "error",
                "error_type": type(e).__name__,
                "error_message": str(e)[:300],
            })
        finally:
            await queue.put(DONE)

    task = asyncio.create_task(run_task())
    try:
        while True:
            evt = await queue.get()
            if evt is DONE:
                break
            yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"
    finally:
        if not task.done():
            task.cancel()


@router.get("/tasks/{task_id}/status")
async def get_task_status(task_id: str) -> dict[str, Any]:
    """Celery task 진행 상태 조회 — 프론트가 비동기 시나리오 polling 시 사용.

    state: PENDING / STARTED / PROGRESS / SUCCESS / FAILURE / REVOKED.
    PROGRESS info: {iterations, input_raw, output_raw, user_tokens, tool_calls, recent_lines}
    SUCCESS  result: run_agent 반환값 그대로.
    FAILURE  info: {error_type, error_message, traceback?} — exception 정보 노출.
    """
    res = celery_app.AsyncResult(task_id)
    state = res.state

    # info 변환:
    #   PROGRESS / dict 형태 → 그대로
    #   FAILURE / Exception → {error_type, error_message}
    info: dict[str, Any] | None = None
    raw_info = res.info
    if isinstance(raw_info, dict):
        info = raw_info
    elif state == "FAILURE":
        info = {
            "error_type": type(raw_info).__name__ if raw_info is not None else "Unknown",
            "error_message": str(raw_info) if raw_info is not None else "(no message)",
            "traceback": (res.traceback[:2000] if getattr(res, "traceback", None) else None),
        }

    return {
        "task_id": task_id,
        "state": state,
        "ready": res.ready(),
        "successful": res.successful() if res.ready() else None,
        "info": info,
        "result": res.result if state == "SUCCESS" and isinstance(res.result, dict) else None,
    }


@router.get("/threads/{thread_id}", response_model=ThreadDetail)
async def get_thread(
    thread_id: str,
    db: AsyncSession = Depends(get_session),
) -> ThreadDetail:
    sess = await load_session(db, uuid.UUID(thread_id))
    if sess is None:
        raise HTTPException(status_code=404, detail="thread_not_found")
    return ThreadDetail(
        thread_id=str(sess["thread_id"]),
        work_id=str(sess["work_id"]),
        writer_id=str(sess["writer_id"]),
        scenario=sess["scenario"],
        title=sess["title"],
        status=sess["status"],
        messages=sess["messages"],
        summary_so_far=sess["summary_so_far"],
    )
