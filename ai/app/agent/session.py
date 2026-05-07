"""agent_session CRUD + 자동 압축 (메시지 20개 → 첫 10개 요약).

압축 비용은 BudgetTracker.record_compression 으로 영수증에 적재한다.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.budget import BudgetTracker
from app.services.providers import get_llm

COMPRESS_THRESHOLD = 40    # 메시지 N개 도달 시 첫 절반 압축
COMPRESS_HEAD_COUNT = 20


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
    return {
        "thread_id": row[0],
        "work_id": row[1],
        "writer_id": row[2],
        "scenario": row[3],
        "title": row[4],
        "messages": list(row[5] or []),
        "summary_so_far": row[6],
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
            "ti": title,
        },
    )
    await session.commit()
    return new_id


async def save_session_messages(
    session: AsyncSession,
    thread_id: uuid.UUID,
    messages: list[dict],
    summary_so_far: str | None,
) -> None:
    import json

    await session.execute(
        sa_text(
            "UPDATE agent_session SET "
            "  messages = CAST(:msg AS jsonb), "
            "  summary_so_far = :sm, "
            "  last_activity_at = now() "
            "WHERE thread_id = :tid"
        ),
        {
            "tid": thread_id,
            "msg": json.dumps(messages, ensure_ascii=False),
            "sm": summary_so_far,
        },
    )
    await session.commit()


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
    return [
        {
            "thread_id": str(row[0]),
            "scenario": row[1],
            "title": row[2],
            "status": row[3],
            "last_activity_at": row[4].isoformat() if row[4] else None,
            "created_at": row[5].isoformat() if row[5] else None,
        }
        for row in r.fetchall()
    ]


async def maybe_compress(
    messages: list[dict],
    summary_so_far: str | None,
    budget: BudgetTracker | None,
) -> tuple[list[dict], str | None, bool]:
    """메시지 N=20 도달 시 첫 10개를 Haiku 로 요약, summary_so_far 갱신.

    반환: (압축 후 messages, 갱신된 summary_so_far, did_compress)
    """
    if len(messages) < COMPRESS_THRESHOLD:
        return messages, summary_so_far, False

    head = messages[:COMPRESS_HEAD_COUNT]
    tail = messages[COMPRESS_HEAD_COUNT:]

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
