"""MCP 도구: 작품 기획서(plan) 조회."""

from __future__ import annotations

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.text_extractor import extract_plain_text


async def get_plan(session: AsyncSession, ctx: WriterContext) -> dict | None:
    r = await session.execute(
        sa_text(
            "SELECT id, slogan, genres, moods, target_audience, content "
            "FROM plan "
            "WHERE work_id = :wid AND writer_id = :wr"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id},
    )
    row = r.fetchone()
    if not row:
        return None
    return {
        "id": str(row[0]),
        "slogan": row[1],
        "genres": row[2],
        "moods": row[3],
        "target_audience": row[4],
        "content": extract_plain_text(row[5]),
    }
