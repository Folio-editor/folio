from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.api.v1 import pipelines as pipelines_module
from app.config import settings
from app.db.session import get_session
from app.main import app


class _FakeScalarResult:
    def __init__(self, values: list[str]) -> None:
        self._values = values

    def all(self) -> list[str]:
        return list(self._values)


class _FakeExecuteResult:
    def __init__(self, values: list[str]) -> None:
        self._values = values

    def scalars(self) -> _FakeScalarResult:
        return _FakeScalarResult(self._values)


class _FakeSession:
    def __init__(self, values: list[str]) -> None:
        self._values = values

    async def execute(self, stmt):  # noqa: ANN001
        return _FakeExecuteResult(self._values)


def test_episode_pipeline_enqueues_chunk_and_embed_only(monkeypatch):
    captured: dict[str, tuple[str, str, str, str] | None] = {"args": None}

    class FakeResult:
        id = "task-123"

    def fake_apply_async(*, args):
        captured["args"] = args
        return FakeResult()

    async def override_get_session():
        yield _FakeSession([])

    monkeypatch.setattr(pipelines_module.chunk_and_embed_task, "apply_async", fake_apply_async)
    app.dependency_overrides[get_session] = override_get_session

    try:
        with TestClient(app) as client:
            response = client.post(
                "/v1/pipelines/episode",
                headers={"X-Internal-Api-Key": settings.internal_api_key},
                json={
                    "episode_id": "11111111-1111-1111-1111-111111111111",
                    "work_id": "22222222-2222-2222-2222-222222222222",
                    "writer_id": "33333333-3333-3333-3333-333333333333",
                    "content": "테스트 본문",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    assert response.json() == {"task_id": "task-123", "status": "accepted", "reason": None}
    assert captured["args"] == (
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
        "33333333-3333-3333-3333-333333333333",
        "테스트 본문",
    )


def test_episode_pipeline_skips_when_content_unchanged(monkeypatch):
    called = {"apply_async": False}
    tiptap_doc = json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "같은 내용"}],
                }
            ],
        },
        ensure_ascii=False,
    )

    def fake_apply_async(*, args):
        called["apply_async"] = True
        raise AssertionError("apply_async should not be called when content is unchanged")

    async def override_get_session():
        yield _FakeSession(["같은 내용"])

    monkeypatch.setattr(pipelines_module.chunk_and_embed_task, "apply_async", fake_apply_async)
    app.dependency_overrides[get_session] = override_get_session

    try:
        with TestClient(app) as client:
            response = client.post(
                "/v1/pipelines/episode",
                headers={"X-Internal-Api-Key": settings.internal_api_key},
                json={
                    "episode_id": "11111111-1111-1111-1111-111111111111",
                    "work_id": "22222222-2222-2222-2222-222222222222",
                    "writer_id": "33333333-3333-3333-3333-333333333333",
                    "content": tiptap_doc,
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    assert response.json() == {
        "task_id": None,
        "status": "skipped",
        "reason": "content unchanged",
    }
    assert called["apply_async"] is False
