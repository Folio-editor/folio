from __future__ import annotations

from fastapi.testclient import TestClient

from app.api.v1 import extract_settings as extract_settings_module
from app.config import settings
from app.main import app
from app.services.llm import FakeLLM


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class FakeSession:
    async def execute(self, statement, params=None):
        query = str(statement)
        if "FROM character" in query:
            return FakeResult(
                [
                    ("박지훈", "남", "29", "무기력하지만 자존심이 있다.", "오션 스트리머"),
                ]
            )
        if "FROM world_note" in query:
            return FakeResult(
                [
                    ("오션(Ocean) 방송 플랫폼", "물방울 후원 시스템이 있는 방송 플랫폼"),
                ]
            )
        raise AssertionError(f"unexpected query: {query}")

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None


def test_extract_settings_endpoint_returns_expected_shape(monkeypatch):
    monkeypatch.setattr(extract_settings_module, "get_llm", lambda: FakeLLM())
    monkeypatch.setattr(extract_settings_module, "async_session", lambda: FakeSession())

    try:
        with TestClient(app) as client:
            response = client.post(
                "/v1/extract-settings",
                headers={"X-Internal-Api-Key": settings.internal_api_key},
                json={
                    "work_id": "11111111-1111-1111-1111-111111111111",
                    "writer_id": "22222222-2222-2222-2222-222222222222",
                    "content": '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"새로운 인물이 등장한다."}]}]}',
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "new_characters": [],
        "updated_characters": [],
        "new_world_notes": [],
        "updated_world_notes": [],
        "foreshadowing": [],
        "usage": {"input_tokens": 0, "output_tokens": 0},
    }
