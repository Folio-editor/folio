"""Phase 4.6 — 사용자 시나리오 시뮬레이션 (end-to-end 흐름 트레이스).

각 시나리오는 실제 코드 경로 (라우터 → 태스크 → MCP 도구 → DB) 를 mock 으로 연결해
회로 끊김 / 평문 누출 / 암호화 누락 등 통합 결함을 잡는다.
"""

from __future__ import annotations

import asyncio
import hashlib
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.mcp.context import WriterContext


WORK_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
WRITER_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
EPISODE_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")


# ════════════════════════════════════════════════════════════════
# 시나리오 1: 작가가 클라이언트에서 회차 작성
#   → PowerSync sync → backend SyncService → triggerIndexing
#   → AI server /v1/pipelines/episode → chunk_and_embed_task
#   → 평문 fetch (Vault Transit) → 청킹·임베딩·암호화 → INSERT
# ════════════════════════════════════════════════════════════════

def test_scenario_1_powersync_to_chunk_encryption(monkeypatch):
    """작가의 본문 → backend → AI → ciphertext chunk 적재 흐름 시뮬레이션."""
    from app.tasks import chunk_and_embed as ce_mod

    monkeypatch.setattr(ce_mod, "chunk_text", lambda x: ["1번청크", "2번청크"])
    monkeypatch.setattr(ce_mod, "extract_plain_text", lambda x: x)
    monkeypatch.setattr(ce_mod, "count_tokens", lambda x: 5)
    monkeypatch.setattr(ce_mod, "get_embedder",
                        lambda: SimpleNamespace(embed_batch=AsyncMock(return_value=[[0.1] * 1536, [0.2] * 1536])))

    encrypt_calls: list = []
    async def fake_encrypt(wid, fields):
        encrypt_calls.append((wid, dict(fields)))
        return {k: f"v1:CT_{v}" for k, v in fields.items()}
    monkeypatch.setattr(ce_mod, "encrypt_fields", fake_encrypt)

    captured_rows: list = []
    real_pg_insert = ce_mod.pg_insert
    class _Capture:
        def __init__(self, model): self._m = model
        def values(self, rows):
            captured_rows.extend(rows)
            from app.db.models.episode_chunk import EpisodeChunk
            return real_pg_insert(EpisodeChunk).values(rows)
    monkeypatch.setattr(ce_mod, "pg_insert", lambda m: _Capture(m))

    class FakeSession:
        async def execute(self, stmt): return None
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        def begin(self):
            class _Tx:
                async def __aenter__(self): return None
                async def __aexit__(self, *a): pass
            return _Tx()

    monkeypatch.setattr(ce_mod, "create_async_engine",
                        lambda *a, **kw: SimpleNamespace(dispose=AsyncMock()))
    monkeypatch.setattr(ce_mod, "AsyncSession", lambda e: FakeSession())

    plain_content = "앤이 다락방에서 어머니의 일기를 발견했다."
    expected_hash = hashlib.sha256(plain_content.encode()).hexdigest()

    result = asyncio.run(ce_mod._run(
        episode_id=str(EPISODE_ID), work_id=str(WORK_ID), writer_id=str(WRITER_ID),
        content=plain_content,
    ))
    assert result == 2

    # encrypt round-trip 1회만 (batch)
    assert len(encrypt_calls) == 1
    assert encrypt_calls[0][1] == {"c0": "1번청크", "c1": "2번청크"}

    # 모든 row content ciphertext + content_hash 동일 + embedding 평문 vector
    assert len(captured_rows) == 2
    for r in captured_rows:
        assert r["content"].startswith("v1:CT_"), f"평문 잔존: {r['content']}"
        assert r["content_hash"] == expected_hash, "content_hash 불일치"
        assert isinstance(r["embedding"], list) and len(r["embedding"]) == 1536


# ════════════════════════════════════════════════════════════════
# 시나리오 2: 같은 본문 재동기화 → idempotency skip
#   → /v1/pipelines/episode 가 episode_chunk.content_hash 1 query 로 skip 결정
# ════════════════════════════════════════════════════════════════

