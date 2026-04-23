from __future__ import annotations

import pytest

from app.services.settings_loader import SETTINGS_FULL_THRESHOLD, load_settings


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class FakeSession:
    def __init__(self, characters, world_notes):
        self._characters = characters
        self._world_notes = world_notes

    async def execute(self, statement, params=None):
        query = str(statement)
        if "FROM character" in query:
            return FakeResult(self._characters)
        if "FROM world_note" in query:
            return FakeResult(self._world_notes)
        raise AssertionError(f"unexpected query: {query}")


@pytest.mark.asyncio
async def test_load_settings_uses_full_mode_at_threshold():
    characters = [
        (f"인물{i}", "남", f"{20 + i}", f"성격{i}\n추가설명", f"본문{i}")
        for i in range(20)
    ]
    world_notes = [
        (f"설정{i}", f"세계관 설명 {i}")
        for i in range(SETTINGS_FULL_THRESHOLD - len(characters))
    ]
    session = FakeSession(characters, world_notes)

    result = await load_settings(session, "11111111-1111-1111-1111-111111111111")

    assert result["count"] == SETTINGS_FULL_THRESHOLD
    assert result["mode"] == "full"
    assert "상세:" in result["characters_text"]
    assert "상세:" in result["world_notes_text"]


@pytest.mark.asyncio
async def test_load_settings_uses_compact_mode_over_threshold():
    characters = [
        ("박지훈", "남", "29", "무기력하다\n하지만 버틴다", "안경 없음\n추가 설명"),
    ] + [
        (f"인물{i}", "남", f"{20 + i}", "성격 한 줄", "설명")
        for i in range(20)
    ]
    world_notes = [
        (f"설정{i}", "가" * 80)
        for i in range(20)
    ]
    session = FakeSession(characters, world_notes)

    result = await load_settings(session, "11111111-1111-1111-1111-111111111111")

    assert result["count"] == 41
    assert result["mode"] == "compact"
    assert "- 박지훈 / 나이:29 / 성격:무기력하다" in result["characters_text"]
    assert "상세:" not in result["characters_text"]
    assert "- 설정0: " in result["world_notes_text"]
    compact_line = result["world_notes_text"].splitlines()[0]
    assert len(compact_line.split(": ", 1)[1]) == 50
