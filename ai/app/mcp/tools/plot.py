"""MCP 도구: 플롯(줄거리) 조회 (Phase 4 — Vault 경유 v1: 복호화)."""

from __future__ import annotations

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.decrypt_resolver import (
    DecryptResolverError,
    decrypt_rows,
)
from app.services.text_extractor import extract_plain_text


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
    rows = [
        {
            "id": str(row[0]),
            "title": row[1],
            "status": row[2],
            "content": row[3],
            "parent_id": str(row[4]) if row[4] else None,
        }
        for row in r.fetchall()
    ]
    try:
        rows = await decrypt_rows(ctx.work_id, rows, ["title", "content"])
    except DecryptResolverError:
        # 복호화 실패 — 플롯 존재는 노출하되 암호화된 필드는 placeholder
        for r in rows:
            t = r.get("title")
            c = r.get("content")
            if isinstance(t, str) and t.startswith("v1:"):
                r["title"] = "(제목 암호화 미해제)"
            if isinstance(c, str) and c.startswith("v1:"):
                r["content"] = "(내용 암호화 미해제)"

    return [
        {
            "id": r["id"],
            "title": r["title"],
            "status": r["status"],
            "content": extract_plain_text(r.get("content")),
            "parent_id": r["parent_id"],
        }
        for r in rows
    ]
