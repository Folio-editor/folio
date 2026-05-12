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
from app.agent.scenarios import INTENT_TOOL_SUBSETS, classify_intent, get_scenario
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
#
# 100K 총량: past 10K (작업 흐름 파악 — 최근 turn 요약/최종답 + tool_use 메타) + current 90K
# (현재 turn 의 도구 호출·결과 풍부히). 200K Anthropic 한도 대비 system+tools 20K + planner
# output 6K 빼도 안전 마진 74K — GMS 프록시 body 한도 부담 적은 수준에서 검수·초안의
# 도구 결과 압박 해소.
PAST_HISTORY_CHAR_CAP = 10_000      # (legacy) 이전 user/assistant + 이전 cycle tool 메타 (raw 본문은 preload decay 로 0)
# ★ GMS Express body-parser 한도(~100KB)의 10% — 이전 대화 기록 영역. 한국어 1자=3bytes.
# 새 cycle 시작 직전 past history 가 이 한도 초과면 Haiku 로 통째 요약 → summary_so_far 누적.
PAST_HISTORY_BYTE_LIMIT = 10_000
# ★ summary_so_far (system 의 [이전 대화 요약] 블록 텍스트) 최대 byte. 누적 압축으로 부풀지 않게 강제.
SUMMARY_BYTE_LIMIT = 10_000
CURRENT_CYCLE_CHAR_CAP = 90_000     # 현재 cycle: 도구 호출/결과 누적 — 50K+ 데이터 검수도 여유
TOTAL_MESSAGES_CHAR_CAP = PAST_HISTORY_CHAR_CAP + CURRENT_CYCLE_CHAR_CAP    # 100K

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

# Decay 면역 도구 — 본문 라인 번호·원문 인용 정확성이 propose_* 호출 정합성에 필수인 도구.
# 검수 시나리오에서 fetch_episode_plaintext 결과가 decay 되면 모델이 본문 없는 상태에서
# lines=[N] 을 추측해 propose_review_issue 를 던지는 환각 발생 (검수 품질 망가짐).
# 본 set 의 도구는 같은 cycle 안에서 in-cycle decay / batch decay 의 대상에서 제외된다.
# 다음 cycle 시작 시점의 preload decay (keep_recent=0) 는 면역 X — 과거 cycle 본문은 정리.
DECAY_PINNED_TOOLS: set[str] = {
    "fetch_episode_plaintext",
}

# ★ Decay 제외 — 결과 자체가 "이미 정제된 분석 의견" 인 도구.
# 이 도구들은 결과를 잃으면 종합 보고서의 근거가 사라진다 (Haiku 가 정리한 분석/가설
# 검증 결과). Sonnet 이 최종 5축 보고서를 쓸 때 이 결과들을 다시 읽어 사고와 매칭해야
# 가설 검증이 의미를 갖는다. raw 가 작아 (~1~3K) 보존해도 body 부담 미미.
#
# - query_episodes_by_chunks: Haiku 합성 분석 의견 (벡터 검색 후 답변 생성).
# - analyze_episode: Haiku 자유 task 추출.
# - invoke_haiku_worker: 명시적 Haiku 위임 결과.
# - summarize_episode: 12필드 요약 (캐시).
# - check_spelling: Haiku 표기 오류 분류.
# - character_arc/timeline_scan/track_foreshadow: 회차별 분석 시계열 — 5축 종합 근거.
# - list_all_oneline_summaries/list_episode_summaries: 작품 전체 시야.
# - get_*: drill 도구 (Haiku 미들웨어 압축).
# - propose_*: suggestion_id 만 짧게 반환.
#
# 면제되는 도구 (decay 가능): fetch_episode_plaintext (DECAY_PINNED 가 별도 처리 — 라인
# 정확성 우선), list_episodes/list_characters/list_world_notes/list_plots (peek 메타 —
# 크지 않아 자연 보존되지만 명시).
DECAY_EXEMPT_TOOLS: set[str] = {
    "query_episodes_by_chunks",
    "analyze_episode",
    "invoke_haiku_worker",
    "summarize_episode",
    "check_spelling",
    "character_arc",
    "timeline_scan",
    "track_foreshadow",
    "list_all_oneline_summaries",
    "list_episode_summaries",
    "get_episode_summary",
    "get_character",
    "get_world_note",
    "get_plot",
    "search_episode_chunks",
    "search_episode_summaries",
    "find_relevant_episodes",
    "ensure_recent_summaries",
    "propose_review_issue",
    "propose_spelling_fix",
    "propose_spelling_fix_batch",
    "propose_character",
    "propose_character_update",
    "propose_character_delete",
    "propose_world_note",
    "propose_world_note_update",
    "propose_world_note_delete",
    "propose_plot_create",
    "propose_plot_tree",
    "propose_plot_revision",
    "propose_plot_delete",
    "propose_episode_draft",
    "propose_episode_update",
    "propose_episode_delete",
    "request_episode_summary_backfill",
    "list_episodes",
    "list_characters",
    "list_world_notes",
    "list_plots",
}


# ============================================================
# Extract & Compact — 정보 추출 후 raw 폐기 패턴
# ============================================================
# ★ 안전 플래그 — True 면 EARLY_COMPACT 활성, False 면 비활성 (디버그·롤백용).
# 13회 호출 시점 GMS 400 (Model not found) 가 compaction 으로 인한 본문 구조 손상
# 가능성 의심되어 기본 False 로 두고 안전 검증 후 활성화.
ENABLE_EARLY_COMPACT = True

# 아래 set 의 도구는 결과가 "단발성" — orchestrator 가 한 번 보고 id/이름 매핑만 추출하면
# 나머지 raw 는 후속 turn 에 dead weight. 가장 최근 tool_result 는 유지하되, 그보다 오래된
# (즉 다음 assistant turn 이 한 번이라도 지난) EARLY_COMPACT tool_result 는 도구별
# compactor 가 핵심 정보만 추려 짧은 노트로 치환한다.
#
# 보존 원칙:
#   - title→id / name→id 매핑은 100% 보존 (후속 임의 회차 drill 좌표).
#   - 확정 사실 (백필 N건, 미요약 M건 등) 보존.
#   - 폐기 대상: word_count, 상세 status 텍스트, 이미 다른 매핑에 있는 id 배열 등.
#
# Master tools (fetch_episode_plaintext, summarize_episode 12필드, query_chunks answer,
# list_all_oneline_summaries, character_arc 등) 는 본 set 에 포함 X — 분석 컨텍스트 끝까지
# 유지. KEEP_RECENT_TOOL_RESULTS 정책만 적용.
EARLY_COMPACT_TOOLS: set[str] = {
    # 한 번 호출 후 title→id / name→id 매핑만 보존하면 충분한 peek/lookup 도구.
    # 가장 최근 호출은 raw 유지, 그 이전 호출은 compact 노트로 치환.
    "list_episodes",
    "list_characters",
    "list_world_notes",
    "list_plots",
    "ensure_recent_summaries",
}


