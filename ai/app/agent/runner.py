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

import asyncio
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
    # 빈 thread 에 처음 보내는 메시지 → 자동 title (truncate)
    auto_title = None
    if sess.get("title") is None and not sess.get("messages"):
        auto_title = (user_message or "").strip()[:50] or None
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
    except asyncio.CancelledError:
        # 사용자가 채팅 UI 의 ■ 중단 버튼 → SSE fetch 취소 → FastAPI StreamingResponse
        # generator 에 CancelledError 전파 → run_planner_loop 의 await 지점에서 raise.
        # 본 함수는 partial 처리 후 정리 (영수증/세션 저장) 가 필수라 cancel 을 의도적으로
        # 흡수. catch 후엔 후속 await 들이 정상 실행됨 (이 시점에 task 의 cancel state 가
        # 리셋됐으므로). 호출자 (SSE endpoint) 는 응답을 이미 끊었으니 return 값 의미 없음.
        status = "partial"
        budget.aborted = "client_disconnect"
        answer = "[AGENT] 사용자 중단 — 현재까지 진행한 단계까지만 반영했습니다."
        messages.append({"role": "assistant", "content": answer})
        logger.info("agent.client_disconnect scenario=%s thread=%s", scenario, thread_id)
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
        # GMS / LLM 게이트웨이 프록시는 요청 본문이 자기 한계 (200K 미만) 를 넘어가면
        # 모델 호출조차 안 하고 generic 에러로 떨군다. "Model not found" / "GMS 에러" 같은
        # 메시지가 대표 — 실제 모델명은 정상이라 사용자는 원인 파악 불가. 컨텍스트 과포화로 분류.
        ml = err_msg.lower()
        is_proxy_overflow = (
            ("model not found" in ml and "anthropic" in ml)
            or "[gms" in ml
            or "request entity too large" in ml
            or "413" in err_msg
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
        elif is_proxy_overflow:
            budget.aborted = "context_overflow"
            answer = (
                "[AGENT] 채팅이 누적되어 한 번에 보낼 수 있는 컨텍스트 한계를 넘었습니다. "
                "같은 thread 의 [압축] 버튼으로 대화를 정리한 뒤 다시 보내주세요. "
                "(원본 게이트웨이 에러: " + err_msg + ")"
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
        await save_session_messages(db_session, thread_id, messages, summary_so_far, auto_title=auto_title)
    except Exception:
        logger.exception("agent.save_session_failed_first_attempt thread=%s", thread_id)
        try:
            await db_session.rollback()
            await save_session_messages(db_session, thread_id, messages, summary_so_far, auto_title=auto_title)
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
