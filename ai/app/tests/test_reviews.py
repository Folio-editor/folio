from __future__ import annotations

from fastapi.testclient import TestClient

from app.api.v1 import reviews as reviews_module
from app.config import settings
from app.db.session import get_session
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
                    ("박지훈", "남", "29", "무기력하지만 예민함", "안경 관련 설정 없음"),
                ]
            )
        if "FROM world_note" in query:
            return FakeResult(
                [
                    ("오션", "물방울 후원 시스템이 있는 인터넷 방송 플랫폼"),
                ]
            )
        raise AssertionError(f"unexpected query: {query}")


def test_reviews_endpoint_returns_fake_review(monkeypatch):
    async def fake_assemble_context(
        payload,
        work_id: str,
        writer_id: str,
        storyline: str,
        current_episode_num: int,
        mode: str = "draft",
    ) -> str:
        return "mocked context"

    async def override_get_session():
        yield FakeSession()

    monkeypatch.setattr(reviews_module, "assemble_context", fake_assemble_context)
    monkeypatch.setattr(reviews_module, "get_llm", lambda: FakeLLM())
    app.dependency_overrides[get_session] = override_get_session

    try:
        with TestClient(app) as client:
            response = client.post(
                "/v1/reviews",
                headers={"X-Internal-Api-Key": settings.internal_api_key},
                json={
                    "work_id": "11111111-1111-1111-1111-111111111111",
                    "writer_id": "22222222-2222-2222-2222-222222222222",
                    "episode_id": "33333333-3333-3333-3333-333333333333",
                    "content": "검수 대상 원고 본문",
                    "episode_number": 12,
                    "context": {
                        "work_meta": {"title": "테스트 작품"},
                        "characters": [],
                        "world_notes": [],
                        "foreshadows": [],
                        "plots": [],
                        "recent_episodes": [],
                    },
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "issues": [],
        "summary": "검수 결과 없음 (fake)",
        "score": 100,
        "usage": {"input_tokens": 0, "output_tokens": 0},
    }
