"""MCP 도구: 플롯 조회 — peek/drill 분리 (Phase 4.6).

- list_plots : 제목·상태·parent_id 만 (peek, 가벼움)
- get_plot   : 단건 본문 fetch (drill). title 또는 plot_id 지정.
              호환을 위해 인자 없이 호출 시 list_plots 와 동일한 메타만 반환.
"""

from __future__ import annotations

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.decrypt_resolver import (
    DecryptResolverError,
    decrypt_rows,
)
from app.services.text_extractor import extract_plain_text


async def list_plots(session: AsyncSession, ctx: WriterContext) -> list[dict]:
    """peek 용 — 작품의 모든 플롯 제목·상태·parent_id 만 (본문 X).

    토큰 효율: 플롯 10개 ~수백 tok. 본문은 get_plot(title) 단건으로 drill.
    """
    r = await session.execute(
        sa_text(
            "SELECT id, title, status, parent_id "
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
            "parent_id": str(row[3]) if row[3] else None,
        }
        for row in r.fetchall()
    ]
    try:
        rows = await decrypt_rows(ctx.work_id, rows, ["title"])
    except DecryptResolverError:
        for row in rows:
            t = row.get("title")
            if isinstance(t, str) and t.startswith("v1:"):
                row["title"] = "(제목 암호화 미해제)"
    return rows


async def get_plot(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    title: str | None = None,
    plot_id: str | None = None,
) -> list[dict] | dict | None:
    """drill 용 — 단건 플롯 본문 fetch (title 또는 plot_id 로 지정).

    인자 없이 호출 시 list_plots 와 동일 (호환). 본문이 필요 없으면 list_plots 권장.
    """
    if title is None and plot_id is None:
        return await list_plots(session, ctx)

    where = ["work_id = :wid", "writer_id = :wr"]
    params: dict = {"wid": ctx.work_id, "wr": ctx.writer_id}
    if plot_id is not None:
        where.append("id = cast(:pid AS uuid)")
        params["pid"] = plot_id
    if title is not None:
        where.append("title = :title")
        params["title"] = title

    r = await session.execute(
        sa_text(
            "SELECT id, title, status, content, parent_id "
            f"FROM plot WHERE {' AND '.join(where)} LIMIT 1"
        ),
        params,
    )
    row = r.fetchone()
    if row is None:
        return {"error": "plot_not_found", "title": title, "plot_id": plot_id}

    rows = [
        {
            "id": str(row[0]),
            "title": row[1],
            "status": row[2],
            "content": row[3],
            "parent_id": str(row[4]) if row[4] else None,
        }
    ]
    try:
        rows = await decrypt_rows(ctx.work_id, rows, ["title", "content"])
    except DecryptResolverError:
        for r in rows:
            t = r.get("title")
            c = r.get("content")
            if isinstance(t, str) and t.startswith("v1:"):
                r["title"] = "(제목 암호화 미해제)"
            if isinstance(c, str) and c.startswith("v1:"):
                r["content"] = "(내용 암호화 미해제)"

    out = rows[0]
    return {
        "id": out["id"],
        "title": out["title"],
        "status": out["status"],
        "content": extract_plain_text(out.get("content")),
        "parent_id": out["parent_id"],
    }
