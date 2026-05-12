"""Sonnet planner — Anthropic messages.create tool loop + prompt caching.

§D, §O 구현. system 4 블록 (시나리오 / 작품 메타 / 대화 요약 / [최근 메시지 messages 안에]).
앞 3 블록은 cache_control: ephemeral 로 마크 → 5분 TTL prompt cache 활용.
"""

from __future__ import annotations

import asyncio
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

# planner loop 안 history 가 누적되어 Anthropic 200K 한계 (또는 GMS 같은 프록시의
# 더 작은 body 한계) 에 닿으면 stream 호출이 generic 400 ("Model not found" 등) 으로 떨어진다.
# 매 iter 시작에 추정 토큰 가드 — 초과 시 graceful 종료.
# Anthropic 200K - planner 응답 6K - system/tools margin 14K = 안전 ceiling 180K.
PLANNER_MAX_HISTORY_TOKENS = 180_000

# 2-tier hard cap — messages 송신 시 char 단위 분리 예산.
# token estimate 는 한국어 과소추정 위험이 있어 안전한 char 단위 직접 측정 채택.
# system + tools 는 cached infra (15K) 라 별도. 아래는 messages 배열 chars 만.
PAST_HISTORY_CHAR_CAP = 20_000      # 이전 user/assistant + 이전 cycle tool I/O
CURRENT_CYCLE_CHAR_CAP = 50_000     # 현재 cycle: 현재 user message + 도구 호출/결과 누적
TOTAL_MESSAGES_CHAR_CAP = PAST_HISTORY_CHAR_CAP + CURRENT_CYCLE_CHAR_CAP    # 70K

# Tool result decay — 최근 N개 tool exchange 만 본문 유지, 그 이전은 placeholder 로 교체.
# Anthropic 페어 검증 (assistant.tool_use ↔ user.tool_result 의 tool_use_id 매칭) 은 유지하면서
# tool_result.content 본문만 짧은 메모로 치환 — 토큰 70~90% 절감, 페어 구조는 보존.
# 모델은 자기 직전 답변에 결과를 이미 통합해 인용했으므로 옛 raw 결과 재참조 필요 빈도 낮음.
# placeholder 에 도구명 + 원본 char 수를 박아 모델이 "어떤 도구의 결과였는지" 즉시 인지 → 재호출 결정 정확화.
KEEP_RECENT_TOOL_RESULTS = 6


def _build_decay_placeholder(tool_name: str, original_chars: int) -> str:
    """도구명 + 원본 크기 정보 박힌 placeholder. 모델이 어떤 도구의 결과였는지 즉시 인지."""
    if tool_name:
        return (
            f"[{tool_name} 결과 ({original_chars}자) 생략 — 컨텍스트 절약. "
            "필요 시 같은 도구 재호출.]"
        )
    return (
        f"[이전 도구 결과 ({original_chars}자) 생략 — 컨텍스트 절약. "
        "필요 시 같은 도구 재호출.]"
    )


def _is_decay_placeholder(text: str) -> bool:
    """placeholder 인지 식별 (idempotent decay 위해 재처리 방지)."""
    if not isinstance(text, str):
        return False
    return text.startswith("[") and "결과" in text and "생략" in text and "재호출" in text

# Batch decay 임계 — 매 iter decay 하면 boundary 가 1씩 밀려 cache 가 매번 무효화된다.
# 대신 옛 (KEEP_RECENT 이전) tool_result 들의 verbatim content 누적이 임계 도달했을 때만
# 한꺼번에 decay → cache invalidation 은 batch 시점 1회만, 그 사이엔 안정.
TOOL_RESULT_DECAY_BATCH_THRESHOLD = 8_000


