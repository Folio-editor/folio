"""MCP 도구: 세계관 노트 조회."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.text_extractor import extract_plain_text


def _is_ciphertext(value: Any) -> bool:
    return isinstance(value, str) and value.startswith("v1:")


async def list_world_notes(session: AsyncSession, ctx: WriterContext) -> list[dict]:
    r = await session.execute(
        sa_text(
            "SELECT id, name, parent_id "
            "FROM world_note "
            "WHERE work_id = :wid AND writer_id = :wr "
            "ORDER BY sort_order"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id},
    )
    # name이 v1: 암호문이면 AI 서버가 평문을 알 수 없으므로 목록에서 제외.
    return [
        {"id": str(row[0]), "name": row[1], "parent_id": str(row[2]) if row[2] else None}
        for row in r.fetchall()
        if not _is_ciphertext(row[1])
    ]


async def get_world_note(session: AsyncSession, ctx: WriterContext, *, name: str) -> dict | None:
    # 호출자가 평문 name을 안다는 전제. 평문으로 저장된 row만 매칭된다.
    # name 컬럼은 'v1:' 암호문이거나 평문이므로 평문 비교만으로도 안전하다 (암호문은 결코 매칭되지 않음).
    r = await session.execute(
        sa_text(
            "SELECT id, name, parent_id, content "
            "FROM world_note "
            "WHERE work_id = :wid AND writer_id = :wr AND name = :name"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id, "name": name},
    )
    row = r.fetchone()
    if not row:
        return None
    if _is_ciphertext(row[1]) or _is_ciphertext(row[3]):
        return None
    return {
        "id": str(row[0]),
        "name": row[1],
        "parent_id": str(row[2]) if row[2] else None,
        "content": extract_plain_text(row[3]),
    }
