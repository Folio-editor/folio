"""MCP 도구: 캐릭터 조회 (Phase 4 — 스키마 정합 + Vault 복호화).

스키마: character 테이블은 name/gender/age 만 보유. 외형·성격·MBTI 등 상세는
character_note (kind='appearance'/'personality'/'mbti'/...) 와
character_custom_field (field_name/field_value) 에 저장된다.
"""

from __future__ import annotations

import uuid

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.decrypt_resolver import (
    DecryptResolverError,
    decrypt_rows,
)
from app.services.text_extractor import extract_plain_text


async def list_characters(session: AsyncSession, ctx: WriterContext) -> dict:
    """peek — 인물 이름 배열 + drill 용 id_map.

    반환: {names: ["김철수", ...], id_map: {"김철수": "uuid...", ...}}
    상세(성별·나이·외형·성격 등)는 get_character(name) drill 로.
    이름이 v1: 암호문이면 backend Vault 경유 복호화. 복호화 실패 행은 names 에서 자연 제외.
    """
    r = await session.execute(
        sa_text(
            "SELECT id, name FROM character "
            "WHERE work_id = :wid AND writer_id = :wr "
            "ORDER BY sort_order"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id},
    )
    rows = [{"id": str(row[0]), "name": row[1]} for row in r.fetchall()]
    try:
        rows = await decrypt_rows(ctx.work_id, rows, ["name"])
    except DecryptResolverError:
        # 복호화 실패 행은 name 이 v1: 그대로라 작가가 알아볼 수 없음 — id_map 에 plaintext 매칭 불가.
        # 실패 시 placeholder name 으로 노출하되 id_map 에도 동일 키로 등록 (작가 직접 식별 보조).
        for row in rows:
            n = row.get("name")
            if isinstance(n, str) and n.startswith("v1:"):
                row["name"] = "(암호화 미해제)"
    names = [r["name"] for r in rows]
    id_map = {r["name"]: r["id"] for r in rows}
    return {"names": names, "id_map": id_map}


async def get_character(session: AsyncSession, ctx: WriterContext, *, name: str) -> dict | None:
    # 1) 헤더 행
    r = await session.execute(
        sa_text(
            "SELECT id, name, gender, age "
            "FROM character "
            "WHERE work_id = :wid AND writer_id = :wr"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id},
    )
    rows = [
        {"id": str(row[0]), "name": row[1], "gender": row[2], "age": row[3]}
        for row in r.fetchall()
    ]
    try:
        rows = await decrypt_rows(ctx.work_id, rows, ["name", "age"])
    except DecryptResolverError:
        # 복호화 실패 — 평문 이름이라도 매칭 가능. v1: 행은 name 매칭 불가하므로 자연 제외.
        pass

    char = next((row for row in rows if row.get("name") == name), None)
    if char is None:
        return None
    char_id = uuid.UUID(char["id"])

    # 2) character_note (외형·성격·MBTI 등)
    note_r = await session.execute(
        sa_text(
            "SELECT kind, title, content "
            "FROM character_note "
            "WHERE character_id = :cid AND writer_id = :wr "
            "ORDER BY sort_order"
        ),
        {"cid": char_id, "wr": ctx.writer_id},
    )
    note_rows = [
        {"kind": nr[0], "title": nr[1], "content": nr[2]} for nr in note_r.fetchall()
    ]
    try:
        note_rows = await decrypt_rows(ctx.work_id, note_rows, ["title", "content"])
    except DecryptResolverError:
        for n in note_rows:
            t = n.get("title")
            c = n.get("content")
            if isinstance(t, str) and t.startswith("v1:"):
                n["title"] = "(제목 암호화 미해제)"
            if isinstance(c, str) and c.startswith("v1:"):
                n["content"] = "(내용 암호화 미해제)"
    notes = [
        {
            "kind": n.get("kind"),
            "title": n.get("title"),
            "content": extract_plain_text(n.get("content")),
        }
        for n in note_rows
    ]

    # 3) character_custom_field
    cf_r = await session.execute(
        sa_text(
            "SELECT field_name, field_value "
            "FROM character_custom_field "
            "WHERE character_id = :cid "
            "ORDER BY sort_order"
        ),
        {"cid": char_id},
    )
    cf_rows = [{"field_name": r[0], "field_value": r[1]} for r in cf_r.fetchall()]
    try:
        cf_rows = await decrypt_rows(ctx.work_id, cf_rows, ["field_name", "field_value"])
    except DecryptResolverError:
        for cf in cf_rows:
            for k in ("field_name", "field_value"):
                v = cf.get(k)
                if isinstance(v, str) and v.startswith("v1:"):
                    cf[k] = "(암호화 미해제)"

    return {
        "id": char["id"],
        "name": char["name"],
        "gender": char["gender"],
        "age": char["age"],
        "notes": notes,
        "custom_fields": cf_rows,
    }
