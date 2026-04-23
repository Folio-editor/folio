from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.api.v1 import drafts as drafts_module
from app.config import settings
from app.main import app
from app.services.llm import FakeLLM


def test_drafts_endpoint_accepts_opus_model(monkeypatch):
    captured: dict[str, str | None] = {"model_override": None}

    async def fake_assemble_context(
        work_id: str,
        writer_id: str,
        storyline: str,
        current_episode_num: int,
    ) -> str:
        return "mocked context"

    class TrackingFakeLLM(FakeLLM):
        async def generate_stream(
            self,
            system: str,
            user: str,
            model_override: str | None = None,
        ):
            captured["model_override"] = model_override
            async for chunk in super().generate_stream(system, user, model_override=model_override):
                yield chunk

    monkeypatch.setattr(drafts_module, "assemble_context", fake_assemble_context)
    monkeypatch.setattr(drafts_module, "get_llm", lambda: TrackingFakeLLM())
    monkeypatch.setattr(settings, "claude_opus_model", "claude-opus-test")

    with TestClient(app) as client:
        with client.stream(
            "POST",
            "/v1/drafts",
            headers={"X-Internal-Api-Key": settings.internal_api_key},
            json={
                "work_id": "11111111-1111-1111-1111-111111111111",
                "writer_id": "22222222-2222-2222-2222-222222222222",
                "episode_id": "33333333-3333-3333-3333-333333333333",
                "storyline": "박지훈이 두 번째 방송을 시작한다",
                "current_episode_num": 2,
                "model": "opus",
            },
        ) as response:
            events = [line for line in response.iter_lines() if line]

    assert response.status_code == 200
    assert any('"type": "chunk"' in line for line in events)
    done_events = [
        json.loads(line.removeprefix("data: "))
        for line in events
        if '"type": "done"' in line
    ]
    assert len(done_events) == 1
    assert done_events[0]["usage"] == {"input_tokens": 0, "output_tokens": 0}
    assert captured["model_override"] == "claude-opus-test"
