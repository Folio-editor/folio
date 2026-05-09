"""Sonnet planner — Anthropic messages.create tool loop + prompt caching.

§D, §O 구현. system 4 블록 (시나리오 / 작품 메타 / 대화 요약 / [최근 메시지 messages 안에]).
앞 3 블록은 cache_control: ephemeral 로 마크 → 5분 TTL prompt cache 활용.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.budget import BudgetExceeded, BudgetTracker
from app.agent.scenarios import get_scenario
from app.mcp.context import WriterContext
from app.mcp.registry import execute_tool, filter_tools
from app.services.providers import get_llm

logger = logging.getLogger(__name__)

PLANNER_MAX_TOKENS = 6000     # 초안 본문 (3~5K tok) + tool_use 블록 동시 출력 여유


def _build_system_blocks(
    scenario_prompt: str,
    work_meta_block: str,
    summary_so_far: str | None,
) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": scenario_prompt,
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": work_meta_block,
            "cache_control": {"type": "ephemeral"},
        },
    ]
    if summary_so_far:
        blocks.append(
            {
                "type": "text",
                "text": f"[이전 대화 요약]\n{summary_so_far}",
                "cache_control": {"type": "ephemeral"},
            }
        )
    return blocks


def _content_to_text(content: Any) -> str:
    """Anthropic message content → 텍스트 평문."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                if item.get("type") == "text":
                    parts.append(str(item.get("text", "")))
            else:
                # SDK 객체 (TextBlock 등)
                t = getattr(item, "text", None)
                if t:
                    parts.append(str(t))
        return "\n".join(parts)
    return ""


def _block_to_dict(block: Any) -> dict[str, Any]:
    """Anthropic SDK content block → dict."""
    if isinstance(block, dict):
        return block
    btype = getattr(block, "type", None)
    if btype == "text":
        return {"type": "text", "text": getattr(block, "text", "")}
    if btype == "tool_use":
        return {
            "type": "tool_use",
            "id": getattr(block, "id", ""),
            "name": getattr(block, "name", ""),
            "input": getattr(block, "input", {}) or {},
        }
    return {"type": btype or "unknown"}


