"""MCP 도구: 플롯(줄거리) 조회."""

from __future__ import annotations

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext


async def get_plot(session: AsyncSession, ctx: WriterContext) -> list[dict]:
    r = await session.execute(
        sa_text(
            "SELECT id, title, status, content, parent_id "
            "FROM plot "
            "WHERE work_id = :wid AND writer_id = :wr "
            "ORDER BY sort_order"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id},
    )
    return [
        {
            "id": str(row[0]),
            "title": row[1],
            "status": row[2],
            "content": row[3],
            "parent_id": str(row[4]) if row[4] else None,
        }
        for row in r.fetchall()
    ]
