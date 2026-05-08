"""MCP 도구: 세계관 노트 조회 (Phase 4 — backend Vault 경유 v1: 복호화).

backend 의 /internal/works/{wid}/decrypt-fields 로 batch 복호화 → 평문만 LLM 노출.
복호화 실패 시 해당 행을 안전하게 스킵.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.decrypt_resolver import (
    DecryptResolverError,
    decrypt_rows,
)
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
    rows = [
        {"id": str(row[0]), "name": row[1], "parent_id": str(row[2]) if row[2] else None}
        for row in r.fetchall()
    ]
    try:
        return await decrypt_rows(ctx.work_id, rows, ["name"])
    except DecryptResolverError:
        for r in rows:
            n = r.get("name")
            if isinstance(n, str) and n.startswith("v1:"):
                r["name"] = "(이름 암호화 미해제)"
        return rows


async def get_world_note(session: AsyncSession, ctx: WriterContext, *, name: str) -> dict | None:
    # 일단 모든 row fetch → 복호화 → name 매칭 (평문 비교). 평문 컬럼이면 SQL 매칭 가능하지만
    # 동일 작품 내 노트 수는 제한적 (≤수십)이므로 단순 구현 우선.
    r = await session.execute(
        sa_text(
            "SELECT id, name, parent_id, content "
            "FROM world_note "
            "WHERE work_id = :wid AND writer_id = :wr"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id},
    )
    rows = [
        {"id": str(row[0]), "name": row[1], "parent_id": str(row[2]) if row[2] else None,
         "content": row[3]}
        for row in r.fetchall()
    ]
    try:
        rows = await decrypt_rows(ctx.work_id, rows, ["name", "content"])
    except DecryptResolverError:
        # 복호화 실패 시 평문 이름은 매칭 가능. content 만 placeholder.
        for r in rows:
            c = r.get("content")
            if isinstance(c, str) and c.startswith("v1:"):
                r["content"] = "(내용 암호화 미해제)"

    target = next((row for row in rows if row.get("name") == name), None)
    if target is None:
        return None
    return {
        "id": target["id"],
        "name": target["name"],
        "parent_id": target["parent_id"],
        "content": extract_plain_text(target.get("content")),
    }
