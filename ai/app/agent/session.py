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

COMPRESS_THRESHOLD = 40    # 메시지 N개 도달 시 첫 절반 압축
COMPRESS_HEAD_COUNT = 20


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

    return {
        "thread_id": row[0],
        "work_id": work_id,
        "writer_id": row[2],
        "scenario": row[3],
        "title": title,
        "messages": messages,
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
    r = await session.execute(
        sa_text(
            "SELECT thread_id, scenario, title, status, last_activity_at, created_at "
            "FROM agent_session "
            "WHERE work_id = :wid AND writer_id = :wr "
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
    """messages 를 cut_at 기준으로 head/tail 분리하되 tool_use ↔ tool_result 페어가
    head/tail 경계에서 끊기지 않도록 cut_at 을 자동 조정한다.

    Anthropic API 검증 규칙:
      - assistant.content 안에 tool_use 가 있으면 다음 user 가 tool_result 로 응답해야 함
      - user.content 의 tool_result.tool_use_id 는 직전 assistant 의 tool_use.id 와 매칭
    압축이 페어 한가운데에서 자르면 tail 의 첫 user(tool_result) 가 orphan → 400 에러.

    조정 전략: tail 첫 메시지가 user(tool_result_only) 인 한 cut_at 을 한 칸씩 뒤로 미뤄
    head 에 흡수. (또는 head 마지막이 assistant(tool_use) 면 페어 둘 다 head 로.)
    """
    n = len(messages)
    while cut_at < n and _is_tool_result_only_user(messages[cut_at]):
        cut_at += 1
    # 추가: head 마지막이 tool_use 만 가진 assistant 면 그것도 head 로 가져감 (짝 user 가 이미 head 에)
    # — 위 while 루프가 user(tool_result) 를 head 로 끌어들였으니 head 끝이 user(tool_result)
    return messages[:cut_at], messages[cut_at:]


async def maybe_compress(
    messages: list[dict],
    summary_so_far: str | None,
    budget: BudgetTracker | None,
) -> tuple[list[dict], str | None, bool]:
    """메시지 N=COMPRESS_THRESHOLD 도달 시 첫 ~COMPRESS_HEAD_COUNT 개를 Haiku 로 요약, summary_so_far 갱신.

    실 cut_at 은 tool_use/tool_result 페어 보존을 위해 동적 조정 — head 에 페어 모두 포함.

    반환: (압축 후 messages, 갱신된 summary_so_far, did_compress)
    """
    if len(messages) < COMPRESS_THRESHOLD:
        return messages, summary_so_far, False

    head, tail = _split_preserving_tool_pairs(messages, COMPRESS_HEAD_COUNT)

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


def _first_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                return str(item.get("text", ""))
    return ""
