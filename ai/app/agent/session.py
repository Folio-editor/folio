"""agent_session CRUD + 자동 압축 (메시지 20개 → 첫 10개 요약).

암호화 정책 (2026-05-09):
  - messages JSONB 의 string leaf, summary_so_far, title 모두 work_key (AES-GCM)
    로 암호화하여 저장. 구조 키 (role/type/tool_name 등) 는 평문 유지.
  - load_session 은 자동 복호화한 평문을 반환 — 호출자(planner/runner)는 변경 0.
  - save_session_messages / create_session 은 INSERT/UPDATE 직전 암호화.
  - server_encrypted_dek 미발급 work 는 암호화 불가 → 평문 그대로 저장
    (encrypt_resolver 가 EncryptResolverError raise 시 fallback).
    오프라인 신규 work 는 클라가 보강하면 다음 turn 부터 암호화 가능.

압축 비용은 BudgetTracker.record_compression 으로 영수증에 적재한다.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.budget import BudgetTracker
from app.services.deep_crypt import decrypt_json_strings, encrypt_json_strings
from app.services.decrypt_resolver import DecryptResolverError, decrypt_fields
from app.services.encrypt_resolver import EncryptResolverError, encrypt_fields
from app.services.providers import get_llm

log = logging.getLogger(__name__)

COMPRESS_THRESHOLD = 40         # 메시지 N개 도달 시 첫 절반 압축 (1차 트리거)
COMPRESS_HEAD_COUNT = 20

# 토큰 기반 보수적 임계값.
# Sonnet 4.x context window = 200,000 tokens. GMS 등 게이트웨이는 더 작은 body 한계 가능.
# planner loop 안 매 iter 호출되는 iterative 압축 패턴 — 일찍 발동시켜 누적 폭주 방지.
# 60K = 200K 한계의 30% — 압축 후에도 한참 여유. 게이트웨이 한계 안전.
COMPRESS_TOKEN_THRESHOLD = 60_000    # 자동 압축 발동 (iterative — 매 iter 검사)
COMPRESS_TOKEN_WARN = 120_000        # UI 경고 (오렌지)
COMPRESS_TOKEN_CRITICAL = 170_000    # UI 빨강 — Anthropic 200K 한계 임박
ANTHROPIC_CONTEXT_LIMIT = 200_000    # 절대 한계 (참조용)
_CHARS_PER_TOKEN = 3.5               # 한국어/혼합 콘텐츠 평균


def estimate_messages_tokens(messages: list[dict]) -> int:
    """messages 의 토큰 수 근사 — JSON 직렬화 길이 / 3.5.

    실측은 Anthropic 호출 후 usage.input_tokens 가 정확. 본 함수는 압축 트리거 / UI 게이지용
    fast estimate. 오차 ±20% 허용.
    """
    import json
    try:
        s = json.dumps(messages, ensure_ascii=False)
    except Exception:
        s = str(messages)
    return int(len(s) / _CHARS_PER_TOKEN)


async def _decrypt_text_or_passthrough(work_id: uuid.UUID | None, value: str | None) -> str | None:
    """단일 평문/v1: 문자열을 안전 복호화 — work_id NULL 또는 평문이면 그대로."""
    if value is None or not value or not value.startswith("v1:"):
        return value
    if work_id is None:
        return value
    try:
        result = await decrypt_fields(work_id, {"_v": value})
        return result.get("_v", value) or value
    except DecryptResolverError as e:
        log.warning("agent_session text decrypt fail thread side reason=%s", e)
        return value


async def _encrypt_text_or_passthrough(work_id: uuid.UUID | None, value: str | None) -> str | None:
    """단일 평문 문자열을 v1: 로 암호화 — 빈/이미-v1: 또는 work_id NULL 이면 그대로."""
    if value is None or not value or value.startswith("v1:"):
        return value
    if work_id is None:
        return value
    try:
        result = await encrypt_fields(work_id, {"_v": value})
        out = result.get("_v")
        return out if isinstance(out, str) and out else value
    except EncryptResolverError as e:
        # server_encrypted_dek 미발급 등 — 평문 fallback (보안 약화이지만 서비스 가용성 우선,
        # 다음 turn 부터 클라가 dek 보강하면 자동 암호화 재개)
        log.warning("agent_session text encrypt fail (fallback plaintext) reason=%s", e)
        return value


async def load_session(session: AsyncSession, thread_id: uuid.UUID) -> dict[str, Any] | None:
    r = await session.execute(
        sa_text(
            "SELECT thread_id, work_id, writer_id, scenario, title, messages, summary_so_far, status "
            "FROM agent_session WHERE thread_id = :tid"
        ),
        {"tid": thread_id},
    )
    row = r.fetchone()
    if not row:
        return None
    work_id = row[1]
    raw_messages = list(row[5] or [])
    raw_summary = row[6]
    raw_title = row[4]

    # 복호화 — 실패해도 평문/ciphertext 혼합 그대로 반환 (planner 가 본문 사용 못해도
    # 최소 dialog flow 는 유지)
    try:
        messages = await decrypt_json_strings(work_id, raw_messages)
    except DecryptResolverError as e:
        log.warning("agent_session messages decrypt fail thread=%s reason=%s", thread_id, e)
        messages = raw_messages
    try:
        summary_so_far = await _decrypt_text_or_passthrough(work_id, raw_summary)
    except DecryptResolverError:
        summary_so_far = raw_summary
    title = await _decrypt_text_or_passthrough(work_id, raw_title)

    # ★ 옛 garbage 청소 — 과거에 영속화된 `[AGENT] 내부 오류 ...` / `[AGENT] LLM 게이트웨이 ...`
    # 류 에러 텍스트 assistant 메시지는 다음 turn 의 LLM 입력에서 제외. 에러 자체는 status/
    # receipt 로 추적되니 분실 X. (BudgetExceeded / CancelledError 의 partial 메시지는 보존 —
    # 사용자가 의도적으로 중단한 정상 흐름)
    _ERROR_PREFIXES = (
        "[AGENT] 내부 오류",
        "[AGENT] LLM 게이트웨이",
        "[AGENT] Anthropic API rate limit",
        "[AGENT] Anthropic 서버 일시 과부하",
        "[AGENT] 채팅이 누적되어",
    )
    cleaned: list[dict] = []
    for m in messages:
        if m.get("role") == "assistant" and isinstance(m.get("content"), str):
            txt = m["content"]
            if any(txt.startswith(p) for p in _ERROR_PREFIXES):
                continue    # drop
        cleaned.append(m)

    return {
        "thread_id": row[0],
        "work_id": work_id,
        "writer_id": row[2],
        "scenario": row[3],
        "title": title,
        "messages": cleaned,
        "summary_so_far": summary_so_far,
        "status": row[7],
    }


async def create_session(
    session: AsyncSession,
    *,
    work_id: uuid.UUID,
    writer_id: uuid.UUID,
    scenario: str,
    title: str | None = None,
) -> uuid.UUID:
    new_id = uuid.uuid4()
    enc_title = await _encrypt_text_or_passthrough(work_id, title)
    await session.execute(
        sa_text(
            "INSERT INTO agent_session (thread_id, work_id, writer_id, scenario, title) "
            "VALUES (:tid, :wid, :wr, :sc, :ti)"
        ),
        {
            "tid": new_id,
            "wid": work_id,
            "wr": writer_id,
            "sc": scenario,
            "ti": enc_title,
        },
    )
    await session.commit()
    return new_id


async def save_session_messages(
    session: AsyncSession,
    thread_id: uuid.UUID,
    messages: list[dict],
    summary_so_far: str | None,
    auto_title: str | None = None,
) -> None:
    """messages + summary 갱신. auto_title 이 주어지면 title 이 NULL 일 때만 설정 (COALESCE).

    auto_title 은 첫 사용자 메시지를 truncate 한 값 — 사용자가 빈 thread 에 처음 보낸 메시지를 thread 이름으로.

    암호화: messages 트리의 string leaf, summary_so_far, auto_title 을 work_key 로 변환한 뒤
    DB 적재. work_id 는 thread_id → SELECT 로 1회 조회 (planner 호출당 1회뿐이라 비용 미미).
    """
    import json

    # work_id 조회 — 암호화에 필요. thread 가 없으면 (race) 그냥 UPDATE 0 row 처리.
    r = await session.execute(
        sa_text("SELECT work_id FROM agent_session WHERE thread_id = :tid"),
        {"tid": thread_id},
    )
    row = r.fetchone()
    work_id: uuid.UUID | None = row[0] if row else None

    enc_messages: Any = messages
    enc_summary = summary_so_far
    enc_auto_title = auto_title
    if work_id is not None:
        try:
            enc_messages = await encrypt_json_strings(work_id, messages)
        except EncryptResolverError as e:
            log.warning("agent_session messages encrypt fail (fallback plaintext) thread=%s reason=%s",
                        thread_id, e)
            enc_messages = messages
        enc_summary = await _encrypt_text_or_passthrough(work_id, summary_so_far)
        enc_auto_title = await _encrypt_text_or_passthrough(work_id, auto_title)

    await session.execute(
        sa_text(
            "UPDATE agent_session SET "
            "  messages = CAST(:msg AS jsonb), "
            "  summary_so_far = :sm, "
            "  title = COALESCE(title, :auto_title), "
            "  last_activity_at = now() "
            "WHERE thread_id = :tid"
        ),
        {
            "tid": thread_id,
            "msg": json.dumps(enc_messages, ensure_ascii=False),
            "sm": enc_summary,
            "auto_title": enc_auto_title,
        },
    )
    await session.commit()


async def delete_session(
    session: AsyncSession,
    thread_id: uuid.UUID,
    writer_id: uuid.UUID,
) -> bool:
    """대화 세션 삭제. 소유자 검증 + 1행 DELETE.

    반환: True = 삭제됨, False = 미존재 또는 소유자 불일치 (404 매핑).
    """
    r = await session.execute(
        sa_text(
            "DELETE FROM agent_session "
            "WHERE thread_id = :tid AND writer_id = :wr"
        ),
        {"tid": thread_id, "wr": writer_id},
    )
    await session.commit()
    return (r.rowcount or 0) > 0


async def list_threads(
    session: AsyncSession,
    work_id: uuid.UUID,
    writer_id: uuid.UUID,
) -> list[dict[str, Any]]:
    # ★ 채팅 thread 만 노출 — 카드 모드 (consistency_check / card_auto / spelling 등 named scenario)
    # 의 단발 thread 들이 채팅 리스트를 도배하는 사고 방지. 카드 세션은 DB 에 보존되어 영수증/감사
    # 추적은 가능하지만 사용자 채팅 UI 에는 안 보인다.
    r = await session.execute(
        sa_text(
            "SELECT thread_id, scenario, title, status, last_activity_at, created_at "
            "FROM agent_session "
            "WHERE work_id = :wid AND writer_id = :wr AND scenario = 'auto' "
            "ORDER BY last_activity_at DESC LIMIT 50"
        ),
        {"wid": work_id, "wr": writer_id},
    )
    rows = r.fetchall()

    # title 들 batch 복호화 (work_id 동일 — 단일 호출 가능)
    titles_cipher = {
        str(row[0]): row[2]
        for row in rows
        if isinstance(row[2], str) and row[2].startswith("v1:")
    }
    decrypted: dict[str, str] = {}
    if titles_cipher:
        try:
            decrypted = {
                k: v for k, v in (await decrypt_fields(work_id, titles_cipher)).items()
                if isinstance(v, str)
            }
        except DecryptResolverError as e:
            log.warning("list_threads title decrypt fail work=%s reason=%s", work_id, e)

    return [
        {
            "thread_id": str(row[0]),
            "scenario": row[1],
            "title": decrypted.get(str(row[0]), row[2]),
            "status": row[3],
            "last_activity_at": row[4].isoformat() if row[4] else None,
            "created_at": row[5].isoformat() if row[5] else None,
        }
        for row in rows
    ]


def _is_tool_result_only_user(msg: dict) -> bool:
    """user role + content 가 모두 tool_result 블록이면 True. 텍스트 user 메시지와 구분."""
    if msg.get("role") != "user":
        return False
    content = msg.get("content")
    if not isinstance(content, list) or not content:
        return False
    return all(
        isinstance(b, dict) and b.get("type") == "tool_result"
        for b in content
    )


def _has_unmatched_tool_use(msg: dict) -> bool:
    """assistant content 안에 tool_use 블록이 있는지. 다음 user 가 tool_result 로 짝 맞춰야 함."""
    if msg.get("role") != "assistant":
        return False
    content = msg.get("content")
    if not isinstance(content, list):
        return False
    return any(
        isinstance(b, dict) and b.get("type") == "tool_use"
        for b in content
    )


def _split_preserving_tool_pairs(messages: list[dict], cut_at: int) -> tuple[list[dict], list[dict]]:
    """messages 를 cut_at 기준으로 head/tail 분리하되 Anthropic API 검증 규칙 보존:

      1) assistant.tool_use ↔ user.tool_result 페어가 경계에서 끊기지 않게
         (tail 의 첫 user 가 orphan tool_result 면 head 로 흡수)
      2) tail 의 첫 메시지는 user 역할 (Anthropic 요청 messages[0] = user 필수)
         tail 이 assistant 로 시작하면 한 칸 더 advance — head 로 흡수

    조정 후 tail 이 비면 (모든 메시지 head 흡수) 호출자가 처리.
    """
    n = len(messages)
    # 1) orphan tool_result 흡수
    while cut_at < n and _is_tool_result_only_user(messages[cut_at]):
        cut_at += 1
    # 2) tail 첫 메시지가 assistant 면 head 로 흡수 (첫 메시지는 반드시 user)
    while cut_at < n and messages[cut_at].get("role") == "assistant":
        cut_at += 1
    # 3) advance 후 다시 orphan tool_result 가능성 한 번 더 (assistant 흡수 후 다음이 tool_result 면)
    while cut_at < n and _is_tool_result_only_user(messages[cut_at]):
        cut_at += 1
    return messages[:cut_at], messages[cut_at:]


async def maybe_compress(
    messages: list[dict],
    summary_so_far: str | None,
    budget: BudgetTracker | None,
    *,
    force: bool = False,
) -> tuple[list[dict], str | None, bool]:
    """메시지 N=COMPRESS_THRESHOLD 또는 토큰 추정량이 임계 도달 시 첫 ~COMPRESS_HEAD_COUNT 개를
    Haiku 로 요약, summary_so_far 갱신.

    실 cut_at 은 tool_use/tool_result 페어 보존을 위해 동적 조정 — head 에 페어 모두 포함.

    Args:
      force: True 면 임계값 무시하고 항상 압축 (수동 트리거용).

    반환: (압축 후 messages, 갱신된 summary_so_far, did_compress)
    """
    msg_count = len(messages)
    estimated = estimate_messages_tokens(messages)
    over_msg_threshold = msg_count >= COMPRESS_THRESHOLD
    over_token_threshold = estimated >= COMPRESS_TOKEN_THRESHOLD
    if not force and not over_msg_threshold and not over_token_threshold:
        return messages, summary_so_far, False

    # 압축할 충분한 메시지가 없으면 (수동 force 시 messages < HEAD_COUNT) skip
    if msg_count <= COMPRESS_HEAD_COUNT // 2:
        return messages, summary_so_far, False

    head_target = min(COMPRESS_HEAD_COUNT, max(1, msg_count - 5))    # 최근 5개는 보존
    head, tail = _split_preserving_tool_pairs(messages, head_target)

    # 안전 가드 — tail 비어있거나 (tool pair 흡수로 모두 head 로 갔거나) head 가 너무 작으면
    # 압축 의미 X + Anthropic messages[0]=user 위반 위험. 압축 skip.
    if not tail or len(head) < 4:
        return messages, summary_so_far, False
    # tail[0] 은 반드시 user (위 _split 가 보장하지만 방어적 재검증).
    if tail[0].get("role") != "user":
        return messages, summary_so_far, False

    llm = get_llm()
    haiku_model = getattr(llm, "_haiku_model", None)

    head_text = "\n".join(
        f"- {m.get('role','?')}: {_first_text(m.get('content'))[:300]}" for m in head
    )
    prompt = (
        "다음은 agent 와 작가의 대화 기록 첫 부분입니다. 핵심 결정·합의·주요 정보만 "
        "한국어 3 문장 이내로 요약하세요. 인사·잡담은 제외.\n\n" + head_text
    )
    result = await llm.generate_json(
        "당신은 대화 압축 worker 입니다.",
        prompt,
        '{"summary": "string"}',
        model_override=haiku_model,
        max_tokens=400,
    )
    summary_text = (result.get("summary") if isinstance(result, dict) else None) or ""
    new_summary = (
        f"{summary_so_far}\n[추가 압축] {summary_text}".strip()
        if summary_so_far
        else summary_text
    )
    if budget is not None:
        usage = getattr(llm, "last_usage", {"input_tokens": 0, "output_tokens": 0})
        budget.record_compression(usage)
    return tail, new_summary, True


async def compress_thread_now(
    session: AsyncSession,
    thread_id: uuid.UUID,
) -> dict[str, Any]:
    """작가가 채팅 UI 의 [압축] 버튼을 눌렀을 때 호출되는 수동 압축 진입점.

    절차:
      1. load_session — messages/summary/title 복호화 결과 로드
      2. maybe_compress(force=True) — 임계값 무시하고 압축 (단 messages 가 거의 없으면 no-op)
      3. save_session_messages — 압축 결과 영속

    반환: {compressed: bool, before: {messages_count, estimated_tokens},
           after: {messages_count, estimated_tokens}, summary_so_far_len}
    """
    sess = await load_session(session, thread_id)
    if sess is None:
        return {"error": "thread_not_found"}

    before_count = len(sess["messages"])
    before_tokens = estimate_messages_tokens(sess["messages"])

    new_messages, new_summary, did = await maybe_compress(
        sess["messages"], sess["summary_so_far"], None, force=True
    )
    if not did:
        return {
            "compressed": False,
            "reason": "messages_too_few" if before_count <= COMPRESS_HEAD_COUNT // 2 else "no_op",
            "before": {"messages_count": before_count, "estimated_tokens": before_tokens},
            "after": {"messages_count": before_count, "estimated_tokens": before_tokens},
            "summary_so_far_len": len(sess["summary_so_far"] or ""),
        }

    await save_session_messages(session, thread_id, new_messages, new_summary)

    after_tokens = estimate_messages_tokens(new_messages)
    return {
        "compressed": True,
        "before": {"messages_count": before_count, "estimated_tokens": before_tokens},
        "after": {"messages_count": len(new_messages), "estimated_tokens": after_tokens},
        "summary_so_far_len": len(new_summary or ""),
    }


def _first_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                return str(item.get("text", ""))
    return ""