def _with_tools_cache(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """tools 배열의 마지막 항목에 ``cache_control: ephemeral`` 부착.

    Anthropic 의 prompt caching 은 cache_control 이 붙은 블록과 그 이전 모든 블록을
    캐시 단위로 본다. tools 배열에 한 번만 cache_control 을 마킹하면 전체 도구 스키마가
    캐싱 대상이 되어, 첫 호출 후 (5분 TTL 내) 다음 호출 시 input_tokens 의 4~8K 분
    (auto 시나리오 39개 도구 schema) 이 0.1× 단가로 청구된다.

    공유 MCP_TOOLS 리스트를 직접 변형하지 않도록 항상 새 dict 로 복제 후 첨부.
    """
    if not tools:
        return tools
    out = list(tools)
    last = dict(out[-1])
    last["cache_control"] = {"type": "ephemeral"}
    out[-1] = last
    return out


def _decay_old_tool_results(
    messages: list[dict[str, Any]],
    keep_recent: int = KEEP_RECENT_TOOL_RESULTS,
) -> list[dict[str, Any]]:
    """오래된 user.tool_result 의 content 를 placeholder 로 교체.

    Anthropic API 검증 규칙:
      - assistant.tool_use ↔ user.tool_result.tool_use_id 페어 유지 필수.
    이 함수는 페어 구조와 tool_use_id 는 그대로 두고 tool_result.content 본문만 치환 →
    400 에러 없이 토큰만 줄임. 가장 최근 keep_recent 개 tool_result 는 본문 유지.

    keep_recent=0 으로 호출하면 모든 tool_result 를 placeholder 로 치환 — past history
    경계 정리 (continuation 시 과거 cycle 의 raw 데이터 완전 제거) 용도.

    파괴적 변경 방지 — 새 list/dict 로 복제. 원본 history 는 DB 저장된 그대로 보존.
    """
    if not messages:
        return messages
    # 1) tool_use_id → tool_name 매핑 — placeholder 에 도구명 박기 위한 lookup table.
    #    이전 assistant.tool_use 블록들에서 한 번에 수집.
    tool_use_name_by_id: dict[str, str] = {}
    for m in messages:
        if m.get("role") != "assistant":
            continue
        c = m.get("content")
        if not isinstance(c, list):
            continue
        for b in c:
            if isinstance(b, dict) and b.get("type") == "tool_use":
                tu_id = b.get("id", "")
                tu_name = b.get("name", "")
                if tu_id:
                    tool_use_name_by_id[tu_id] = tu_name
    # 2) tool_result 들의 (msg_idx, block_idx) 을 등장 순으로 수집
    positions: list[tuple[int, int]] = []
    for mi, m in enumerate(messages):
        if m.get("role") != "user":
            continue
        c = m.get("content")
        if not isinstance(c, list):
            continue
        for bi, b in enumerate(c):
            if isinstance(b, dict) and b.get("type") == "tool_result":
                positions.append((mi, bi))
    if keep_recent > 0 and len(positions) <= keep_recent:
        return messages    # 충분히 적음 — 변경 불필요
    # 3) 마지막 keep_recent 개 제외, 그 이전은 decay 대상.
    #    keep_recent=0 이면 전체 decay 대상.
    if keep_recent > 0:
        decay_set = set(positions[: -keep_recent])
    else:
        decay_set = set(positions)
    if not decay_set:
        return messages
    # 4) 새 messages 합성 (얕은 복사 + 대상 block 만 치환)
    out: list[dict[str, Any]] = []
    for mi, m in enumerate(messages):
        c = m.get("content")
        if not isinstance(c, list):
            out.append(m)
            continue
        new_c = list(c)
        changed = False
        for bi, b in enumerate(c):
            if (mi, bi) in decay_set and isinstance(b, dict) and b.get("type") == "tool_result":
                tu_id = b.get("tool_use_id", "")
                tool_name = tool_use_name_by_id.get(tu_id, "")
                existing = b.get("content", "")
                # 이미 placeholder 면 재처리 skip (idempotent)
                if isinstance(existing, str) and _is_decay_placeholder(existing):
                    continue
                original_chars = len(existing) if isinstance(existing, str) else 0
                new_c[bi] = {
                    "type": "tool_result",
                    "tool_use_id": tu_id,
                    "content": _build_decay_placeholder(tool_name, original_chars),
                }
                changed = True
        if changed:
            out.append({**m, "content": new_c})
        else:
            out.append(m)
    return out


def _accumulated_old_tool_result_chars(messages: list[dict[str, Any]]) -> int:
    """KEEP_RECENT_TOOL_RESULTS 보다 오래된 위치의 tool_result 중 아직 verbatim
    (placeholder 치환 안 된) 인 것들의 char 누적 합. Batch decay 임계 판단용.
    """
    positions: list[tuple[int, int]] = []
    for mi, m in enumerate(messages):
        if m.get("role") != "user":
            continue
        c = m.get("content")
        if not isinstance(c, list):
            continue
        for bi, b in enumerate(c):
            if isinstance(b, dict) and b.get("type") == "tool_result":
                positions.append((mi, bi))
    if len(positions) <= KEEP_RECENT_TOOL_RESULTS:
        return 0
    candidates = positions[: -KEEP_RECENT_TOOL_RESULTS]
    total = 0
    for mi, bi in candidates:
        block = messages[mi]["content"][bi]
        if isinstance(block, dict):
            existing = block.get("content", "")
            # 이미 decay placeholder 이면 카운트 안 함 (idempotent)
            if isinstance(existing, str) and not _is_decay_placeholder(existing):
                total += len(existing)
    return total


def _count_messages_chars(messages: list[dict[str, Any]]) -> int:
    """messages 의 JSON 직렬화 길이 (chars) — hard cap 측정용. token 추정 X."""
    import json
    try:
        return len(json.dumps(messages, ensure_ascii=False))
    except Exception:
        return sum(len(str(m)) for m in messages)


def _find_current_cycle_start(history: list[dict[str, Any]]) -> int:
    """현재 cycle 의 시작 인덱스 — 가장 최근의 'user text' 메시지 위치.
    user 의 tool_result 메시지는 cycle 중간이라 제외. content 가 str 인 user 메시지 = cycle 시작.
    """
    for i in range(len(history) - 1, -1, -1):
        m = history[i]
        if m.get("role") == "user" and isinstance(m.get("content"), str):
            return i
    return 0


def _drop_oldest_pair(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """가장 오래된 (user, assistant) 페어 1쌍을 drop.
    Anthropic messages[0] = user 규칙 보존을 위해 user→assistant 순으로 같이 제거.
    인접한 tool_result-only user 메시지도 같은 cycle 잔재라 함께 drop.
    """
    if not history:
        return history
    i = 0
    # 첫 user 페어 + 그 cycle 의 tool_result 들 모두 drop
    n = len(history)
    # 첫 user 1개 drop
    if i < n and history[i].get("role") == "user":
        i += 1
    # 이어지는 assistant + tool_result 시퀀스 drop (다음 user_text 만나기 직전까지)
    while i < n:
        m = history[i]
        if m.get("role") == "user" and isinstance(m.get("content"), str):
            break    # 다음 user_text — cycle 시작
        i += 1
    return history[i:]


def _with_messages_cache(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """가장 최근 메시지의 마지막 content block 에 ``cache_control: ephemeral`` 부착.

    Anthropic prompt cache 는 cache_control 이 붙은 블록 + 그 직전 모든 블록을 한 캐시 단위로
    본다. 매 iteration 마다 history 가 누적되는데 (system+tools 캐싱만으로는) 누적된 messages 는
    매번 fresh input 으로 청구되어 비용이 quadratic 폭증한다. 마지막 메시지에 cache 마커를
    찍어두면 다음 iter 의 stream() 호출 시 그 prefix 전체가 cache_read (0.1× 단가).

    파괴적 변경 방지를 위해 마지막 메시지만 shallow copy. content 가 list 면 마지막 block 만,
    string 이면 list 로 변환 후 마킹.
    """
    if not messages:
        return messages
    out = list(messages)
    last = dict(out[-1])
    content = last.get("content")
    if isinstance(content, str):
        # 문자열 → text block 리스트로 변환 + cache_control
        last["content"] = [{"type": "text", "text": content, "cache_control": {"type": "ephemeral"}}]
    elif isinstance(content, list) and content:
        new_content = list(content)
        last_block = dict(new_content[-1]) if isinstance(new_content[-1], dict) else None
        if last_block is not None:
            last_block["cache_control"] = {"type": "ephemeral"}
            new_content[-1] = last_block
            last["content"] = new_content
    out[-1] = last
    return out


def _build_system_blocks(
    scenario_prompt: str,
    work_meta_block: str,
    summary_so_far: str | None,
) -> list[dict[str, Any]]:
    """system text 블록들. cache_control 은 ★마지막 블록 하나에만★ — Anthropic 의
    cache marker 한도(요청당 4개) 절약. 마지막 블록에 마커가 있으면 그 직전 모든 블록까지
    한 캐시 단위로 묶인다 (블록 단위 변하지 않으므로 단일 마커로 충분).
    """
    blocks: list[dict[str, Any]] = [
        {"type": "text", "text": scenario_prompt},
        {"type": "text", "text": work_meta_block},
    ]
    if summary_so_far:
        blocks.append({"type": "text", "text": f"[이전 대화 요약]\n{summary_so_far}"})
    # 마지막 블록에만 마커 부착
    blocks[-1] = {**blocks[-1], "cache_control": {"type": "ephemeral"}}
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
    tools = _with_tools_cache(filter_tools(allowed))
    system_blocks = _build_system_blocks(scenario["system_prompt"], work_meta_block, summary_so_far)

    llm = get_llm()
    client = getattr(llm, "_client", None)
    sonnet_model = getattr(llm, "_sonnet_model", None)
    if client is None or sonnet_model is None:
        raise RuntimeError("LLM provider lacks Anthropic client (Fake provider unsupported for planner).")

    # ⚠ history sanity: 옛 thread (압축이 페어를 깨뜨렸던 시기) 의 손상된 messages 가
    # 들어올 수 있다. orphan tool_result / orphan tool_use 를 제거 — Anthropic 400 차단.
    history = _sanitize_history(history)

    # ★ 선제 전체 decay — 현재 시점의 history 는 전부 "과거 cycle" 이다.
    # 사용자 신규 메시지를 append 하기 직전이므로 이 history 의 모든 tool_result 는
    # 직전 cycle 들의 결과물 → 새 cycle 에 필요한 raw 데이터 0.
    # keep_recent=0 으로 호출해 KEEP_RECENT 무시하고 전체 placeholder 치환.
    # → 새 cycle 시작 시점에 과거 cycle 의 raw 텍스트는 history 에서 사라짐.
    #   ("이전 히스토리에는 도구 raw 텍스트 안 들어감, 도구 호출 흐름만 유지" 보장)
    decayed = _decay_old_tool_results(history, keep_recent=0)
    if decayed is not history:
        before_chars = _count_messages_chars(history)
        history = decayed
        after_chars = _count_messages_chars(history)
        if before_chars != after_chars:
            logger.info(
                "planner.tool_result_preload_decay_all scenario=%s before=%d after=%d",
                scenario_name, before_chars, after_chars,
            )

    # ★ Past history hard cap (20K chars) — 무슨 일이 있어도 이전 대화 부분은 이 한도 안에.
    # 계단식 축소: (1) decay 재적용 (2) force compression (3) 가장 오래된 페어부터 drop.
    from app.agent.session import maybe_compress as _maybe_compress_for_cap
    past_chars = _count_messages_chars(history)
    if past_chars > PAST_HISTORY_CHAR_CAP:
        # (1) decay 재시도 — KEEP_RECENT 무시하고 전체 옛 tool_result 강제 decay
        history = _decay_old_tool_results(history)
        past_chars = _count_messages_chars(history)
        logger.info(
            "planner.past_cap_decay scenario=%s after_decay_chars=%d cap=%d",
            scenario_name, past_chars, PAST_HISTORY_CHAR_CAP,
        )
    # (2) 여전히 초과면 force maybe_compress (Haiku 1회 호출로 옛 head 요약)
    compression_attempts = 0
    while past_chars > PAST_HISTORY_CHAR_CAP and compression_attempts < 3:
        compression_attempts += 1
        try:
            new_history, new_summary, did = await _maybe_compress_for_cap(
                history, summary_so_far, budget, force=True
            )
            if not did:
                break    # 압축 불가 (head 부족 등) — (3) 단계로
            history = new_history
            summary_so_far = new_summary
            system_blocks = _build_system_blocks(
                scenario["system_prompt"], work_meta_block, summary_so_far
            )
            past_chars = _count_messages_chars(history)
            logger.info(
                "planner.past_cap_force_compress scenario=%s attempt=%d after_chars=%d",
                scenario_name, compression_attempts, past_chars,
            )
        except BudgetExceeded:
            raise
        except Exception as e:
            logger.warning("planner.past_cap_compress_failed: %s", str(e)[:200])
            break
    # (3) 마지막 안전 그물 — 그래도 초과면 가장 오래된 페어부터 drop
    drop_attempts = 0
    while past_chars > PAST_HISTORY_CHAR_CAP and drop_attempts < 10 and len(history) > 2:
        drop_attempts += 1
        history = _drop_oldest_pair(history)
        past_chars = _count_messages_chars(history)
    if drop_attempts > 0:
        logger.warning(
            "planner.past_cap_drop_oldest scenario=%s drops=%d final_chars=%d",
            scenario_name, drop_attempts, past_chars,
        )

    # 사용자 신규 메시지를 history 에 append
    history.append({"role": "user", "content": user_message})

    suggestion_ids: list[str] = []
    final_text: str | None = None
    # 이번 user request cycle 에서 propose_episode_draft 가 성공했는지 추적.
    # cycle 종료 시 (loop break) 마지막 assistant wrap-up text 도 placeholder 로 치환해
    # 다음 cycle 의 history bloat 방지. 모델은 시나리오 prompt 지시대로 "본문 텍스트 →
    # propose 호출" 패턴을 따른 뒤, 추가로 "최종 답변" wrap-up 으로 같은 본문을 다시
    # 출력하는 경향이 있어 같은 본문이 history 에 두 번 등장한다.
    episode_draft_proposed_in_cycle = False

    while True:
        # ★ Current cycle hard cap (50K chars) — 현재 user 메시지 + 이후 도구 호출/결과 누적.
        # 매 iter 시작에 검사. 초과 시 in-cycle decay 시도 → 그래도 초과면 graceful break.
        cycle_start = _find_current_cycle_start(history)
        cycle_chars = _count_messages_chars(history[cycle_start:])
        if cycle_chars > CURRENT_CYCLE_CHAR_CAP:
            # 1차 시도: in-cycle 옛 tool_result decay (KEEP_RECENT 무시)
            history = _decay_old_tool_results(history)
            cycle_chars_after = _count_messages_chars(history[cycle_start:])
            if cycle_chars_after < cycle_chars:
                logger.info(
                    "planner.cycle_cap_decay scenario=%s before=%d after=%d cap=%d",
                    scenario_name, cycle_chars, cycle_chars_after, CURRENT_CYCLE_CHAR_CAP,
                )
                cycle_chars = cycle_chars_after
            # 2차: 여전히 초과면 graceful break
            if cycle_chars > CURRENT_CYCLE_CHAR_CAP:
                final_text = (
                    f"(현재 cycle 의 도구 호출 결과가 한도({CURRENT_CYCLE_CHAR_CAP:,}자)를 초과해 "
                    "추가 추론을 중단합니다. 같은 thread 의 [압축] 버튼으로 정리하거나 "
                    "더 적은 도구로 다시 요청해주세요.)"
                )
                logger.warning(
                    "planner.cycle_cap_break scenario=%s cycle_chars=%d cap=%d",
                    scenario_name, cycle_chars, CURRENT_CYCLE_CHAR_CAP,
                )
                break

        # ★ iterative compression — 매 iter 시작에 maybe_compress 호출.
        # DB 영속 history 와 별개로 ★요청 송신용 in-memory history 만★ 동적 축소.
        # maybe_compress 내부 임계 (40 msg / 100K tok) 미만이면 즉시 no-op return (Haiku 호출 X).
        # 임계 이상이면 옛 head 를 Haiku 1회 호출로 요약해서 summary_so_far 에 합치고
        # tail (최근 메시지) 만 history 로 유지 — 즉 매번 다음 요청은 안전한 크기로 송신.
        # tool_use ↔ tool_result 페어와 messages[0]=user 규칙은 _split_preserving_tool_pairs 가 보존.
        from app.agent.session import estimate_messages_tokens, maybe_compress as _maybe_compress
        try:
            new_history, new_summary, did_compress = await _maybe_compress(
                history, summary_so_far, budget
            )
            if did_compress:
                history = new_history
                summary_so_far = new_summary
                # summary 가 갱신됐으니 system block 재빌드 — 새 summary 가 캐시 prefix 에 포함.
                system_blocks = _build_system_blocks(
                    scenario["system_prompt"], work_meta_block, summary_so_far
                )
                logger.info(
                    "planner.iter_compress scenario=%s after_tokens=%d msgs=%d",
                    scenario_name, estimate_messages_tokens(history), len(history),
                )
        except BudgetExceeded:
            raise
        except Exception as e:
            # 압축 실패는 치명적 X — 다음 가드(ceiling) 가 차단. 로그만 남기고 계속.
            logger.warning("planner.iter_compress_failed: %s", str(e)[:200])

        # ★ in-loop 컨텍스트 가드 — 압축 후에도 ceiling 넘으면 graceful 종료.
        # 압축 거부됐거나 (head 너무 작음, tail empty 등) 한 번 압축 후에도 큰 경우 사용자에게 안내.
        est_history_tokens = estimate_messages_tokens(history)
        if est_history_tokens > PLANNER_MAX_HISTORY_TOKENS:
            logger.warning(
                "planner.context_ceiling_hit scenario=%s est_tokens=%d ceiling=%d — graceful break",
                scenario_name, est_history_tokens, PLANNER_MAX_HISTORY_TOKENS,
            )
            final_text = (
                f"(컨텍스트가 누적 한계({PLANNER_MAX_HISTORY_TOKENS:,} tok 추정)에 도달해 추가 추론을 중단했습니다. "
                "현재까지 진행 결과를 반영하며, 같은 thread 의 [압축] 버튼으로 정리 후 이어주세요.)"
            )
            break
        response = None
        last_err: Exception | None = None
        # rate_limit / overload 시 최대 3회 backoff (2s → 5s → 10s)
        for attempt, backoff in enumerate([2, 5, 10], start=1):
            try:
                # 새 assistant turn 시작 신호 — 프론트가 새 메시지 버블 띄우도록
                if event_emit:
                    event_emit({"event_type": "assistant_start"})
                # high-level streaming — messages.stream() 의 검증된 helper 사용.
                # text_delta 만 forward 하면 충분 (C-2: 본문은 자연어로 흐름. tool input json
                # streaming 은 anthropic default buffering 이라 어차피 batch — forward 무의미).
                # get_final_message() 가 response.content / usage / stop_reason 자동 합성.
                # messages 마지막 블록에 cache_control 마킹 → 다음 iter 에서 prefix cache_read
                # (system + tools 까지 합쳐 cache breakpoint 4개 한도 내 = system 3 + tools 1 + msg 1
                # 인데 summary_so_far 없으면 4개, 있으면 5개라 마지막 system 캐시 마킹은 summary 가
                # 있을 때 빼고 모두 안전. summary 있을 때도 messages 캐시가 가장 큰 비용 절감이라
                # priority 적용. Anthropic 은 마커 4개까지 — 초과 시 가장 이전 마커 무시.)
                # 마지막 메시지에 cache_control 마커 — prefix cache_read 회수.
                # 원본 history (DB 영속) 는 그대로 두고 stream 호출용 복제만 가공.
                # ⚠ 이전에 _decay_old_tool_results (오래된 tool_result 본문 치환) 을 거쳤으나,
                # 매 iter decay boundary 가 1 씩 밀려 직전까지 verbatim 이던 tool_result 가
                # placeholder 로 바뀌면 prefix cache 가 그 지점부터 무효화 → cache_create 폭발.
                # token 절감 효과보다 cache 무효화 손실이 훨씬 큼 → 비활성. 컨텍스트 초과는
                # PLANNER_MAX_HISTORY_TOKENS 가드 + maybe_compress 가 책임진다.
                cached_messages = _with_messages_cache(history)
                async with client.messages.stream(
                    model=sonnet_model,
                    max_tokens=PLANNER_MAX_TOKENS,
                    system=system_blocks,
                    tools=tools,
                    messages=cached_messages,
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

            # ★ Wrap-up text 도 trim — propose_episode_draft 가 이번 cycle 에서 성공했다면
            # 모델이 "최종 답변" 으로 본문을 다시 출력하는 경향이 있어 history 에 같은 본문이
            # 중복 누적된다 (Plan B 는 propose 직후 turn 만 trim 함). 마지막 assistant text
            # (방금 추가한 history[-1]) 의 긴 텍스트도 placeholder 로 치환해 다음 user
            # request 시작 시 body bloat 방지.
            if (
                episode_draft_proposed_in_cycle
                and len(history) >= 1
                and history[-1].get("role") == "assistant"
            ):
                wrap_content = history[-1].get("content")
                if isinstance(wrap_content, list):
                    new_wrap_blocks: list[dict[str, Any]] = []
                    wrap_trimmed_total = 0
                    for block in wrap_content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            text = block.get("text") or ""
                            if len(text) > 500:
                                wrap_trimmed_total += len(text)
                                new_wrap_blocks.append({
                                    "type": "text",
                                    "text": (
                                        f"(이미 propose 완료된 본문 {len(text)}자 — DB 에 저장됨. "
                                        "필요 시 read_episode_plaintext 도구로 재조회)"
                                    ),
                                })
                                continue
                        new_wrap_blocks.append(block)
                    if wrap_trimmed_total > 0:
                        history[-1] = {**history[-1], "content": new_wrap_blocks}
                        logger.info(
                            "planner.propose_wrapup_trimmed scenario=%s saved_chars=%d",
                            scenario_name, wrap_trimmed_total,
                        )
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

        # ★ C-2 (2026-05-10): propose_episode_draft 의 content 자동 합성.
        # anthropic 의 tool_use input JSON 은 default 로 buffered (token streaming 불가).
        # 시나리오 prompt 가 모델에게 본문은 자연어(text content) 로 출력 후 propose 호출하도록
        # 지시 → 사용자가 본문을 라이브로 봄. 그 후 백엔드(여기) 가 직전 text content 를 추출해
        # propose 의 input.content 로 자동 주입.
        # Fallback: 모델이 prompt 무시하고 직접 채워 호출하면 그 값 우선 (기존 동작).
        prev_text_content = ""
        for b in (content if isinstance(content, list) else []):
            if getattr(b, "type", None) == "text":
                t = getattr(b, "text", "") or ""
                prev_text_content += t

        tool_results: list[dict[str, Any]] = []
        budget_aborted: BudgetExceeded | None = None
        # 어떤 heavy propose 도구가 성공했는지 추적 — 직후 history 의 assistant text 를
        # placeholder 로 치환해 다음 iter 의 request body 크기 폭주를 차단.
        # 한국어 본문 4K chars 는 ensure_ascii=True 직렬화 시 25KB+ body bytes 가 되고,
        # 연속 episode 생성 시 누적되어 GMS gateway body limit 을 초과 → 400 발생.
        heavy_propose_succeeded = False
        for tu in tool_uses:
            name = getattr(tu, "name", "")
            tu_id = getattr(tu, "id", "")
            args = getattr(tu, "input", {}) or {}
            # propose_episode_draft 자동 본문 합성 — 모델이 content 비워두고 호출한 경우만.
            if (
                name == "propose_episode_draft"
                and isinstance(args, dict)
                and not (args.get("content") or "").strip()
                and prev_text_content.strip()
            ):
                args = {**args, "content": prev_text_content.strip()}
                logger.info(
                    "planner.propose_episode_draft.content_synthesized title=%s text_len=%d",
                    str(args.get("title", ""))[:40], len(prev_text_content),
                )
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
                # propose_episode_draft (또는 본문성 propose) 가 suggestion_id 까지 발행됐다 =
                # 본문이 DB 에 적재 완료. 그 본문이 더 이상 history 의 assistant text 에
                # 머물러 다음 iter 들의 prompt 크기를 키울 필요 없음.
                if name in ("propose_episode_draft",):
                    heavy_propose_succeeded = True
                    episode_draft_proposed_in_cycle = True
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tu_id,
                "content": _format_tool_result(result),
            })
        history.append({"role": "user", "content": tool_results})

        # ★ Body bloat 완화 — propose_episode_draft 성공 직후 그 assistant turn 의 긴
        # text content 를 짧은 placeholder 로 치환. 모델이 재참조해야 하면
        # read_episode_plaintext 도구로 DB 에서 다시 불러올 수 있다.
        # tool_use 블록은 그대로 보존 (Anthropic 이 tool_use ↔ tool_result 짝맞춤 검증).
        # 500 chars 이상의 본문성 text 만 대상 — "이제 5화 작성하겠습니다" 같은 짧은 멘트는 유지.
        if heavy_propose_succeeded and len(history) >= 2 and history[-2].get("role") == "assistant":
            asst_content = history[-2].get("content")
            if isinstance(asst_content, list):
                new_blocks: list[dict[str, Any]] = []
                trimmed_total = 0
                for block in asst_content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        text = block.get("text") or ""
                        if len(text) > 500:
                            trimmed_total += len(text)
                            new_blocks.append({
                                "type": "text",
                                "text": (
                                    f"(propose 완료 — 본문 {len(text)}자는 DB 에 저장됨. "
                                    "필요 시 read_episode_plaintext 도구로 재조회)"
                                ),
                            })
                            continue
                    new_blocks.append(block)
                if trimmed_total > 0:
                    history[-2] = {**history[-2], "content": new_blocks}
                    logger.info(
                        "planner.propose_text_trimmed scenario=%s saved_chars=%d",
                        scenario_name, trimmed_total,
                    )

        # ★ Tool result batch decay — 옛 tool_result raw 본문 누적이 임계 도달했을 때만
        # 한 번에 placeholder 치환. 매 iter decay 하면 boundary 가 1씩 밀려 cache 가
        # 매번 무효화되지만, batch 방식은 임계 도달 시점에만 1회 invalidate → 그 사이엔 안정.
        # 모델은 옛 raw 결과가 필요하면 같은 도구를 다시 호출할 수 있다 (placeholder 안내 문구).
        # 사용자 메시지/assistant text/tool_use 메타는 그대로 — "대화 흐름" 보존.
        accumulated_old_chars = _accumulated_old_tool_result_chars(history)
        if accumulated_old_chars >= TOOL_RESULT_DECAY_BATCH_THRESHOLD:
            decayed_history = _decay_old_tool_results(history)
            if decayed_history is not history:
                history = decayed_history
                logger.info(
                    "planner.tool_result_batch_decay scenario=%s accumulated_chars=%d",
                    scenario_name, accumulated_old_chars,
                )

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