def test_scenario_2_same_content_resync_skips(monkeypatch):
    """평문 hash 일치 시 chunk_and_embed_task 호출 차단 — OpenAI 임베딩 비용 0."""
    from fastapi.testclient import TestClient

    from app.api.v1 import pipelines as pl_mod
    from app.config import settings
    from app.db.session import get_session
    from app.main import app
    from app.services.text_extractor import extract_plain_text

    plain = "동일 본문"
    h = hashlib.sha256(extract_plain_text(plain).encode()).hexdigest()

    apply_called = {"v": False}
    def fake_apply_async(*, args):
        apply_called["v"] = True
        raise AssertionError("동일 hash → apply_async 호출되면 안됨")

    class FakeResult:
        def scalar_one_or_none(self): return h    # DB 에 같은 hash 있음

    class FakeSession:
        async def execute(self, stmt): return FakeResult()

    async def override_session(): yield FakeSession()
    monkeypatch.setattr(pl_mod.chunk_and_embed_task, "apply_async", fake_apply_async)
    app.dependency_overrides[get_session] = override_session

    try:
        with TestClient(app) as client:
            resp = client.post(
                "/v1/pipelines/episode",
                headers={"X-Internal-Api-Key": settings.internal_api_key},
                json={"episode_id": str(EPISODE_ID), "work_id": str(WORK_ID),
                      "writer_id": str(WRITER_ID), "content": plain},
            )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "skipped"
    assert body["reason"] == "content_unchanged"
    assert apply_called["v"] is False    # apply_async 미호출 검증


# ════════════════════════════════════════════════════════════════
# 시나리오 3: 본문 수정 → 다른 hash → 재인덱싱
# ════════════════════════════════════════════════════════════════

def test_scenario_3_modified_content_triggers_reindex(monkeypatch):
    """본문 수정 시 hash 불일치 → apply_async 호출 → chunk_and_embed 재실행."""
    from fastapi.testclient import TestClient

    from app.api.v1 import pipelines as pl_mod
    from app.config import settings
    from app.db.session import get_session
    from app.main import app

    apply_called = {"v": False, "args": None}
    class _R: id = "task-456"
    def fake_apply_async(*, args):
        apply_called["v"] = True
        apply_called["args"] = args
        return _R()

    # DB 에 옛 hash 가 저장되어 있음 (현재 요청과 다름)
    class FakeResult:
        def scalar_one_or_none(self): return "오래된_해시값" * 10
    class FakeSession:
        async def execute(self, stmt): return FakeResult()
    async def override_session(): yield FakeSession()

    monkeypatch.setattr(pl_mod.chunk_and_embed_task, "apply_async", fake_apply_async)
    app.dependency_overrides[get_session] = override_session

    try:
        with TestClient(app) as client:
            resp = client.post(
                "/v1/pipelines/episode",
                headers={"X-Internal-Api-Key": settings.internal_api_key},
                json={"episode_id": str(EPISODE_ID), "work_id": str(WORK_ID),
                      "writer_id": str(WRITER_ID), "content": "새로운 본문"},
            )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 202
    assert resp.json()["status"] == "accepted"
    assert apply_called["v"] is True


# ════════════════════════════════════════════════════════════════
# 시나리오 4: agent 가 query_episodes_by_chunks 호출
#   → 벡터 유사도 top-k → chunk content (ciphertext) 일괄 복호화 → Haiku 합성
# ════════════════════════════════════════════════════════════════

