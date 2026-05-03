"""설정집(인물/세계관)을 LLM 프롬프트용 텍스트로 포맷팅.

PR5 — Plan C 옵션 1: 더 이상 DB를 직접 SELECT하지 않고 클라이언트가 평문화해 보낸
AiContextPayload 의 characters / world_notes 를 입력으로 받는 순수 함수.
"""

from __future__ import annotations

from typing import TypedDict

from app.schemas.ai_context_payload import (
    AiContextPayload,
    CharacterPayload,
    WorldNotePayload,
)
from app.services.text_extractor import extract_plain_text

SETTINGS_FULL_THRESHOLD = 40

_PERSONALITY_KIND = "personality"


class SettingsBundle(TypedDict):
    mode: str
    count: int
    characters_text: str
    world_notes_text: str


def load_settings(payload: AiContextPayload) -> SettingsBundle:
    characters = payload.characters
    world_notes = [n for n in payload.world_notes if n.name]
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
        "characters_text": characters_text,
        "world_notes_text": world_notes_text,
    }


def _personality_of(char: CharacterPayload) -> str | None:
    """character_note 중 kind='personality' 의 첫 항목 본문을 평문으로 반환."""
    for note in char.notes:
        if note.kind == _PERSONALITY_KIND and note.content:
            return extract_plain_text(note.content)
    return None


def _first_line(text: str | None) -> str:
    if not text:
        return ""
    return text.splitlines()[0].strip()


def _format_characters_full(chars: list[CharacterPayload]) -> str:
    if not chars:
        return "(없음)"

    lines: list[str] = []
    for char in chars:
        parts = [f"- 이름: {char.name or ''}"]
        if char.gender:
            parts.append(f"성별: {char.gender}")
        if char.age:
            parts.append(f"나이: {char.age}")
        personality = _personality_of(char)
        if personality:
            parts.append(f"성격: {personality}")
        lines.append("\n".join(parts))
    return "\n\n".join(lines)


def _format_world_notes_full(notes: list[WorldNotePayload]) -> str:
    if not notes:
        return "(없음)"

    lines: list[str] = []
    for note in notes:
        description = extract_plain_text(note.content) if note.content else ""
        if description:
            lines.append(f"- 이름: {note.name}\n상세: {description}")
        else:
            lines.append(f"- 이름: {note.name}")
    return "\n\n".join(lines)


def _format_characters_compact(chars: list[CharacterPayload]) -> str:
    if not chars:
        return "(없음)"

    lines: list[str] = []
    for char in chars:
        parts = [char.name or ""]
        if char.age:
            parts.append(f"나이:{_first_line(char.age)}")
        personality = _personality_of(char)
        if personality:
            parts.append(f"성격:{_first_line(personality)}")
        lines.append("- " + " / ".join(parts))
    return "\n".join(lines)


def _format_world_notes_compact(notes: list[WorldNotePayload]) -> str:
    if not notes:
        return "(없음)"

    lines: list[str] = []
    for note in notes:
        description = extract_plain_text(note.content) if note.content else ""
        summary = _first_line(description)[:50]
        if summary:
            lines.append(f"- {note.name}: {summary}")
        else:
            lines.append(f"- {note.name}")
    return "\n".join(lines)
