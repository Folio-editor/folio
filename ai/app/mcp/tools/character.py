"""MCP 도구: 캐릭터 조회."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.text_extractor import extract_plain_text


def _is_ciphertext(value: Any) -> bool:
    return isinstance(value, str) and value.startswith("v1:")


async def list_characters(session: AsyncSession, ctx: WriterContext) -> list[dict]:
    r = await session.execute(
        sa_text(
            "SELECT id, name, gender, age, personality "
            "FROM character "
            "WHERE work_id = :wid AND writer_id = :wr "
            "ORDER BY sort_order"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id},
    )
    return [
        {"id": str(row[0]), "name": row[1], "gender": row[2], "age": row[3], "personality": row[4] or ""}
        for row in r.fetchall()
    ]


async def get_character(session: AsyncSession, ctx: WriterContext, *, name: str) -> dict | None:
    r = await session.execute(
        sa_text(
            "SELECT id, name, gender, age, appearance, mbti, personality, content "
            "FROM character "
            "WHERE work_id = :wid AND writer_id = :wr AND name = :name"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id, "name": name},
    )
    row = r.fetchone()
    if not row:
        return None

    char = {
        "id": str(row[0]),
        "name": row[1],
        "gender": row[2],
        "age": row[3],
        "appearance": row[4],
        "mbti": row[5],
        "personality": row[6],
        "content": extract_plain_text(row[7]),
    }

    cf = await session.execute(
        sa_text(
            "SELECT field_name, field_value "
            "FROM character_custom_field "
            "WHERE character_id = :cid "
            "ORDER BY sort_order"
        ),
        {"cid": uuid.UUID(char["id"])},
    )
    # field_name 또는 field_value가 v1: 암호문이면 평문을 알 수 없으므로 제외.
    char["custom_fields"] = [
        {"field_name": r[0], "field_value": r[1]}
        for r in cf.fetchall()
        if not (_is_ciphertext(r[0]) or _is_ciphertext(r[1]))
    ]

    return char
