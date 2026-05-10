from __future__ import annotations

import hashlib
import json

from fastapi.testclient import TestClient

from app.api.v1 import pipelines as pipelines_module
from app.config import settings
from app.db.session import get_session
from app.main import app
from app.services.text_extractor import extract_plain_text


class _FakeExecuteResult:
    """Phase 4.6: pipelines.py 가 SELECT content_hash LIMIT 1 → scalar_one_or_none 로
    idempotency 체크. 테스트는 fixture 가 반환할 hash 값을 직접 주입.
    """

    def __init__(self, scalar_value: str | None) -> None:
        self._scalar = scalar_value

    def scalar_one_or_none(self) -> str | None:
        return self._scalar


class _FakeSession:
    def __init__(self, scalar_value: str | None = None) -> None:
        self._scalar = scalar_value

    async def execute(self, stmt):  # noqa: ANN001
        return _FakeExecuteResult(self._scalar)


def test_episode_pipeline_enqueues_chunk_and_embed_only(monkeypatch):
    captured: dict[str, tuple[str, str, str, str] | None] = {"args": None}

    class FakeResult:
        id = "task-123"

    def fake_apply_async(*, args):
        captured["args"] = args
        return FakeResult()

    async def override_get_session():
        yield _FakeSession(scalar_value=None)    # 기존 chunk 없음 → idempotency skip 안 함

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
    body = response.json()
    assert body["task_id"] == "task-123"
    assert body["status"] == "accepted"
    assert body["reason"] is None
    assert body["idempotency_key"].startswith("indexing:11111111-")
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

    # Phase 4.6: idempotency 체크가 평문 본문 SHA256 비교 — fixture 가 그 hash 를 반환
    plain = extract_plain_text(tiptap_doc)
    expected_hash = hashlib.sha256(plain.encode("utf-8")).hexdigest()

    async def override_get_session():
        yield _FakeSession(scalar_value=expected_hash)

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
    body = response.json()
    assert body["task_id"] is None
    assert body["status"] == "skipped"
    assert body["reason"] == "content_unchanged"
    assert body["idempotency_key"].startswith("indexing:11111111-")
    assert called["apply_async"] is False
