"""MCP 도구: 세계관 노트 조회."""

from __future__ import annotations

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.text_extractor import extract_plain_text


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
    return [
        {"id": str(row[0]), "name": row[1], "parent_id": str(row[2]) if row[2] else None}
        for row in r.fetchall()
    ]


async def get_world_note(session: AsyncSession, ctx: WriterContext, *, name: str) -> dict | None:
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
    return {
        "id": str(row[0]),
        "name": row[1],
        "parent_id": str(row[2]) if row[2] else None,
        "content": extract_plain_text(row[3]),
    }
