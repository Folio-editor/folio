"""Agent 진입점 — run_agent(thread_id, user_message) → {answer, receipt}.

흐름:
1. agent_session 로드 → 작품/시나리오/이전 messages
2. BudgetTracker 초기화 (시나리오 예산)
3. 작품 메타 블록 생성
4. 자동 압축 필요 시 maybe_compress
5. planner loop 실행 → tool_use × N 후 final answer
6. 영수증 발행 (token_receipt + lines) + 사용자 토큰 차감 (backend internal callback)
7. agent_session.messages 저장
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.budget import BudgetExceeded, BudgetTracker
from app.agent.meta_block import build_work_meta_block
from app.agent.planner import run_planner_loop
from app.agent.scenarios import get_budget
from app.agent.session import (
    load_session,
    maybe_compress,
    save_session_messages,
)
from app.mcp.context import WriterContext

logger = logging.getLogger(__name__)


async def run_agent(
    db_session: AsyncSession,
    *,
    thread_id: uuid.UUID,
    user_message: str,
    progress_callback=None,
) -> dict[str, Any]:
    started = time.time()
    sess = await load_session(db_session, thread_id)
    if sess is None:
        return {"error": "thread_not_found"}
    if sess["status"] != "active":
        return {"error": "thread_closed"}

    scenario = sess["scenario"]
    ctx = WriterContext(
        writer_id=sess["writer_id"],
        work_id=sess["work_id"],
        thread_id=thread_id,
    )
    budget = BudgetTracker(get_budget(scenario), progress_callback=progress_callback)

    # 작품 메타 블록 (캐시 가능)
    work_meta = await build_work_meta_block(db_session, ctx.work_id, ctx.writer_id)

    # 자동 압축
    messages, summary_so_far, did_compress = await maybe_compress(
        sess["messages"], sess["summary_so_far"], budget
    )

    status = "success"
    answer = ""
    suggestion_ids: list[str] = []
    try:
        result = await run_planner_loop(
            db_session=db_session,
            ctx=ctx,
            scenario_name=scenario,
            work_meta_block=work_meta,
            summary_so_far=summary_so_far,
            history=messages,
            user_message=user_message,
            budget=budget,
            event_emit=progress_callback,    # text_delta / assistant_start / assistant_end 채널 공유
        )
        answer = result["answer"]
        suggestion_ids = result["suggestion_ids"]
        messages = result["history"]
    except BudgetExceeded as e:
        status = "partial"
        budget.aborted = e.reason
        answer = f"[AGENT] 한도 도달({e.reason}). 현재까지 진행 결과만 반환합니다."
        # 사용자에게 abort 사유 메시지를 history 에도 남김
        messages.append({"role": "assistant", "content": answer})
        logger.warning("agent.budget_exceeded scenario=%s reason=%s", scenario, e.reason)
    except Exception as e:
        status = "failed"
        # 실제 예외 타입/메시지를 사용자에게 노출 (rate limit / API 에러 진단 가능)
        err_type = type(e).__name__
        err_msg = str(e)[:300]
        # Anthropic 라이브러리 특정 예외 분류
        is_rate_limit = (
            "rate_limit" in err_msg.lower()
            or "429" in err_msg
            or err_type in ("RateLimitError",)
        )
        is_overload = (
            "overloaded" in err_msg.lower()
            or "529" in err_msg
            or err_type in ("APIStatusError", "InternalServerError")
        )
        if is_rate_limit:
            budget.aborted = "rate_limited"
            answer = (
                "[AGENT] Anthropic API rate limit 에 도달했습니다. "
                "1~2분 후 같은 thread 에 다시 메시지 보내주세요. "
                "(메시지: " + err_msg + ")"
            )
        elif is_overload:
            budget.aborted = "anthropic_overloaded"
            answer = (
                "[AGENT] Anthropic 서버 일시 과부하. 잠시 후 재시도해주세요. "
                "(" + err_msg + ")"
            )
        else:
            budget.aborted = "internal_error"
            answer = f"[AGENT] 내부 오류 — {err_type}: {err_msg}"
        messages.append({"role": "assistant", "content": answer})
        logger.exception("agent.runner_failed scenario=%s err_type=%s", scenario, err_type)

    duration_ms = int((time.time() - started) * 1000)

    # tool 들이 INSERT 한 propose suggestion 을 먼저 commit.
    # planner loop 중 SAVEPOINT rollback 등으로 부모 트랜잭션이 살아 있어도
    # 명시 commit 으로 정리 후 영수증/세션 저장 흐름으로 진입.
    try:
        await db_session.commit()
    except Exception:
        # commit 실패 시 rollback 으로 session 복구 (다음 UPDATE 가 가능하도록)
        await db_session.rollback()
        logger.exception("agent.commit_failed_before_receipt thread=%s", thread_id)

    # 영수증 페이로드. idempotency_key 에 nonce 추가 — ms 정밀도 충돌 방지.
    receipt_payload = budget.to_receipt_payload(
        scenario=scenario,
        feature="agent",
        reference_type="agent_thread",
        reference_id=str(thread_id),
        status=status,
        duration_ms=duration_ms,
        idempotency_key=f"agent:{thread_id}:{int(started * 1000)}:{uuid.uuid4().hex[:8]}",
    )

    # 백엔드 영수증 발행 (실패 시 추후 재시도 큐 적재 — Phase 5)
    try:
        from app.services.token_receipt_client import issue_receipt

        receipt_resp = await issue_receipt(
            writer_id=str(ctx.writer_id),
            work_id=str(ctx.work_id),
            payload=receipt_payload,
        )
    except Exception as e:
        logger.exception("agent.issue_receipt_failed thread=%s", thread_id)
        receipt_resp = {"error": "receipt_callback_failed", "detail": str(e)[:200]}

    # session 저장 (압축 결과 포함). 트랜잭션이 aborted 상태면 먼저 rollback.
    try:
        await save_session_messages(db_session, thread_id, messages, summary_so_far)
    except Exception:
        logger.exception("agent.save_session_failed_first_attempt thread=%s", thread_id)
        try:
            await db_session.rollback()
            await save_session_messages(db_session, thread_id, messages, summary_so_far)
        except Exception:
            logger.exception("agent.save_session_failed_after_rollback thread=%s", thread_id)

    return {
        "thread_id": str(thread_id),
        "scenario": scenario,
        "status": status,
        "answer": answer,
        "suggestion_ids": suggestion_ids,
        "receipt": receipt_resp,
        "duration_ms": duration_ms,
        "budget": {
            "iterations": budget.iterations,
            "input_raw": budget.total_input_raw,
            "output_raw": budget.total_output_raw,
            "user_tokens": budget.cum_user_tokens,
            "cache_read": budget.cache_read_tokens,
            "cache_create": budget.cache_create_tokens,
            "abort": budget.aborted,
        },
    }