def test_scenario_4_query_episodes_decrypts_chunks_for_haiku(monkeypatch):
    """Haiku 합성 시 chunk content 가 평문으로 전달돼야 정확한 답 합성."""
    from app.mcp.tools import episode_search as esrch

    # vector embedder mock
    monkeypatch.setattr(esrch, "get_embedder",
                        lambda: SimpleNamespace(embed_batch=AsyncMock(return_value=[[0.5] * 1536])))

    # SELECT 순서 (4 cols): ep.id, ep.sort_order, ec.content, similarity
    fake_rows = [
        ("ep-uuid-1", 1, "v1:CT_앤이 일기를 발견했다.", 0.92),
        ("ep-uuid-1", 1, "v1:CT_마릴라가 침묵했다.", 0.87),
    ]
    class FakeResult:
        def fetchall(self): return fake_rows
    class FakeSession:
        async def execute(self, stmt, params=None): return FakeResult()

    # decrypt round-trip mock
    decrypt_called = {"v": False}
    async def fake_decrypt_rows(wid, rows, fields):
        decrypt_called["v"] = True
        return [{**r, "content": r["content"][len("v1:CT_"):] if r["content"].startswith("v1:CT_") else r["content"]} for r in rows]
    monkeypatch.setattr(esrch, "decrypt_rows", fake_decrypt_rows)

    # Haiku LLM mock — chunks 평문 받았는지 검증
    haiku_input = {"chunks": None}
    async def fake_generate_json(system, user, schema, **kwargs):
        haiku_input["chunks"] = user
        return {"answer": "앤이 일기를 발견하고 마릴라가 침묵하는 장면."}
    fake_llm = SimpleNamespace(
        _haiku_model="claude-haiku-test",
        generate_json=fake_generate_json,
        last_usage={"input_tokens": 100, "output_tokens": 50},
    )
    monkeypatch.setattr(esrch, "get_llm", lambda: fake_llm)

    ctx = WriterContext(work_id=WORK_ID, writer_id=WRITER_ID)
    result = asyncio.run(esrch.query_episodes_by_chunks(
        FakeSession(), ctx, query="일기 발견 장면",
    ))

    assert decrypt_called["v"] is True, "복호화 미호출 — Haiku 가 ciphertext 받음"
    # Haiku 입력에 평문 chunk 들어가 있어야 정확 합성
    assert "앤이 일기를 발견했다" in haiku_input["chunks"]
    assert "마릴라가 침묵했다" in haiku_input["chunks"]
    # ciphertext 프리픽스 노출 X
    assert "v1:CT_" not in haiku_input["chunks"]
    # 답변 생성 OK
    assert "answer" in result


# ════════════════════════════════════════════════════════════════
# 시나리오 5: agent 가 summarize_episode 호출 (cache miss → Haiku → encrypt → UPSERT)
#   → 다음 호출 (cache hit) → decrypt → 평문 반환
# ════════════════════════════════════════════════════════════════

