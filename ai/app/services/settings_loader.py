from __future__ import annotations

import uuid
from typing import Any, TypedDict

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.text_extractor import extract_plain_text

SETTINGS_FULL_THRESHOLD = 40


def _is_ciphertext(value: Any) -> bool:
    """Plan C v1 암호문 판별. 'v1:' 접두사로 시작하는 문자열만 암호문."""
    return isinstance(value, str) and value.startswith("v1:")


class SettingsBundle(TypedDict):
    mode: str
    count: int
    characters: list[tuple[Any, ...]]
    world_notes: list[tuple[Any, ...]]
    characters_text: str
    world_notes_text: str


async def load_settings(db: AsyncSession, work_id: str) -> SettingsBundle:
    work_uuid = uuid.UUID(work_id)

    character_result = await db.execute(
        sa_text(
            "SELECT c.name, c.gender, c.age, "
            "       pn.content AS personality, "
            "       '' AS content "
            "FROM character c "
            "LEFT JOIN character_note pn "
            "  ON pn.character_id = c.id AND pn.kind = 'personality' "
            "WHERE c.work_id = :wid "
            "ORDER BY c.sort_order"
        ),
        {"wid": work_uuid},
    )
    world_note_result = await db.execute(
        sa_text(
            "SELECT name, content FROM world_note "
            "WHERE work_id = :wid ORDER BY sort_order"
        ),
        {"wid": work_uuid},
    )

    characters = character_result.fetchall()
    # Plan C v1 암호문(name 또는 content가 'v1:' 접두사)이면 AI 서버가 평문을 알 수 없으므로
    # settings 컨텍스트에서 제외한다.
    world_notes = [
        row for row in world_note_result.fetchall()
        if not _is_ciphertext(row[0]) and not _is_ciphertext(row[1])
    ]
    total = len(characters) + len(world_notes)
    mode = "full" if total <= SETTINGS_FULL_THRESHOLD else "compact"

    if mode == "full":
        characters_text = _format_characters_full(characters)
        world_notes_text = _format_world_notes_full(world_notes)
    else:
        characters_text = _format_characters_compact(characters)
        world_notes_text = _format_world_notes_compact(world_notes)

    return {
        "mode": mode,
        "count": total,
        "characters": characters,
        "world_notes": world_notes,
        "characters_text": characters_text,
        "world_notes_text": world_notes_text,
    }


def _first_line(text: str | None) -> str:
    if not text:
        return ""
    return text.splitlines()[0].strip()


def _format_characters_full(rows: list[tuple[Any, ...]]) -> str:
    if not rows:
        return "(없음)"

    lines: list[str] = []
    for name, gender, age, personality, content in rows:
        parts = [f"- 이름: {name}"]
        if gender:
            parts.append(f"성별: {gender}")
        if age:
            parts.append(f"나이: {age}")
        if personality:
            parts.append(f"성격: {extract_plain_text(personality)}")
        if content:
            parts.append(f"상세: {extract_plain_text(content)}")
        lines.append("\n".join(parts))
    return "\n\n".join(lines)


def _format_world_notes_full(rows: list[tuple[Any, ...]]) -> str:
    if not rows:
        return "(없음)"

    lines: list[str] = []
    for name, content in rows:
        description = extract_plain_text(content) if content else ""
        if description:
            lines.append(f"- 이름: {name}\n상세: {description}")
        else:
            lines.append(f"- 이름: {name}")
    return "\n\n".join(lines)


def _format_characters_compact(rows: list[tuple[Any, ...]]) -> str:
    if not rows:
        return "(없음)"

    lines: list[str] = []
    for name, _gender, age, personality, _content in rows:
        parts = [str(name)]
        if age:
            parts.append(f"나이:{_first_line(str(age))}")
        if personality:
            parts.append(f"성격:{_first_line(extract_plain_text(personality))}")
        lines.append("- " + " / ".join(parts))
    return "\n".join(lines)


def _format_world_notes_compact(rows: list[tuple[Any, ...]]) -> str:
    if not rows:
        return "(없음)"

    lines: list[str] = []
    for name, content in rows:
        description = extract_plain_text(content) if content else ""
        summary = _first_line(description)[:50]
        if summary:
            lines.append(f"- {name}: {summary}")
        else:
            lines.append(f"- {name}")
    return "\n".join(lines)