def _compact_list_episodes(raw: Any) -> str | None:
    """list_episodes raw → title→id 매핑 + 상태 카운트만 보존하는 compact 노트."""
    if not isinstance(raw, list):
        return None
    total = len(raw)
    status_counts: dict[str, int] = {}
    summary_yes = 0
    id_lines: list[str] = []
    for ep in raw:
        if not isinstance(ep, dict):
            continue
        st = ep.get("status") or "?"
        status_counts[st] = status_counts.get(st, 0) + 1
        if ep.get("has_summary"):
            summary_yes += 1
        title = ep.get("title", "?")
        eid = ep.get("id", "?")
        has = "✓" if ep.get("has_summary") else "✗"
        id_lines.append(f"  {title}: {eid} ({has})")
    if not id_lines:
        return None
    status_str = ", ".join(f"{k}={v}" for k, v in status_counts.items())
    return (
        f"[list_episodes 정보 추출 완료]\n"
        f"총 {total}화 ({status_str}), 요약 {summary_yes}/{total}.\n"
        f"title → id (✓=요약 있음, ✗=미요약):\n"
        + "\n".join(id_lines)
    )


def _compact_list_characters(raw: Any) -> str | None:
    """list_characters raw → name 배열 + id_map 만 보존."""
    if not isinstance(raw, dict):
        return None
    names = raw.get("names") or []
    id_map = raw.get("id_map") or {}
    if not names:
        return None
    lines = [f"  {n}: {id_map.get(n, '?')}" for n in names]
    return (
        f"[list_characters 정보 추출 완료]\n"
        f"인물 {len(names)}명. name → id:\n"
        + "\n".join(lines)
    )


def _compact_list_world_notes(raw: Any) -> str | None:
    """list_world_notes raw → name 배열 + id_map 만 보존."""
    if not isinstance(raw, dict):
        return None
    names = raw.get("names") or []
    id_map = raw.get("id_map") or {}
    if not names:
        return None
    lines = [f"  {n}: {id_map.get(n, '?')}" for n in names]
    return (
        f"[list_world_notes 정보 추출 완료]\n"
        f"세계관 노트 {len(names)}건. name → id:\n"
        + "\n".join(lines)
    )


def _compact_list_plots(raw: Any) -> str | None:
    """list_plots raw → titles + id_map 만 보존."""
    if not isinstance(raw, dict):
        return None
    titles = raw.get("titles") or []
    id_map = raw.get("id_map") or {}
    if not titles:
        return None
    lines = [f"  {t}: {id_map.get(t, '?')}" for t in titles]
    return (
        f"[list_plots 정보 추출 완료]\n"
        f"플롯 {len(titles)}건. title → id:\n"
        + "\n".join(lines)
    )


def _compact_ensure_recent_summaries(raw: Any) -> str | None:
    """ensure_recent_summaries raw → 확정 사실만 보존."""
    if not isinstance(raw, dict):
        return None
    if "error" in raw:
        return None    # 에러는 그대로 (모델이 진단 필요)
    backfilled = raw.get("backfilled") or []
    already = raw.get("already_summarized") or []
    failed = raw.get("failed") or []
    target_idx = raw.get("target_index", "?")
    note = raw.get("note", "")
    bits = [
        f"target_index={target_idx}",
        f"백필 {len(backfilled)}건",
        f"기존 요약 {len(already)}건",
    ]
    if failed:
        bits.append(f"실패 {len(failed)}건")
    summary = " / ".join(bits)
    return f"[ensure_recent_summaries 완료] {summary}. {note}".rstrip(". ")


# tool_name → compactor 함수 매핑
_COMPACTORS: dict[str, Any] = {
    "list_episodes": _compact_list_episodes,
    "list_characters": _compact_list_characters,
    "list_world_notes": _compact_list_world_notes,
    "list_plots": _compact_list_plots,
    "ensure_recent_summaries": _compact_ensure_recent_summaries,
}


def _is_already_compact(text: str) -> bool:
    """compact 노트는 '[xxx 정보 추출 완료]' / '[xxx 완료]' 패턴으로 시작.
    재처리 방지용 idempotent 검사.
    """
    if not isinstance(text, str):
        return False
    stripped = text.lstrip()
    return stripped.startswith("[") and ("정보 추출 완료" in stripped[:50]
                                          or "완료]" in stripped[:50])