def test_scenario_5_summarize_then_cache_hit_round_trip(monkeypatch):
    """동일 회차 2회 호출: 1회차 miss + Haiku + UPSERT, 2회차 hit + decrypt."""
    from datetime import datetime as dt

    from app.mcp.tools import episode_plaintext as ep_mod

    # Haiku mock
    haiku_response = {
        "oneline_summary": "발견의 충격",
        "summary": "앤이 일기를 발견하고 마릴라의 침묵에 충격받는다.",
        "pov_character": "앤",
        "present_characters": ["앤", "마릴라"],
        "present_locations": ["다락방"],
        "key_events": [{"order": 1, "event": "일기 발견"}],
        "time_progression": "노을",
        "tone": "충격",
        "cliffhanger": "마릴라의 침묵",
        "foreshadow_planted": [],
        "foreshadow_paid_off": [],
        "keywords": ["편지", "비밀"],
    }
    haiku_call_count = {"n": 0}
    async def fake_gen(s, u, sc, **kw):
        haiku_call_count["n"] += 1
        return haiku_response
    fake_llm = SimpleNamespace(_haiku_model="haiku", generate_json=fake_gen,
                                last_usage={"input_tokens": 1000, "output_tokens": 200})
    monkeypatch.setattr(ep_mod, "get_llm", lambda: fake_llm)

    async def fake_resolve(eid, wid): return "평문 본문"
    monkeypatch.setattr(ep_mod, "resolve_episode_plaintext", fake_resolve)

    async def fake_enc(wid, plain):
        return {k: (f"v1:CT_{v}" if isinstance(v, str) and v else v) for k, v in plain.items()}
    monkeypatch.setattr(ep_mod, "encrypt_summary_text_fields", fake_enc)

    async def fake_decrypt_rows(wid, rows, fields):
        return [{**r, **{f: r[f][len("v1:CT_"):] if isinstance(r.get(f), str) and r[f].startswith("v1:CT_") else r.get(f) for f in fields}} for r in rows]
    monkeypatch.setattr(ep_mod, "decrypt_rows", fake_decrypt_rows)

    # 상태 토글: 1회차 = cache miss, 2회차 = cache hit
    call_state = {"call": 0, "stored": {}}

    class FakeSession:
        async def execute(self, stmt, params=None):
            # SELECT (params 있는 분기) — episode + summary join
            if params and "so" in params:
                if call_state["call"] == 0:
                    # cache miss row
                    class Row:
                        def __getitem__(self, i):
                            return [EPISODE_ID, "1화", dt(2026,5,7), None, 0,
                                    None, None, None, None, None, None, None, None, None, None, None, None][i]
                    class R:
                        def fetchone(self): return Row()
                    return R()
                else:
                    # cache hit row — UPSERT 결과 가정
                    s = call_state["stored"]
                    class Row:
                        def __getitem__(self, i):
                            return [EPISODE_ID, "1화", dt(2026,5,7), dt(2026,5,8), 1,
                                    s.get("oneline_summary"), s.get("summary"),
                                    "앤", ["앤","마릴라"], ["다락방"],
                                    [{"order":1,"event":"일기 발견"}],
                                    s.get("time_progression"), "충격",
                                    s.get("cliffhanger"),
                                    [], [], ["편지","비밀"]][i]
                    class R:
                        def fetchone(self): return Row()
                    return R()
            else:
                # UPSERT — 컴파일된 statement 의 values 캡처
                try:
                    p = stmt.compile().params
                    if "summary" in p:
                        call_state["stored"] = {
                            "oneline_summary": p.get("oneline_summary"),
                            "summary": p.get("summary"),
                            "time_progression": p.get("time_progression"),
                            "cliffhanger": p.get("cliffhanger"),
                        }
                except Exception:
                    pass
                return None

    ctx = WriterContext(work_id=WORK_ID, writer_id=WRITER_ID)
    sess = FakeSession()

    # === 1회차 호출 (cache miss) ===
    r1 = asyncio.run(ep_mod.summarize_episode(sess, ctx, sort_order=1))
    assert r1["cached"] is False
    assert haiku_call_count["n"] == 1
    # 반환은 평문 (LLM 즉시 사용)
    assert r1["summary"] == "앤이 일기를 발견하고 마릴라의 침묵에 충격받는다."
    assert r1["oneline_summary"] == "발견의 충격"
    # UPSERT 에 들어간 값은 ciphertext
    stored = call_state["stored"]
    assert stored["summary"].startswith("v1:CT_"), f"평문 적재됨: {stored['summary']!r}"
    assert stored["oneline_summary"].startswith("v1:CT_")
    assert stored["cliffhanger"].startswith("v1:CT_")

    # === 2회차 호출 (cache hit) ===
    call_state["call"] = 1
    r2 = asyncio.run(ep_mod.summarize_episode(sess, ctx, sort_order=1))
    assert r2["cached"] is True
    assert haiku_call_count["n"] == 1     # Haiku 재호출 안 됨
    # cache 에서 ciphertext 읽어 복호화 후 반환 → 평문
    assert r2["summary"] == "앤이 일기를 발견하고 마릴라의 침묵에 충격받는다."
    assert r2["oneline_summary"] == "발견의 충격"
    assert r2["cliffhanger"] == "마릴라의 침묵"


# ════════════════════════════════════════════════════════════════
# 시나리오 6: agent 가 search_episode_summaries 호출
#   → SQL 1차 필터 → batch decrypt → Python substring → 어형 변화 hit
# ════════════════════════════════════════════════════════════════