async def run_planner_loop(
    *,
    db_session: AsyncSession,
    ctx: WriterContext,
    scenario_name: str,
    work_meta_block: str,
    summary_so_far: str | None,
    history: list[dict[str, Any]],
    user_message: str,
    budget: BudgetTracker,
    event_emit=None,
) -> dict[str, Any]:
    """tool_use loop 실행 후 final text + collected suggestion_ids 반환.

    history 는 Anthropic messages 형식 (role + content). 호출 후
    추가된 user/assistant/tool_result 메시지가 history 에 누적되어 반환된다.
    """
    scenario = get_scenario(scenario_name)
    allowed = scenario["allowed_tools"]
    tools = filter_tools(allowed)
    system_blocks = _build_system_blocks(scenario["system_prompt"], work_meta_block, summary_so_far)

    llm = get_llm()
    client = getattr(llm, "_client", None)
    sonnet_model = getattr(llm, "_sonnet_model", None)
    if client is None or sonnet_model is None:
        raise RuntimeError("LLM provider lacks Anthropic client (Fake provider unsupported for planner).")

    # ⚠ history sanity: 옛 thread (압축이 페어를 깨뜨렸던 시기) 의 손상된 messages 가
    # 들어올 수 있다. orphan tool_result / orphan tool_use 를 제거 — Anthropic 400 차단.
    history = _sanitize_history(history)

    # 사용자 신규 메시지를 history 에 append
    history.append({"role": "user", "content": user_message})

    suggestion_ids: list[str] = []
    final_text: str | None = None

    while True:
        response = None
        last_err: Exception | None = None
        # rate_limit / overload 시 최대 3회 backoff (2s → 5s → 10s)
        for attempt, backoff in enumerate([2, 5, 10], start=1):
            try:
                # 새 assistant turn 시작 신호 — 프론트가 새 메시지 버블 띄우도록
                if event_emit:
                    event_emit({"event_type": "assistant_start"})
                async with client.messages.stream(
                    model=sonnet_model,
                    max_tokens=PLANNER_MAX_TOKENS,
                    system=system_blocks,
                    tools=tools,
                    messages=history,
                    # Sonnet 4 의 XML hallucination 빈도 감소 + tool 결정 안정성 ↑
                    temperature=0.2,
                ) as stream:
                    async for ev in stream:
                        if getattr(ev, "type", None) == "content_block_delta":
                            delta = getattr(ev, "delta", None)
                            if delta is not None and getattr(delta, "type", None) == "text_delta":
                                chunk = getattr(delta, "text", "") or ""
                                if chunk and event_emit:
                                    event_emit({"event_type": "text_delta", "text": chunk})
                    response = await stream.get_final_message()
                if event_emit:
                    event_emit({"event_type": "assistant_end"})
                break
            except BudgetExceeded:
                raise
            except Exception as e:
                last_err = e
                msg = str(e).lower()
                retriable = (
                    "rate_limit" in msg
                    or "429" in msg
                    or "overloaded" in msg
                    or "529" in msg
                    or "timeout" in msg
                )
                if not retriable or attempt == 3:
                    logger.exception(
                        "planner.create_failed scenario=%s attempt=%d retriable=%s",
                        scenario_name, attempt, retriable,
                    )
                    raise
                logger.warning(
                    "planner.create_retry scenario=%s attempt=%d backoff=%ds err=%s",
                    scenario_name, attempt, backoff, type(e).__name__,
                )
                import asyncio
                await asyncio.sleep(backoff)
        if response is None:
            raise last_err or RuntimeError("planner_no_response")

        usage = _usage_to_dict(response.usage)
        content = response.content or []
        # assistant turn 을 history 에 append (budget raise 전에 — Anthropic 의 user/assistant 교차 규칙 보존)
        assistant_blocks = [_block_to_dict(b) for b in content]
        history.append({"role": "assistant", "content": assistant_blocks})

        stop_reason = getattr(response, "stop_reason", None)
        tool_uses = [b for b in content if getattr(b, "type", None) == "tool_use"]

        # record_planner 는 budget 한도 초과 시 raise — history 는 이미 안전 상태
        try:
            budget.record_planner(usage, detail={"scenario": scenario_name, "model": sonnet_model})
        except BudgetExceeded:
            # tool_use 가 있었다면 빈 tool_result 로 마감해야 다음 turn 정상.
            if tool_uses:
                seal_results = [
                    {
                        "type": "tool_result",
                        "tool_use_id": getattr(tu, "id", ""),
                        "content": _format_tool_result({"error": "budget_exceeded_before_tool_exec"}),
                    }
                    for tu in tool_uses
                ]
                history.append({"role": "user", "content": seal_results})
            raise

        # 정책: tool_use 블록이 하나라도 있으면 실행한다.
        # Anthropic 이 가끔 stop_reason='end_turn'/'max_tokens' 인데 tool_use 도 함께
        # 보내는 경우가 있어, 단순히 stop_reason 만 보면 tool 호출이 누락된다.
        if not tool_uses:
            final_text = _content_to_text(content)
            # Sonnet 4 가 가끔 tool_use 블록 대신 옛 XML 포맷 (<invoke name="..."><parameter>)
            # 을 텍스트로 출력하는 회귀를 감지. 사용자 채팅엔 무의미한 XML 만 노출되므로
            # 한 번 user 메시지로 나무라서 재시도 (1회만).
            if (
                "<invoke name=" in final_text
                or "<parameter name=" in final_text
            ):
                logger.warning(
                    "planner.xml_tool_hallucination scenario=%s — retry once with explicit reminder",
                    scenario_name,
                )
                history.append({
                    "role": "user",
                    "content": (
                        "방금 응답에서 <invoke> XML 텍스트로 도구 호출을 시도했는데, "
                        "그건 실제 호출이 아닙니다. tool_use 블록으로 다시 호출해주세요. "
                        "혹은 도구가 필요 없으면 일반 답변을 해주세요."
                    ),
                })
                final_text = None
                continue
            break
        if stop_reason and stop_reason != "tool_use":
            logger.warning(
                "planner.unusual_stop_reason scenario=%s stop=%s tool_uses=%d — "
                "tool 실행은 진행한다",
                scenario_name, stop_reason, len(tool_uses),
            )

        # tool_use 들 실행 → tool_result 메시지로 추가.
        # ⚠ 중요: 한 번 record_tool 이 BudgetExceeded 를 raise 하면 남은 tool_use 들에도
        # 빈 tool_result 를 합성해 history 에 append 해야 다음 turn 에서 Anthropic API 가
        # "tool_use must be followed by tool_result" 검증을 통과한다 (Phase 4 audit A-5).
        tool_results: list[dict[str, Any]] = []
        budget_aborted: BudgetExceeded | None = None
        for tu in tool_uses:
            name = getattr(tu, "name", "")
            tu_id = getattr(tu, "id", "")
            args = getattr(tu, "input", {}) or {}
            if budget_aborted is not None:
                # 예산 초과 후 — 실행 없이 abort 알림만
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu_id,
                    "content": _format_tool_result({
                        "error": "budget_aborted_before_execution",
                        "reason": budget_aborted.reason,
                    }),
                })
                continue
            try:
                budget.record_tool(name, args=args)
            except BudgetExceeded as be:
                budget_aborted = be
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu_id,
                    "content": _format_tool_result({
                        "error": "budget_exceeded", "reason": be.reason,
                    }),
                })
                continue
            try:
                result = await execute_tool(name, args, db_session, ctx)
            except Exception as e:
                logger.exception("planner.tool_failed name=%s", name)
                result = {"error": "tool_failed", "message": str(e)[:200]}
            # 내부에서 Haiku 를 호출하는 도구들은 result.usage 를 budget 에 반영해
            # 사용자 영수증에 청구된다 (Phase 4.5 §C-1, Phase 4.6 후속).
            #   - invoke_haiku_worker      : 명시적 Haiku sub-task 위임
            #   - analyze_episode          : 단건 자유 task 추출
            #   - summarize_episode        : 12-필드 양식 요약 + episode_summary UPSERT 부산물
            #   - query_episodes_by_chunks : 벡터 검색 + Haiku 합성
            # cache hit 경로는 usage={input:0, output:0} 라 record 해도 0 누적 — 안전.
            if name in (
                "invoke_haiku_worker",
                "analyze_episode",
                "summarize_episode",
                "query_episodes_by_chunks",
            ) and isinstance(result, dict):
                worker_usage = result.get("usage")
                if isinstance(worker_usage, dict):
                    try:
                        budget.record_worker(worker_usage, detail={"tool": name})
                    except BudgetExceeded as be:
                        budget_aborted = be
            if isinstance(result, dict) and result.get("suggestion_id"):
                suggestion_ids.append(result["suggestion_id"])
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tu_id,
                "content": _format_tool_result(result),
            })
        history.append({"role": "user", "content": tool_results})

        if budget_aborted is not None:
            # tool_results 는 모두 채워진 안전한 상태. 이제 raise 하여 runner 가
            # status='partial' 로 종료 처리.
            raise budget_aborted

    if not (final_text or "").strip():
        if suggestion_ids:
            final_text = (
                f"제안 {len(suggestion_ids)}건을 등록했습니다. 받은편지함에서 확인 후 승인해주세요."
            )
        else:
            final_text = "(agent 가 추가 답변을 생성하지 않았습니다.)"

    return {
        "answer": final_text or "",
        "history": history,
        "suggestion_ids": suggestion_ids,
    }