def _compact_consumed_tool_results(
    messages: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """EARLY_COMPACT_TOOLS 의 tool_result 중 '가장 최근 외' 항목을 compact 노트로 치환.

    가장 최근 tool_result 는 raw 유지 (방금 결과는 즉시 의사결정 입력으로 필요).
    그 이전 EARLY_COMPACT 대상은 도구별 compactor 로 핵심 정보만 추려 치환.

    파괴적 변경 방지 — 변경 발생 시 새 list/dict 로 복제 반환. 변경 없으면 원본.
    """
    if not messages:
        return messages

    # tool_use_id → tool_name 매핑
    tool_use_name_by_id: dict[str, str] = {}
    for msg in messages:
        if msg.get("role") != "assistant":
            continue
        c = msg.get("content")
        if not isinstance(c, list):
            continue
        for block in c:
            if isinstance(block, dict) and block.get("type") == "tool_use":
                tu_id = block.get("id")
                tu_name = block.get("name", "")
                if isinstance(tu_id, str):
                    tool_use_name_by_id[tu_id] = tu_name

    # tool_result 위치들 (msg_idx, block_idx, tool_use_id, tool_name) 수집
    positions: list[tuple[int, int, str, str]] = []
    for mi, msg in enumerate(messages):
        if msg.get("role") != "user":
            continue
        c = msg.get("content")
        if not isinstance(c, list):
            continue
        for bi, block in enumerate(c):
            if isinstance(block, dict) and block.get("type") == "tool_result":
                tu_id = block.get("tool_use_id", "")
                tool_name = tool_use_name_by_id.get(tu_id, "")
                positions.append((mi, bi, tu_id, tool_name))

    if len(positions) <= 1:
        return messages    # 가장 최근 외 비교 대상 없음

    # 가장 최근 tool_result 제외 = compact 대상 후보
    candidates = positions[:-1]
    targets: list[tuple[int, int, str]] = []
    for mi, bi, _tu_id, tool_name in candidates:
        if tool_name not in EARLY_COMPACT_TOOLS:
            continue
        targets.append((mi, bi, tool_name))
    if not targets:
        return messages

    import json
    changed = False
    out = [dict(m) for m in messages]
    for mi, bi, tool_name in targets:
        msg_content = out[mi].get("content")
        if not isinstance(msg_content, list) or bi >= len(msg_content):
            continue
        block = msg_content[bi]
        if not isinstance(block, dict):
            continue
        original = block.get("content")
        # 이미 compact 처리됨 — skip (idempotent)
        if isinstance(original, str) and _is_already_compact(original):
            continue
        if not isinstance(original, str):
            continue
        # JSON 파싱
        try:
            raw = json.loads(original)
        except Exception:
            continue
        compactor = _COMPACTORS.get(tool_name)
        if compactor is None:
            continue
        compact_text = compactor(raw)
        if not compact_text:
            continue
        # 새 list/dict 로 교체
        new_content_list = list(msg_content)
        new_content_list[bi] = {**block, "content": compact_text}
        out[mi] = {**out[mi], "content": new_content_list}
        changed = True

    return out if changed else messages


def _pre_send_sanity_check(
    messages: list[dict[str, Any]],
    scenario_name: str = "?",
) -> None:
    """송신 직전 messages 구조 진단. 손상 발견 시 logger.warning + 진단 정보 dump.

    중단 X — 가능한 한 그대로 송신해서 Anthropic 의 실제 에러 메시지를 받는 게 디버깅에
    유리. 다만 손상이 명백하면 미리 로그를 남겨 추후 원인 추적 용이.

    검사 항목:
      1. messages 가 비었는가
      2. 각 메시지에 role / content 필드 있는가
      3. assistant.tool_use ↔ user.tool_result tool_use_id 페어 완전한가
      4. tool_result.content 가 str 또는 list 인가 (None / 잘못된 타입 X)
      5. 빈 content 있는가
    """
    if not messages:
        logger.warning("pre_send.empty_messages scenario=%s", scenario_name)
        return

    # tool_use_id 수집 (assistant)
    tu_ids: set[str] = set()
    tr_ids: set[str] = set()
    issues: list[str] = []

    for i, msg in enumerate(messages):
        if not isinstance(msg, dict):
            issues.append(f"msg[{i}] not dict (type={type(msg).__name__})")
            continue
        role = msg.get("role")
        if role not in ("user", "assistant"):
            issues.append(f"msg[{i}] invalid role={role!r}")
            continue
        content = msg.get("content")
        if content is None:
            issues.append(f"msg[{i}] role={role} content=None")
            continue
        # content 가 list 면 블록 검사
        if isinstance(content, list):
            if not content:
                issues.append(f"msg[{i}] role={role} content=[] (empty)")
                continue
            for bi, block in enumerate(content):
                if not isinstance(block, dict):
                    issues.append(f"msg[{i}].content[{bi}] not dict")
                    continue
                btype = block.get("type")
                if btype == "tool_use":
                    tu_id = block.get("id", "")
                    if tu_id:
                        tu_ids.add(tu_id)
                    else:
                        issues.append(f"msg[{i}].content[{bi}] tool_use without id")
                elif btype == "tool_result":
                    tr_id = block.get("tool_use_id", "")
                    if tr_id:
                        tr_ids.add(tr_id)
                    else:
                        issues.append(f"msg[{i}].content[{bi}] tool_result without tool_use_id")
                    tr_content = block.get("content")
                    if tr_content is None or (
                        not isinstance(tr_content, (str, list))
                    ):
                        issues.append(
                            f"msg[{i}].content[{bi}] tool_result content type={type(tr_content).__name__}"
                        )
                elif btype == "text":
                    if not isinstance(block.get("text"), str):
                        issues.append(f"msg[{i}].content[{bi}] text block missing 'text' str")

    # 페어 무결성
    orphan_tu = tu_ids - tr_ids
    orphan_tr = tr_ids - tu_ids
    if orphan_tu:
        issues.append(f"orphan tool_use (no matching tool_result): {sorted(orphan_tu)[:5]}")
    if orphan_tr:
        issues.append(f"orphan tool_result (no matching tool_use): {sorted(orphan_tr)[:5]}")

    if issues:
        logger.warning(
            "pre_send.issues scenario=%s count=%d details=%s",
            scenario_name, len(issues), " | ".join(issues[:10]),
        )


def _trim_past_intermediate_text(
    messages: list[dict[str, Any]],
    min_chars: int = 200,
) -> list[dict[str, Any]]:
    """과거 cycle 의 assistant '중간 narration' text 를 placeholder 로 치환.

    조건: assistant 메시지가 tool_use 블록과 text 블록을 함께 가지면 그 text 는
    "도구 호출 사이의 자기 설명" (예: '이제 N화를 fetch하겠습니다', '결과 확인했습니다').
    다음 cycle 의 모델 판단엔 가치 0 — placeholder 로 치환하면 past 부담 70~90% 절감.

    유지 대상:
      - assistant 의 **최종 답변 메시지** (tool_use 0개, text 만) — 검수 보고서·초안 등
      - 짧은 text (< min_chars) — 검색·계산 breadcrumb 가치 있을 수 있음 (보수적)
      - tool_use 자체 (페어 보존 필수)
      - user 메시지 (작가 질의)

    파괴적 변경 방지 — 새 list/dict 로 복제.
    """
    if not messages:
        return messages
    out: list[dict[str, Any]] = []
    changed_any = False
    for m in messages:
        if m.get("role") != "assistant":
            out.append(m)
            continue
        c = m.get("content")
        if not isinstance(c, list):
            out.append(m)
            continue
        has_tool_use = any(
            isinstance(b, dict) and b.get("type") == "tool_use" for b in c
        )
        if not has_tool_use:
            # 최종 답변 (혹은 tool_use 0회 assistant text) — 유지
            out.append(m)
            continue
        # tool_use 와 공존하는 text → 중간 narration 후보. min_chars 이상만 치환.
        new_c: list[Any] = []
        changed = False
        for b in c:
            if isinstance(b, dict) and b.get("type") == "text":
                txt = b.get("text") or ""
                if len(txt) >= min_chars:
                    new_c.append({
                        "type": "text",
                        "text": f"(중간 설명 {len(txt)}자 생략 — past 절약)",
                    })
                    changed = True
                    continue
            new_c.append(b)
        if changed:
            out.append({**m, "content": new_c})
            changed_any = True
        else:
            out.append(m)
    return out if changed_any else messages


def _collect_pinned_tool_use_ids(messages: list[dict[str, Any]]) -> set[str]:
    """messages 안의 assistant.tool_use 블록 중 DECAY_PINNED_TOOLS 에 해당하는 id 수집.
    같은 cycle 안에서 호출된 pin 대상 도구들의 tool_use_id 집합을 반환.
    """
    pinned: set[str] = set()
    for m in messages:
        if m.get("role") != "assistant":
            continue
        c = m.get("content")
        if not isinstance(c, list):
            continue
        for b in c:
            if isinstance(b, dict) and b.get("type") == "tool_use":
                if b.get("name") in DECAY_PINNED_TOOLS:
                    tu_id = b.get("id")
                    if tu_id:
                        pinned.add(tu_id)
    return pinned


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
    pinned_tool_use_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    """오래된 user.tool_result 의 content 를 placeholder 로 교체.

    Anthropic API 검증 규칙:
      - assistant.tool_use ↔ user.tool_result.tool_use_id 페어 유지 필수.
    이 함수는 페어 구조와 tool_use_id 는 그대로 두고 tool_result.content 본문만 치환 →
    400 에러 없이 토큰만 줄임. 가장 최근 keep_recent 개 tool_result 는 본문 유지.

    keep_recent=0 으로 호출하면 모든 tool_result 를 placeholder 로 치환 — past history
    경계 정리 (continuation 시 과거 cycle 의 raw 데이터 완전 제거) 용도.

    pinned_tool_use_ids 가 주어지면 해당 id 의 tool_result 는 keep_recent 와 무관하게
    decay 대상에서 제외 (DECAY_PINNED_TOOLS — 본문 라인 정확성 필수 도구). 단 keep_recent=0
    (preload 전체 strip) 호출에는 pin 무시 — 과거 cycle 본문은 정리되어야 함. 호출처가
    의도적으로 pinned_tool_use_ids 를 안 넘기면 자동으로 면역 X.

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
    # 3-b) pinned tool_use_id 위치는 decay 대상에서 제외 (keep_recent>0 일 때만).
    #      keep_recent=0 (preload 전체 strip) 은 과거 cycle 정리이므로 pin 무시.
    if pinned_tool_use_ids and keep_recent > 0 and decay_set:
        filtered: set[tuple[int, int]] = set()
        for mi, bi in decay_set:
            block = messages[mi]["content"][bi]
            if isinstance(block, dict) and block.get("tool_use_id") in pinned_tool_use_ids:
                continue    # pinned — 면역
            filtered.add((mi, bi))
        decay_set = filtered
    # 3-c) DECAY_EXEMPT_TOOLS 의 결과도 decay 대상에서 제외 (keep_recent>0 일 때만).
    #      Haiku 합성/분석 시계열 등 종합 보고서 근거가 되는 도구 결과 보존.
    #      keep_recent=0 (preload past cycle strip) 은 과거 cycle 정리이므로 exempt 도 무시.
    if keep_recent > 0 and decay_set and DECAY_EXEMPT_TOOLS:
        filtered2: set[tuple[int, int]] = set()
        for mi, bi in decay_set:
            block = messages[mi]["content"][bi]
            if isinstance(block, dict):
                tu_id = block.get("tool_use_id", "")
                tool_name = tool_use_name_by_id.get(tu_id, "")
                if tool_name in DECAY_EXEMPT_TOOLS:
                    continue    # exempt — 면역
            filtered2.add((mi, bi))
        decay_set = filtered2
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


def _accumulated_old_tool_result_chars(
    messages: list[dict[str, Any]],
    pinned_tool_use_ids: set[str] | None = None,
) -> int:
    """KEEP_RECENT_TOOL_RESULTS 보다 오래된 위치의 tool_result 중 아직 verbatim
    (placeholder 치환 안 된) 인 것들의 char 누적 합. Batch decay 임계 판단용.

    pinned_tool_use_ids 에 포함된 id 의 tool_result 는 decay 대상에서 제외되므로
    threshold 판단에도 포함 X — pin 본문이 임계를 채워 다른 도구 결과의 decay 를 잘못
    trigger 하는 부작용 차단.
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
    # tool_use_id → tool_name 매핑 (DECAY_EXEMPT 도구 제외 위해)
    tool_name_by_id: dict[str, str] = {}
    for m in messages:
        if m.get("role") == "assistant" and isinstance(m.get("content"), list):
            for b in m["content"]:
                if isinstance(b, dict) and b.get("type") == "tool_use":
                    tid = b.get("id", "")
                    if tid:
                        tool_name_by_id[tid] = b.get("name", "")
    total = 0
    for mi, bi in candidates:
        block = messages[mi]["content"][bi]
        if isinstance(block, dict):
            tu_id = block.get("tool_use_id", "")
            if pinned_tool_use_ids and tu_id in pinned_tool_use_ids:
                continue
            # DECAY_EXEMPT 도구 결과는 threshold 카운트에서 제외 — 이 도구들 누적이
            # 다른 raw (fetch_episode_plaintext 등) 의 decay 를 잘못 trigger 하지 않게.
            if tool_name_by_id.get(tu_id, "") in DECAY_EXEMPT_TOOLS:
                continue
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


def _count_messages_bytes(messages: list[dict[str, Any]]) -> int:
    """messages 의 JSON UTF-8 byte 길이 — GMS Express body-parser 한도 측정용."""
    import json
    try:
        return len(json.dumps(messages, ensure_ascii=False).encode("utf-8"))
    except Exception:
        # fallback: 한국어 보수적 3× 추정
        return sum(len(str(m)) for m in messages) * 3


def _cap_summary_to_byte_limit(summary: str) -> str:
    """summary 텍스트를 SUMMARY_BYTE_LIMIT (10KB) 이하로 강제 절단.
    누적 압축으로 [이전 대화 압축] 블록이 여러 번 append 되면 부풀 수 있으므로,
    초과 시 가장 오래된 블록부터 drop (개행 두 칸 \\n\\n 단위로 split).
    """
    if not summary:
        return summary
    enc = summary.encode("utf-8")
    if len(enc) <= SUMMARY_BYTE_LIMIT:
        return summary
    # 블록 단위 (\n\n) 로 분리 후 head 부터 drop
    blocks = summary.split("\n\n")
    while blocks and len("\n\n".join(blocks).encode("utf-8")) > SUMMARY_BYTE_LIMIT:
        blocks.pop(0)
    if not blocks:
        # 마지막 한 블록도 너무 크면 끝부분만 보존
        return summary[-SUMMARY_BYTE_LIMIT // 3 :]    # 한국어 보수 추정
    return "\n\n".join(blocks)


def _stringify_message_for_summary(m: dict[str, Any]) -> str:
    """history 메시지를 한 줄 텍스트로 — Haiku 요약 입력용."""
    role = m.get("role", "?")
    content = m.get("content")
    if isinstance(content, str):
        return f"[{role}] {content[:500]}"
    if isinstance(content, list):
        parts: list[str] = []
        for b in content:
            if not isinstance(b, dict):
                continue
            btype = b.get("type")
            if btype == "text":
                t = (b.get("text") or "").strip()
                if t:
                    parts.append(t[:400])
            elif btype == "tool_use":
                name = b.get("name", "?")
                inp = b.get("input", {})
                # input 의 핵심 키만 (대용량 본문 제외)
                if isinstance(inp, dict):
                    keys = ", ".join(f"{k}={str(v)[:50]}" for k, v in list(inp.items())[:3])
                    parts.append(f"<도구 호출: {name}({keys})>")
                else:
                    parts.append(f"<도구 호출: {name}>")
            elif btype == "tool_result":
                c = b.get("content")
                if isinstance(c, str):
                    parts.append(f"<도구 결과: {c[:300]}>")
                else:
                    parts.append("<도구 결과>")
        return f"[{role}] " + " ".join(parts)
    return f"[{role}] {str(content)[:300]}"


async def _summarize_past_to_byte_limit(
    history: list[dict[str, Any]],
    summary_so_far: str | None,
    budget: Any,
    scenario_name: str,
) -> tuple[list[dict[str, Any]], str | None]:
    """이전 대화 기록을 PAST_HISTORY_BYTE_LIMIT(10KB) 안으로 강제 축소.

    1) 옛 tool_result 본문 전체 decay (pin 무시 — 과거 cycle 정리)
    2) 과거 narration trim
    3) 그래도 초과면 Haiku 로 전체 통째 요약 → summary_so_far 에 누적, history 빈 list
    4) 실패 fallback — oldest pair drop

    이 함수는 새 user 메시지가 history 에 append 되기 직전에 호출. 호출 후 history 는
    무조건 10KB 이내.
    """
    if not history:
        return history, summary_so_far

    past_bytes = _count_messages_bytes(history)
    if past_bytes <= PAST_HISTORY_BYTE_LIMIT:
        return history, summary_so_far

    # 1) 옛 tool_result 전체 decay (pin/exempt 모두 무시 — 과거 cycle 의 raw 는 다 정리)
    history = _decay_old_tool_results(history, keep_recent=0)
    past_bytes = _count_messages_bytes(history)
    if past_bytes <= PAST_HISTORY_BYTE_LIMIT:
        logger.info(
            "planner.past_byte_step1_decay scenario=%s after=%d limit=%d",
            scenario_name, past_bytes, PAST_HISTORY_BYTE_LIMIT,
        )
        return history, summary_so_far

    # 2) 과거 narration trim
    history = _trim_past_intermediate_text(history, min_chars=50)
    past_bytes = _count_messages_bytes(history)
    if past_bytes <= PAST_HISTORY_BYTE_LIMIT:
        logger.info(
            "planner.past_byte_step2_trim scenario=%s after=%d",
            scenario_name, past_bytes,
        )
        return history, summary_so_far

    # 3) Haiku 통째 요약 — history 전체를 한 단락 요약 → summary_so_far 누적, history 빈 list
    try:
        from app.services.providers import get_llm
        llm = get_llm()
        haiku_model = getattr(llm, "_haiku_model", None)
        if haiku_model is None:
            raise RuntimeError("no haiku model")
        history_text = "\n".join(_stringify_message_for_summary(m) for m in history)
        # 입력 본문도 보호적으로 자르기 (Haiku 입력 ~30KB chars 까지)
        if len(history_text) > 30_000:
            history_text = history_text[:15_000] + "\n...(중간 생략)...\n" + history_text[-12_000:]
        prompt = (
            "다음은 agent 와 작가의 이전 대화 기록입니다. 작가 요청·결정, agent 가 수행한 핵심\n"
            "작업과 결과, 채택된 이슈/제안 만 한국어 5~8문장 이내로 압축 요약하세요. 인사·중간\n"
            "안내·도구 호출 진행 멘트는 제외. 정확한 회차 번호·인물 이름·핵심 사실은 보존.\n\n"
            + history_text
        )
        result = await llm.generate_json(
            "당신은 대화 압축 worker 입니다.",
            prompt,
            '{"summary": "string"}',
            model_override=haiku_model,
            max_tokens=600,
        )
        summary_text = (result.get("summary") if isinstance(result, dict) else None) or ""
        if summary_text:
            if budget is not None:
                try:
                    usage = getattr(llm, "last_usage", {"input_tokens": 0, "output_tokens": 0})
                    budget.record_compression(usage)
                except Exception:
                    pass
            new_summary = (
                f"{summary_so_far}\n\n[이전 대화 압축] {summary_text}".strip()
                if summary_so_far else f"[이전 대화 압축] {summary_text}"
            )
            # ★ summary 10KB 한도 강제 — 누적 압축으로 부풀면 가장 오래된 부분부터 절단.
            new_summary = _cap_summary_to_byte_limit(new_summary)
            logger.info(
                "planner.past_byte_step3_haiku_compress scenario=%s before=%d msg_count=%d summary_bytes=%d",
                scenario_name, past_bytes, len(history),
                len(new_summary.encode("utf-8")),
            )
            return [], new_summary
    except Exception as e:
        logger.warning(
            "planner.past_byte_haiku_compress_failed scenario=%s err=%s",
            scenario_name, str(e)[:200],
        )

    # 4) Fallback — oldest pair drop 까지
    drop_count = 0
    while past_bytes > PAST_HISTORY_BYTE_LIMIT and len(history) > 2 and drop_count < 20:
        history = _drop_oldest_pair(history)
        past_bytes = _count_messages_bytes(history)
        drop_count += 1
    logger.warning(
        "planner.past_byte_step4_drop scenario=%s drops=%d final=%d",
        scenario_name, drop_count, past_bytes,
    )
    return history, summary_so_far


# ★ GMS Express 프록시 body-parser limit ~100KB (Express body-parser 기본값).
# 초과 시 GMS 가 body 파싱 못 해 "Model not found in request" 400 반환.
# 90KB 안전 마진 — utf-8 bytes 기준 (한글 1자=3bytes).
PROXY_BODY_BYTE_LIMIT = 90_000


def _serialize_request_bytes(
    *,
    model: str,
    max_tokens: int,
    system_blocks: list[dict[str, Any]] | list,
    tools: list[dict[str, Any]] | list,
    messages: list[dict[str, Any]] | list,
    temperature: float,
) -> int:
    """SDK 가 실제 송신할 JSON body 의 byte 크기 측정.
    Anthropic SDK 는 ensure_ascii=False UTF-8 인코딩으로 보낸다 — 한글 1자=3bytes.
    """
    import json
    body = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system_blocks,
        "tools": tools,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }
    try:
        return len(json.dumps(body, ensure_ascii=False, default=str).encode("utf-8"))
    except Exception:
        # 직렬화 실패 시 보수적 추정 — 한글 비중 가정 1.5x
        return int(sum(len(str(m)) for m in messages) * 1.5)


def _decay_all_in_messages(
    messages: list[dict[str, Any]],
    *,
    pinned_tool_use_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    """모든 tool_result 의 본문을 placeholder 로 치환 (pinned 제외, 마지막 tool_result 도 처리).
    body-byte 한도 초과 시 마지막 안전 수단.
    """
    pin = pinned_tool_use_ids or set()
    # tool_use_id → tool_name 매핑 (assistant block 들에서 수집)
    tu_name: dict[str, str] = {}
    for m in messages:
        if m.get("role") == "assistant" and isinstance(m.get("content"), list):
            for b in m["content"]:
                if isinstance(b, dict) and b.get("type") == "tool_use":
                    tid = b.get("id", "")
                    if tid:
                        tu_name[tid] = b.get("name", "")

    out: list[dict[str, Any]] = []
    for m in messages:
        if m.get("role") != "user" or not isinstance(m.get("content"), list):
            out.append(m)
            continue
        new_blocks: list[dict[str, Any]] = []
        changed = False
        for b in m["content"]:
            if not isinstance(b, dict) or b.get("type") != "tool_result":
                new_blocks.append(b)
                continue
            tuid = b.get("tool_use_id", "")
            if tuid in pin:
                new_blocks.append(b)
                continue
            content = b.get("content")
            content_str = content if isinstance(content, str) else (
                "".join(c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text")
                if isinstance(content, list) else str(content)
            )
            if _is_decay_placeholder(content_str):
                new_blocks.append(b)
                continue
            placeholder = _build_decay_placeholder(tu_name.get(tuid, ""), len(content_str))
            new_blocks.append({**b, "content": placeholder})
            changed = True
        out.append({**m, "content": new_blocks} if changed else m)
    return out


def _enforce_body_byte_limit(
    *,
    messages: list[dict[str, Any]],
    system_blocks: list[dict[str, Any]] | list,
    tools: list[dict[str, Any]] | list,
    model: str,
    max_tokens: int,
    temperature: float,
    scenario_name: str,
) -> tuple[list[dict[str, Any]], int, bool]:
    """body 크기를 PROXY_BODY_BYTE_LIMIT 안으로 강제 축소.

    Returns: (축소된 messages, 최종 bytes, 한도 안 들어왔는지 flag)
    축소 전략 (한도 안 들어올 때까지 순서대로 시도):
      1. 부드러운 decay (KEEP_RECENT 유지 + exempt/pin 면역) — 옛 raw 본문만 placeholder
      2. 과거 narration trim
      3. 가장 오래된 페어 drop (옛 cycle 통째로 정리)
      4. 강한 decay (pin 만 면역, exempt 무시 / keep_recent=0)
      5. 최후 수단 — 모든 tool_result decay (pin 무시)
    """
    def _measure(msgs: list) -> int:
        return _serialize_request_bytes(
            model=model, max_tokens=max_tokens, system_blocks=system_blocks,
            tools=tools, messages=msgs, temperature=temperature,
        )

    body_bytes = _measure(messages)
    if body_bytes <= PROXY_BODY_BYTE_LIMIT:
        return messages, body_bytes, True

    logger.warning(
        "planner.body_limit_exceeded scenario=%s bytes=%d limit=%d — 축소 시도",
        scenario_name, body_bytes, PROXY_BODY_BYTE_LIMIT,
    )

    cycle_start = _find_current_cycle_start(messages)
    pinned = _collect_pinned_tool_use_ids(messages[cycle_start:]) if cycle_start < len(messages) else set()

    # 1. 부드러운 decay — KEEP_RECENT 유지 + exempt/pin 면역.
    #    옛 cycle 의 큰 raw (fetch_plaintext 등) 만 placeholder.
    #    Haiku 합성·분석 시계열 같은 종합 보고서 근거는 보존.
    messages = _decay_old_tool_results(
        messages, pinned_tool_use_ids=pinned, keep_recent=KEEP_RECENT_TOOL_RESULTS
    )
    body_bytes = _measure(messages)
    if body_bytes <= PROXY_BODY_BYTE_LIMIT:
        logger.info(
            "planner.body_shrink_step1_soft_decay scenario=%s after=%d",
            scenario_name, body_bytes,
        )
        return messages, body_bytes, True

    # 2. 과거 narration trim
    messages = _trim_past_intermediate_text(messages, min_chars=100)
    body_bytes = _measure(messages)
    if body_bytes <= PROXY_BODY_BYTE_LIMIT:
        logger.info(
            "planner.body_shrink_step2_trim scenario=%s after=%d",
            scenario_name, body_bytes,
        )
        return messages, body_bytes, True

    # 3. 오래된 페어 drop — 옛 cycle 통째로 빠짐 (현재 cycle 의 분석 결과 보존)
    for i in range(10):
        if body_bytes <= PROXY_BODY_BYTE_LIMIT or len(messages) <= 2:
            break
        messages = _drop_oldest_pair(messages)
        body_bytes = _measure(messages)
    if body_bytes <= PROXY_BODY_BYTE_LIMIT:
        logger.warning(
            "planner.body_shrink_step3_drop scenario=%s after=%d",
            scenario_name, body_bytes,
        )
        return messages, body_bytes, True

    # 4. 강한 decay — keep_recent=0 (pin 만 면역, exempt 무시). 현재 cycle 의
    #    분석 결과까지 일부 잃을 수 있음. 종합 보고서 정확도 손상 위험.
    messages = _decay_old_tool_results(
        messages, pinned_tool_use_ids=pinned, keep_recent=0
    )
    body_bytes = _measure(messages)
    if body_bytes <= PROXY_BODY_BYTE_LIMIT:
        logger.warning(
            "planner.body_shrink_step4_strong_decay scenario=%s after=%d",
            scenario_name, body_bytes,
        )
        return messages, body_bytes, True

    # 5. 최후 수단 — 모든 tool_result decay (pin 무시)
    messages = _decay_all_in_messages(messages)
    body_bytes = _measure(messages)
    if body_bytes <= PROXY_BODY_BYTE_LIMIT:
        logger.warning(
            "planner.body_shrink_step4_pin_break scenario=%s after=%d",
            scenario_name, body_bytes,
        )
        return messages, body_bytes, True

    # 5. 그래도 초과 — 가장 오래된 페어 추가 drop (모든 페어 다 빼도 안 되면 마지막 user 만 남김)
    while body_bytes > PROXY_BODY_BYTE_LIMIT and len(messages) > 1:
        messages = _drop_oldest_pair(messages)
        body_bytes = _measure(messages)

    logger.error(
        "planner.body_shrink_exhausted scenario=%s final=%d limit=%d msgs=%d",
        scenario_name, body_bytes, PROXY_BODY_BYTE_LIMIT, len(messages),
    )
    return messages, body_bytes, body_bytes <= PROXY_BODY_BYTE_LIMIT


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


def _strip_cache_control(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """모든 메시지·블록의 cache_control 마커 제거 — Anthropic 4-marker 한도 누적 방지.
    마커는 stream 송신 직전 _with_messages_cache 가 1회만 부착. history 에는 절대 영구화 X.
    """
    if not messages:
        return messages
    out: list[dict[str, Any]] = []
    changed_any = False
    for m in messages:
        if not isinstance(m, dict):
            out.append(m)
            continue
        content = m.get("content")
        if isinstance(content, list):
            new_content: list[Any] = []
            changed = False
            for b in content:
                if isinstance(b, dict) and "cache_control" in b:
                    nb = {k: v for k, v in b.items() if k != "cache_control"}
                    new_content.append(nb)
                    changed = True
                else:
                    new_content.append(b)
            if changed:
                out.append({**m, "content": new_content})
                changed_any = True
                continue
        out.append(m)
    return out if changed_any else messages


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

    # auto/card_auto 시나리오에서 사용자 메시지가 검수·작성·추출·플롯 중 하나로 명확
    # 분류되면 도구 셋을 부분집합으로 축소 — tools 정의 토큰 다이어트.
    # 매칭 실패/애매 시 원본 allowed 유지 (보수적). 시나리오 권한 초과 X (intersection).
    if scenario_name in {"auto", "card_auto"}:
        intent = classify_intent(user_message)
        if intent:
            intent_subset = INTENT_TOOL_SUBSETS.get(intent)
            if intent_subset:
                before = len(allowed)
                allowed = allowed & intent_subset
                logger.info(
                    "planner.intent_routed scenario=%s intent=%s tools=%d→%d",
                    scenario_name, intent, before, len(allowed),
                )

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

    # ★ Past intermediate narration trim — preload decay 와 짝.
    # tool_result raw 본문은 위에서 placeholder 화됐지만, assistant 가 tool_use 사이사이
    # 출력한 "이제 X 도구 호출하겠습니다" 식 narration text 는 그대로 잔존. past 의 진짜 가치는
    # 작가 질의(user) + 최종 답변(assistant text-only) 두 가지 뿐 — 중간 설명은 다음 cycle 에
    # 무가치. 200자 이상 narration 만 보수적으로 치환.
    before_trim_chars = _count_messages_chars(history)
    history = _trim_past_intermediate_text(history)
    after_trim_chars = _count_messages_chars(history)
    if before_trim_chars != after_trim_chars:
        logger.info(
            "planner.past_intermediate_text_trim scenario=%s before=%d after=%d saved=%d",
            scenario_name, before_trim_chars, after_trim_chars,
            before_trim_chars - after_trim_chars,
        )

    # ★ Past history byte cap — 새 user 메시지 append 직전, 이전 대화 기록을 10KB 안으로 강제.
    # GMS Express body-parser 한도(~100KB) 의 10%. 한국어 1자=3bytes 라 ~3K 한글자 한도.
    # 흐름: decay → trim → Haiku 통째 요약(빈 list + summary 누적) → fallback pair drop.
    past_bytes_before = _count_messages_bytes(history)
    history, new_summary = await _summarize_past_to_byte_limit(
        history, summary_so_far, budget, scenario_name
    )
    if new_summary != summary_so_far:
        summary_so_far = new_summary
        system_blocks = _build_system_blocks(
            scenario["system_prompt"], work_meta_block, summary_so_far
        )
    past_bytes_after = _count_messages_bytes(history)
    if past_bytes_after != past_bytes_before:
        logger.info(
            "planner.past_byte_enforced scenario=%s before=%d after=%d limit=%d msgs=%d",
            scenario_name, past_bytes_before, past_bytes_after,
            PAST_HISTORY_BYTE_LIMIT, len(history),
        )

    # 사용자 신규 메시지를 history 에 append
    history.append({"role": "user", "content": user_message})

    suggestion_ids: list[str] = []
    final_text: str | None = None
    episode_draft_proposed_in_cycle = False

    # ★ 도구별 turn-cap — peek/peek 메타 류만 제한. 검수 핵심 도구 (서브에이전트 검증,
    # 벡터 검색, 본문 분석, 인물·시간선·복선 시계열) 는 한도 X — 가설마다 충분히 검증해야
    # 추측 보고서 안 나옴. cap 초과 시 synthetic tool_result 로 거부 → 다른 가설로 전환.
    tool_call_counts: dict[str, int] = {}
    TOOL_TURN_CAPS: dict[str, int] = {
        # peek 류 (한 번 보면 끝 — 재호출 의미 없음)
        "list_episodes": 2,
        "list_all_oneline_summaries": 2,
        "list_characters": 2,
        "list_world_notes": 2,
        "list_plots": 2,
        "list_episode_summaries": 2,
        # 맞춤법 (대상 회차 1회면 끝)
        "check_spelling": 1,
        # 검수 핵심 도구 (의심점 검증용) — 한도 없음:
        #   query_episodes_by_chunks / search_episode_chunks / search_episode_summaries
        #   analyze_episode / invoke_haiku_worker / summarize_episode
        #   character_arc / timeline_scan / track_foreshadow
        #   get_character / get_world_note / get_plot / get_episode_summary
        #   find_relevant_episodes / ensure_recent_summaries
        #   fetch_episode_plaintext (line 인용 정확성용)
    }

    while True:
        # ★ Current cycle hard cap (50K chars) — 현재 user 메시지 + 이후 도구 호출/결과 누적.
        # 매 iter 시작에 검사. 초과 시 in-cycle decay 시도 → 그래도 초과면 graceful break.
        cycle_start = _find_current_cycle_start(history)
        cycle_chars = _count_messages_chars(history[cycle_start:])
        if cycle_chars > CURRENT_CYCLE_CHAR_CAP:
            # 1차 시도: in-cycle 옛 tool_result decay (KEEP_RECENT 무시) — pin 면역 유지
            pinned_ids = _collect_pinned_tool_use_ids(history[cycle_start:])
            history = _decay_old_tool_results(history, pinned_tool_use_ids=pinned_ids)
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
                # ★ 순서 중요: byte-shrink → 마커 부착 (마지막). 마커 박힌 결과를 history 에
                # 영구화하면 매 iter 마다 누적 → "max 4 cache_control" 400 에러.
                # 0) 방어적 — 과거 누적된 stale 마커 모두 청소 (한 번 발생한 후라도 회복)
                history = _strip_cache_control(history)
                # 1) 송신 직전 구조 검증 (마커 없는 history 기준)
                _pre_send_sanity_check(history, scenario_name)

                # 2) GMS Express body-parser 한도(~100KB) 하드 가드.
                # cache_control 마커 미포함 history 에 적용 → 축소 결과를 history 에 영구 반영.
                history, _final_bytes, _within = _enforce_body_byte_limit(
                    messages=history,
                    system_blocks=system_blocks,
                    tools=tools,
                    model=sonnet_model,
                    max_tokens=PLANNER_MAX_TOKENS,
                    temperature=0.2,
                    scenario_name=scenario_name,
                )

                # 3) 마커 부착은 송신용 cached_messages 에만 (한 turn 1회). history 는 마커 없는 상태 유지.
                cached_messages = _with_messages_cache(history)

                # 송신 직전 body 크기 진단 — summary 가 system 에 박혔는지 + 분리 측정.
                import json as _json_diag
                try:
                    _sys_bytes = len(_json_diag.dumps(system_blocks, ensure_ascii=False).encode("utf-8"))
                    _tools_bytes = len(_json_diag.dumps(tools, ensure_ascii=False).encode("utf-8"))
                    _msgs_bytes = len(_json_diag.dumps(cached_messages, ensure_ascii=False).encode("utf-8"))
                    # summary 가 system_blocks 안에 실제로 박혔는지 분리 측정
                    _summary_bytes = 0
                    _summary_in_system = False
                    for _b in system_blocks:
                        if isinstance(_b, dict):
                            _txt = _b.get("text", "")
                            if _txt.startswith("[이전 대화 요약]"):
                                _summary_bytes = len(_txt.encode("utf-8"))
                                _summary_in_system = True
                                break
                    _rest_bytes = _final_bytes - _summary_bytes
                    logger.info(
                        "planner.body_diag scenario=%s model=%s sys_b=%d (summary_b=%d in_sys=%s) "
                        "tools_b=%d msgs_b=%d total_b=%d rest_b=%d limit=%d within=%s",
                        scenario_name, sonnet_model, _sys_bytes, _summary_bytes,
                        _summary_in_system, _tools_bytes, _msgs_bytes, _final_bytes,
                        _rest_bytes, PROXY_BODY_BYTE_LIMIT, _within,
                    )
                    # 별도 한도 위반 경고
                    if _summary_bytes > SUMMARY_BYTE_LIMIT:
                        logger.warning(
                            "planner.summary_byte_over scenario=%s summary_b=%d limit=%d",
                            scenario_name, _summary_bytes, SUMMARY_BYTE_LIMIT,
                        )
                    if _rest_bytes > (PROXY_BODY_BYTE_LIMIT - SUMMARY_BYTE_LIMIT):
                        logger.warning(
                            "planner.rest_byte_over scenario=%s rest_b=%d limit=%d",
                            scenario_name, _rest_bytes,
                            PROXY_BODY_BYTE_LIMIT - SUMMARY_BYTE_LIMIT,
                        )
                except Exception:
                    pass

                if not _within:
                    # 축소 다 해도 90KB 초과 — graceful break (재시도해도 같음)
                    logger.error(
                        "planner.body_limit_unreachable scenario=%s bytes=%d — graceful break",
                        scenario_name, _final_bytes,
                    )
                    final_text = (
                        "(요청 크기가 게이트웨이 한도를 넘어 추가 추론을 중단했습니다. "
                        "같은 thread 의 [압축] 버튼으로 대화를 정리한 뒤 다시 보내주세요.)"
                    )
                    break
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
                # ★ GMS "Model not found" 는 anthropic 모델 미존재가 아니라 프록시 transient
                # 실패 (104s 같은 장기 응답 후 GMS 가 generic 400 으로 응답). 우리 sonnet_model
                # 이름이 config 의 정상 값이면 retriable 로 분류 — 같은 model 로 즉시 재시도.
                model_not_found_transient = (
                    "model not found" in msg and bool(sonnet_model)
                )
                retriable = (
                    "rate_limit" in msg
                    or "429" in msg
                    or "overloaded" in msg
                    or "529" in msg
                    or "timeout" in msg
                    or "connection" in msg          # GMS 와 anthropic 사이 connection reset
                    or "remote disconnected" in msg
                    or "stream" in msg and "closed" in msg
                    or model_not_found_transient
                )
                if not retriable or attempt == 3:
                    logger.exception(
                        "planner.create_failed scenario=%s attempt=%d retriable=%s err_class=%s",
                        scenario_name, attempt, retriable, type(e).__name__,
                    )
                    raise
                logger.warning(
                    "planner.create_retry scenario=%s attempt=%d backoff=%ds err=%s msg=%s",
                    scenario_name, attempt, backoff, type(e).__name__, str(e)[:200],
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

            # ★ 도구별 turn-cap 체크 — 가설 폭주 차단.
            current_count = tool_call_counts.get(name, 0)
            cap = TOOL_TURN_CAPS.get(name)
            if cap is not None and current_count >= cap:
                logger.info(
                    "planner.tool_cap_hit name=%s count=%d cap=%d scenario=%s",
                    name, current_count, cap, scenario_name,
                )
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu_id,
                    "content": _format_tool_result({
                        "error": "tool_cap_exceeded",
                        "tool": name,
                        "count": current_count,
                        "cap": cap,
                        "message": (
                            f"이 turn 에 {name} 를 이미 {current_count}회 호출했습니다 "
                            f"(한도 {cap}회). 같은 도구 반복 X — 다른 가설/도구로 전환하거나 "
                            "지금까지 결과로 종합 보고서 진행하세요."
                        ),
                    }),
                })
                continue
            tool_call_counts[name] = current_count + 1

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
            #   - CONDENSE_TOOLS 군         : registry 가 raw 결과를 Haiku 로 의도 기반 압축
            #                                (compressed result.usage 가 채워져 있음 / 압축 미발동
            #                                시엔 raw 그대로 → usage 키 없음 → 건너뜀)
            # cache hit / 압축 미발동 경로는 usage 없거나 {input:0, output:0} → record 0 누적, 안전.
            from app.mcp.registry import CONDENSE_TOOLS as _CONDENSE_TOOLS  # 순환 import 방지
            _HAIKU_BILLED_TOOLS = {
                "invoke_haiku_worker",
                "analyze_episode",
                "summarize_episode",
                "query_episodes_by_chunks",
                "ensure_recent_summaries",
            } | _CONDENSE_TOOLS
            if name in _HAIKU_BILLED_TOOLS and isinstance(result, dict):
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

        # ★ Extract & Compact — 플래그로 활성/비활성 토글. 13회 호출 시점 GMS 400
        # (Model not found) 의심 케이스라 일단 OFF 기본값. ENABLE_EARLY_COMPACT=True 로
        # 켜야 동작. 실패 시 try/except 로 catch — 절대 메인 루프 중단 X.
        if ENABLE_EARLY_COMPACT:
            try:
                compacted = _compact_consumed_tool_results(history)
                if compacted is not history:
                    before_chars = _count_messages_chars(history)
                    new_chars = _count_messages_chars(compacted)
                    if new_chars != before_chars:
                        history = compacted
                        logger.info(
                            "planner.early_compact scenario=%s before=%d after=%d saved=%d",
                            scenario_name, before_chars, new_chars, before_chars - new_chars,
                        )
            except Exception as e:
                logger.warning(
                    "planner.early_compact_failed scenario=%s err=%s — 압축 skip, history 원본 유지",
                    scenario_name, str(e)[:200],
                )

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
        # 현재 cycle 의 pin 대상 tool_use_id 수집 — batch decay 면역 유지.
        # 검수 시 fetch_episode_plaintext 결과가 batch threshold 로 인해 placeholder 화되어
        # 다음 propose_review_issue 가 라인 번호를 추측하는 환각 차단.
        cycle_start_for_pin = _find_current_cycle_start(history)
        pinned_ids = _collect_pinned_tool_use_ids(history[cycle_start_for_pin:])
        accumulated_old_chars = _accumulated_old_tool_result_chars(
            history, pinned_tool_use_ids=pinned_ids
        )
        if accumulated_old_chars >= TOOL_RESULT_DECAY_BATCH_THRESHOLD:
            decayed_history = _decay_old_tool_results(history, pinned_tool_use_ids=pinned_ids)
            if decayed_history is not history:
                history = decayed_history
                logger.info(
                    "planner.tool_result_batch_decay scenario=%s accumulated_chars=%d pinned_count=%d",
                    scenario_name, accumulated_old_chars, len(pinned_ids),
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

# LLM 의사결정에 안 쓰이는 메타데이터/디버그 필드. tool 결과 직렬화 직전에 제거하여
# 입력 토큰 절감. 빌링 등 내부 소비자는 _format_tool_result 이전 단계 (planner 의
# result.get("usage") 등) 에서 이미 읽어가므로 안전하다.
#   - usage           : Haiku/sub-agent 토큰 회계 (planner 가 result.get 으로 이미 수집)
#   - matched_chunks_count, chunk_count : 디버그 카운트
#   - max_sim, avg_sim, similarity      : 부동소수 유사도 — 모델은 순서로 충분
#   - ref_chunks, other_chunks          : find_relevant_episodes 진단 필드
#   - cache_control                     : Anthropic 내부 캐시 마커가 누설된 경우 방어
_TOOL_RESULT_NOISE_KEYS = frozenset({
    "usage",
    "matched_chunks_count",
    "chunk_count",
    "max_sim",
    "avg_sim",
    "similarity",
    "ref_chunks",
    "other_chunks",
    "cache_control",
})


def _strip_noise(value: Any) -> Any:
    """tool 결과 dict/list 트리에서 _TOOL_RESULT_NOISE_KEYS 를 재귀 제거.
    원본 mutate 하지 않고 얕은 복사로 새 객체 반환 — billing 단계의 원본 dict 영향 없음.
    """
    if isinstance(value, dict):
        return {
            k: _strip_noise(v)
            for k, v in value.items()
            if k not in _TOOL_RESULT_NOISE_KEYS
        }
    if isinstance(value, list):
        return [_strip_noise(v) for v in value]
    return value


def _format_tool_result(result: Any) -> str:
    """tool 결과를 LLM 입력용 텍스트로 직렬화. 한도 초과 시 명시적 truncation.
    노이즈 메타 필드는 직렬화 직전 제거 (입력 토큰 다이어트).
    """
    import json

    cleaned = _strip_noise(result)
    try:
        s = json.dumps(cleaned, ensure_ascii=False)
    except Exception:
        s = str(cleaned)
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