def test_scenario_6_search_summaries_finds_inflected_form(monkeypatch):
    """검색어 '발견' 으로 본문 '발견했다' 가진 회차 매칭 (Option A 의 강점)."""
    from app.mcp.tools import episode_summary as es_mod

    # SELECT 순서 (12 cols): ep.id, sort_order, ep.title, oneline_summary,
    #   pov, tone, present_chars, cliffhanger, summary, present_locs, key_events, keywords
    rows = [
        ("ep-uuid-1", 1, "v1:CT_1화", "v1:CT_앤이 발견", "앤", "충격", ["앤"], "v1:CT_침묵",
         "v1:CT_앤이 다락방에서 어머니의 일기를 발견했다.",
         ["다락방"], [{"order":1,"event":"발견"}], ["편지"]),
        ("ep-uuid-2", 2, "v1:CT_2화", "v1:CT_평범 일상", "앤", "평온", ["앤"], None,
         "v1:CT_앤이 학교에 갔다.",
         ["학교"], [{"order":1,"event":"등교"}], ["일상"]),
    ]
    class FR:
        def fetchall(self): return rows
    class FS:
        async def execute(self, stmt, params=None): return FR()

    async def fake_decrypt(wid, r, fields):
        return [{**row, **{f: row.get(f)[len("v1:CT_"):] if isinstance(row.get(f), str) and row[f].startswith("v1:CT_") else row.get(f) for f in fields}} for row in r]
    monkeypatch.setattr(es_mod, "decrypt_rows", fake_decrypt)

    ctx = WriterContext(work_id=WORK_ID, writer_id=WRITER_ID)
    result = asyncio.run(es_mod.search_episode_summaries(FS(), ctx, keyword="발견", scope="all", limit=10))

    sort_orders = [r["sort_order"] for r in result]
    assert 1 in sort_orders, "어형 변화 매칭 실패 — '발견했다' 못 찾음"
    assert 2 not in sort_orders


# ════════════════════════════════════════════════════════════════
# 시나리오 7: SuggestionApplier 가 episode_draft INSERT 후 EpisodeIndexingTrigger.fireIndexing
#   호출 → AI server 가 chunk_and_embed_task 적재 → 암호화 INSERT
#   (E2E 는 Java 영역이라 본 테스트는 AI 서버 측 trigger payload 만 검증)
# ════════════════════════════════════════════════════════════════

def test_scenario_7_summarize_episode_no_plaintext_returns_error(monkeypatch):
    """server_encrypted_dek 미발급 → resolve_episode_plaintext 가 WorkKeyResolverError →
    summarize_episode 가 error 반환, INSERT/encrypt 호출 안 함."""
    from app.mcp.tools import episode_plaintext as ep_mod
    from app.services.work_key_resolver import WorkKeyResolverError

    enc_calls = {"n": 0}
    async def fake_enc(wid, plain):
        enc_calls["n"] += 1
        return plain
    monkeypatch.setattr(ep_mod, "encrypt_summary_text_fields", fake_enc)

    async def boom(eid, wid):
        raise WorkKeyResolverError("server_encrypted_dek 미발급")
    monkeypatch.setattr(ep_mod, "resolve_episode_plaintext", boom)

    class FakeRow:
        def __getitem__(self, i):
            from datetime import datetime as dt
            # cache miss row
            return [EPISODE_ID, "1화", dt(2026,5,7), None, 0,
                    None, None, None, None, None, None, None, None, None, None, None, None][i]
    class FakeSession:
        async def execute(self, stmt, params=None):
            class R:
                def fetchone(self): return FakeRow()
            return R()

    ctx = WriterContext(work_id=WORK_ID, writer_id=WRITER_ID)
    result = asyncio.run(ep_mod.summarize_episode(FakeSession(), ctx, sort_order=1))

    assert result.get("error") == "no_plaintext"
    assert enc_calls["n"] == 0, "평문 fetch 실패했는데 encrypt 호출됨 — 흐름 오류"