_TOOL_RESULT_LIMIT = 32_000   # 1회 tool_result 최대 문자 (300화 list_all_oneline ~13.5K 여유)


def _format_tool_result(result: Any) -> str:
    """tool 결과를 LLM 입력용 텍스트로 직렬화. 한도 초과 시 명시적 truncation."""
    import json

    try:
        s = json.dumps(result, ensure_ascii=False)
    except Exception:
        s = str(result)
    if len(s) <= _TOOL_RESULT_LIMIT:
        return s
    head = s[: _TOOL_RESULT_LIMIT - 200]
    suffix = (
        f"\n…[TRUNCATED at {_TOOL_RESULT_LIMIT} chars / total {len(s)} chars. "
        "더 좁은 범위로 재요청하거나 페이지네이션 사용]"
    )
    return head + suffix


def _sanitize_history(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """깨진 history (압축 페어 손상 등) 정리.

    Anthropic 검증 규칙 위반 패턴 제거:
      1. orphan user(tool_result_only) — 이전 assistant 의 tool_use 가 사라진 경우
      2. orphan assistant(tool_use 미응답) — 다음 user(tool_result) 가 없는 경우 → tool_use 블록만 제거하고 text 보존

    돌이킬 수 없는 손상은 사용자 화면엔 평범한 dialog 로 보이게 텍스트만 살림.
    """
    if not history:
        return history

    # 정방향 1패스 — assistant 의 tool_use_id 들을 outstanding set 에 모으고,
    # 다음 user(tool_result) 의 tool_use_id 가 매칭되면 소비, 안 되면 제거.
    outstanding_tool_use_ids: set[str] = set()
    out: list[dict[str, Any]] = []

    for msg in history:
        role = msg.get("role")
        content = msg.get("content")

        if role == "assistant":
            if isinstance(content, list):
                tool_use_ids = [
                    b.get("id")
                    for b in content
                    if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("id")
                ]
                outstanding_tool_use_ids.update(tool_use_ids)
            out.append(msg)
            continue

        if role == "user" and isinstance(content, list):
            kept_blocks: list[dict[str, Any]] = []
            had_tool_result = False
            for b in content:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    had_tool_result = True
                    tu_id = b.get("tool_use_id")
                    if tu_id and tu_id in outstanding_tool_use_ids:
                        outstanding_tool_use_ids.discard(tu_id)
                        kept_blocks.append(b)
                    # orphan tool_result — drop silently
                else:
                    kept_blocks.append(b)
            if not kept_blocks:
                # 통째 orphan — 메시지 자체 제거
                continue
            if had_tool_result and kept_blocks != content:
                # 일부만 유지 — 새 dict 로 교체
                out.append({"role": "user", "content": kept_blocks})
            else:
                out.append(msg)
            continue

        out.append(msg)

    # outstanding_tool_use_ids 가 비어있어야 정상. 남아있으면 마지막 assistant 의
    # tool_use 들이 응답 못 받은 채 끝난 것 → 다음 stream() 호출 시 에러. 빈 tool_result
    # 로 닫아주는 user 메시지 합성.
    if outstanding_tool_use_ids:
        seal = [
            {
                "type": "tool_result",
                "tool_use_id": tu_id,
                "content": '{"error":"tool_result_lost_recovery_seal"}',
            }
            for tu_id in outstanding_tool_use_ids
        ]
        out.append({"role": "user", "content": seal})

    return out


def _usage_to_dict(usage: Any) -> dict[str, int]:
    if usage is None:
        return {"input_tokens": 0, "output_tokens": 0}
    return {
        "input_tokens": int(getattr(usage, "input_tokens", 0) or 0),
        "output_tokens": int(getattr(usage, "output_tokens", 0) or 0),
        "cache_read_input_tokens": int(getattr(usage, "cache_read_input_tokens", 0) or 0),
        "cache_creation_input_tokens": int(getattr(usage, "cache_creation_input_tokens", 0) or 0),
    }
