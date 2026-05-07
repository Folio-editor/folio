"""Celery task — 비동기 agent 실행 (긴 시나리오 draft_next/revision/...).

Backend → AI POST /v1/agent/threads/{tid}/messages/async → 본 task → run_agent.
Phase 5 에서 Redis pub/sub 으로 SSE 진행 이벤트 발행 예정 (1차는 task_id polling).
"""

from __future__ import annotations

import asyncio
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.agent.runner import run_agent
from app.celery_app import celery_app
from app.config import settings

logger = logging.getLogger(__name__)


async def _run(thread_id: str, user_message: str, progress_callback=None) -> dict:
    engine = create_async_engine(settings.database_url, pool_size=1)
    try:
        async with AsyncSession(engine) as db:
            return await run_agent(
                db,
                thread_id=uuid.UUID(thread_id),
                user_message=user_message,
                progress_callback=progress_callback,
            )
    finally:
        await engine.dispose()


@celery_app.task(
    name="app.tasks.agent_run",
    bind=True,
    autoretry_for=(),       # agent 는 BudgetExceeded 등 자체 처리 — 자동 재시도 X
    max_retries=0,
)
def agent_run_task(self, thread_id: str, user_message: str) -> dict:
    logger.info(
        "agent_run.start",
        extra={"thread_id": thread_id, "msg_length": len(user_message)},
    )

    def _publish(meta: dict) -> None:
        # Celery PROGRESS state — frontend 가 status endpoint 로 polling
        self.update_state(state="PROGRESS", meta=meta)

    loop = asyncio.new_event_loop()
    try:
        out = loop.run_until_complete(_run(thread_id, user_message, progress_callback=_publish))
        logger.info(
            "agent_run.done",
            extra={
                "thread_id": thread_id,
                "status": out.get("status"),
                "user_tokens": (out.get("budget") or {}).get("user_tokens"),
            },
        )
        return out
    except Exception:
        logger.exception("agent_run.failed thread=%s", thread_id)
        raise
    finally:
        loop.close()
