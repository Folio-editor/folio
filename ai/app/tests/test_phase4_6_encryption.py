"""Phase 4.6 — chunk content + episode_summary 자유형 텍스트 암호화 통합 시뮬레이션.

검증 시나리오:
 1) encrypt_resolver._needs_encrypt 분기 (None/빈/평문/v1:)
 2) encrypt_summary_text_fields 동작 (텍스트만 골라 암호화 + JSONB pass-through)
 3) chunk_and_embed_task — 평문 chunks → ciphertext 적재 (INSERT row 의 content 가 v1:)
 4) summarize_episode UPSERT 흐름 — 자유형 텍스트 암호화 + JSONB 평문, 반환은 평문
 5) summarize_episode cache hit — 복호화 후 평문 반환
 6) search_episode_summaries Option A — substring 매칭 (어형 변화 hit) + scope 분기
 7) find_relevant_episodes — DB-only, 암호화/복호화 없음 (sanity)
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.mcp.context import WriterContext
from app.services import encrypt_resolver as enc_mod


WORK_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")
WRITER_ID = uuid.UUID("33333333-3333-3333-3333-333333333333")
EPISODE_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")


# ════════════════════════════════════════════════════════════════
# 1) _needs_encrypt 단위
# ════════════════════════════════════════════════════════════════

def test_needs_encrypt_none():
    assert enc_mod._needs_encrypt(None) is False


def test_needs_encrypt_empty_string():
    assert enc_mod._needs_encrypt("") is False


def test_needs_encrypt_already_ciphertext():
    assert enc_mod._needs_encrypt("v1:abc123base64==") is False


def test_needs_encrypt_plaintext():
    assert enc_mod._needs_encrypt("앤이 일기를 발견하다") is True


def test_needs_encrypt_non_string():
    assert enc_mod._needs_encrypt(["list"]) is False
    assert enc_mod._needs_encrypt(42) is False
    assert enc_mod._needs_encrypt({"key": "val"}) is False


# ════════════════════════════════════════════════════════════════
# 2) encrypt_summary_text_fields — 텍스트만 골라 암호화
# ════════════════════════════════════════════════════════════════

def _fake_encrypt_fields_factory(prefix: str = "v1:CT_"):
    """평문 → 가짜 ciphertext (각 값마다 prefix + 원문) 반환하는 mock."""
    async def _fake(work_id, fields):
        out = {}
        for k, v in fields.items():
            if v is None or v == "" or (isinstance(v, str) and v.startswith("v1:")):
                out[k] = v
            else:
                out[k] = f"{prefix}{v}"
        return out
    return _fake


def test_encrypt_summary_text_fields_only_text(monkeypatch):
    monkeypatch.setattr(enc_mod, "encrypt_fields", _fake_encrypt_fields_factory())

    summary = {
        "oneline_summary": "한 줄 요약",
        "summary": "본문 줄거리 3 문장",
        "time_progression": "한 시간",
        "cliffhanger": "끝점 묘사",
        # 평문 유지 대상
        "pov_character": "앤",
        "tone": "긴장감 고조",
        "present_characters": ["앤", "마릴라"],
        "key_events": [{"order": 1, "event": "발견"}],
        "word_count": 1234,
        "is_confirmed": False,
    }
    out = asyncio.run(enc_mod.encrypt_summary_text_fields(WORK_ID, summary))

    # 4개 텍스트 필드만 ciphertext 화
    assert out["oneline_summary"] == "v1:CT_한 줄 요약"
    assert out["summary"] == "v1:CT_본문 줄거리 3 문장"
    assert out["time_progression"] == "v1:CT_한 시간"
    assert out["cliffhanger"] == "v1:CT_끝점 묘사"

    # 평문 유지 — pov_character / tone / JSONB / 숫자/bool 그대로
    assert out["pov_character"] == "앤"
    assert out["tone"] == "긴장감 고조"
    assert out["present_characters"] == ["앤", "마릴라"]
    assert out["key_events"] == [{"order": 1, "event": "발견"}]
    assert out["word_count"] == 1234
    assert out["is_confirmed"] is False


def test_encrypt_summary_text_fields_with_none(monkeypatch):
    """None 텍스트 필드는 그대로 None 통과 (cliffhanger 등 nullable)."""
    monkeypatch.setattr(enc_mod, "encrypt_fields", _fake_encrypt_fields_factory())

    summary = {
        "oneline_summary": "한 줄 요약",
        "summary": "본문",
        "time_progression": None,
        "cliffhanger": None,
    }
    out = asyncio.run(enc_mod.encrypt_summary_text_fields(WORK_ID, summary))
    assert out["oneline_summary"].startswith("v1:")
    assert out["summary"].startswith("v1:")
    assert out["time_progression"] is None
    assert out["cliffhanger"] is None


def test_encrypt_summary_text_fields_already_ciphertext(monkeypatch):
    """이미 v1: 면 echo (이중 암호화 차단)."""
    monkeypatch.setattr(enc_mod, "encrypt_fields", _fake_encrypt_fields_factory())

    summary = {
        "oneline_summary": "v1:already_encrypted",
        "summary": "새 평문",
    }
    out = asyncio.run(enc_mod.encrypt_summary_text_fields(WORK_ID, summary))
    assert out["oneline_summary"] == "v1:already_encrypted"     # echo
    assert out["summary"] == "v1:CT_새 평문"                     # 새로 암호화


# ════════════════════════════════════════════════════════════════
# 3) chunk_and_embed — 평문 chunks → ciphertext 적재 시뮬레이션
# ════════════════════════════════════════════════════════════════

def test_chunk_and_embed_encrypts_chunks(monkeypatch):
    """chunk_and_embed_task 의 _run 가 평문 chunks 를 backend encrypt-fields 로 보내고,
    반환된 ciphertext 로 INSERT 진행하는지 검증.

    INSERT 자체는 SQLAlchemy mock — Insert statement 가 rows 를 받아 컴파일하는 흐름은
    프로덕션 SQLAlchemy 가 책임지고, 본 테스트는 _run 의 암호화 책임만 확인.
    """
    from app.tasks import chunk_and_embed as ce_mod

    monkeypatch.setattr(ce_mod, "chunk_text", lambda text: ["청크1: 앤이 발견", "청크2: 어머니의 편지"])
    monkeypatch.setattr(ce_mod, "extract_plain_text", lambda x: x)
    monkeypatch.setattr(ce_mod, "count_tokens", lambda text: 10)
    monkeypatch.setattr(ce_mod, "get_embedder",
                        lambda: SimpleNamespace(embed_batch=AsyncMock(return_value=[[0.1] * 1536, [0.2] * 1536])))

    fake_encrypt = AsyncMock(side_effect=lambda wid, fields: {k: f"v1:CT_{v}" for k, v in fields.items()})
    monkeypatch.setattr(ce_mod, "encrypt_fields", fake_encrypt)

    # values 캡처 — pg_insert(EpisodeChunk).values(rows) 의 rows 를 monkey-patch 로 가로챔
    captured_rows: list[list[dict]] = []
    real_pg_insert = ce_mod.pg_insert

    class _ValuesCapture:
        def __init__(self, rows):
            self._rows = rows
        def values(self, rows):
            captured_rows.append(rows)
            # 진짜 pg_insert 의 values 호출 결과로 위임
            from app.db.models.episode_chunk import EpisodeChunk
            return real_pg_insert(EpisodeChunk).values(rows)

    monkeypatch.setattr(ce_mod, "pg_insert", lambda model: _ValuesCapture(model))

    class FakeSession:
        async def execute(self, stmt):
            return None
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        def begin(self):
            class _Tx:
                async def __aenter__(self): return None
                async def __aexit__(self, *a): pass
            return _Tx()

    monkeypatch.setattr(ce_mod, "create_async_engine",
                        lambda *a, **kw: SimpleNamespace(dispose=AsyncMock()))
    monkeypatch.setattr(ce_mod, "AsyncSession", lambda engine: FakeSession())

    result = asyncio.run(ce_mod._run(
        episode_id=str(EPISODE_ID), work_id=str(WORK_ID), writer_id=str(WRITER_ID),
        content="앤이 일기를 발견했다. 어머니의 비밀이었다.",
    ))

    assert result == 2

    # encrypt_fields 호출 검증
    fake_encrypt.assert_awaited_once()
    payload = fake_encrypt.await_args.args[1]
    assert payload == {"c0": "청크1: 앤이 발견", "c1": "청크2: 어머니의 편지"}

    # INSERT 가 받은 rows 검증 — content 가 ciphertext, embedding 은 평문
    assert len(captured_rows) == 1, f"pg_insert.values 호출 횟수 이상: {len(captured_rows)}"
    rows = captured_rows[0]
    assert len(rows) == 2
    assert all(r["content"].startswith("v1:CT_") for r in rows), \
        f"content 평문 잔존: {[r['content'] for r in rows]}"
    assert rows[0]["content"] == "v1:CT_청크1: 앤이 발견"
    assert rows[1]["content"] == "v1:CT_청크2: 어머니의 편지"
    assert rows[0]["embedding"] == [0.1] * 1536
    assert rows[1]["embedding"] == [0.2] * 1536


def test_chunk_and_embed_skips_when_encrypt_fails(monkeypatch):
    """암호화 round-trip 실패 시 INSERT 차단 + 빈 결과 반환 (DB 평문 적재 거부)."""
    from app.tasks import chunk_and_embed as ce_mod

    monkeypatch.setattr(ce_mod, "chunk_text", lambda text: ["청크1"])
    monkeypatch.setattr(ce_mod, "extract_plain_text", lambda x: x)
    monkeypatch.setattr(ce_mod, "count_tokens", lambda text: 5)
    monkeypatch.setattr(ce_mod, "get_embedder",
                        lambda: SimpleNamespace(embed_batch=AsyncMock(return_value=[[0.0] * 1536])))

    async def boom(wid, fields):
        raise ce_mod.EncryptResolverError("backend down")
    monkeypatch.setattr(ce_mod, "encrypt_fields", boom)

    inserts: list = []

    class FakeSession:
        async def execute(self, stmt):
            inserts.append(stmt)
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        def begin(self):
            class _Tx:
                async def __aenter__(self): return None
                async def __aexit__(self, *a): pass
            return _Tx()

    monkeypatch.setattr(ce_mod, "create_async_engine",
                        lambda *a, **kw: SimpleNamespace(dispose=AsyncMock()))
    monkeypatch.setattr(ce_mod, "AsyncSession", lambda engine: FakeSession())

    result = asyncio.run(ce_mod._run(
        episode_id=str(EPISODE_ID), work_id=str(WORK_ID), writer_id=str(WRITER_ID),
        content="평문 본문",
    ))
    assert result == 0          # 0 chunks 처리
    assert inserts == []        # INSERT 없음 (engine 자체 진입 안 함)


# ════════════════════════════════════════════════════════════════
# 4) summarize_episode — UPSERT 흐름 (Haiku → encrypt → INSERT, 반환은 평문)
# ════════════════════════════════════════════════════════════════

def test_summarize_episode_encrypts_text_fields_in_upsert(monkeypatch):
    """summarize_episode 가 text 필드만 ciphertext 로 UPSERT 하는지 + 반환은 평문 유지."""
    from app.mcp.tools import episode_plaintext as ep_mod

    haiku_result = {
        "oneline_summary": "앤이 일기 발견",
        "summary": "앤이 다락방에서 어머니의 일기를 발견하고 충격에 빠진다.",
        "pov_character": "앤",
        "present_characters": ["앤", "마릴라"],
        "present_locations": ["초록지붕집", "다락방"],
        "key_events": [{"order": 1, "event": "일기 발견"}],
        "time_progression": "노을 무렵, 30분",
        "tone": "충격·슬픔",
        "cliffhanger": "마릴라의 침묵",
        "foreshadow_planted": [{"name": "어머니의 일기", "description": "출생 비밀"}],
        "foreshadow_paid_off": [],
        "keywords": ["편지", "어머니", "비밀"],
    }

    fake_llm = SimpleNamespace(
        _haiku_model="claude-haiku-test",
        generate_json=AsyncMock(return_value=haiku_result),
        last_usage={"input_tokens": 1000, "output_tokens": 200},
    )
    monkeypatch.setattr(ep_mod, "get_llm", lambda: fake_llm)

    async def fake_resolve(eid, wid):
        return "앤이 일기를 발견했다. 어머니의 비밀이었다."
    monkeypatch.setattr(ep_mod, "resolve_episode_plaintext", fake_resolve)

    async def fake_enc_summary(wid, plain):
        return {k: (f"v1:CT_{v}" if isinstance(v, str) and v else v)
                for k, v in plain.items()}
    monkeypatch.setattr(ep_mod, "encrypt_summary_text_fields", fake_enc_summary)

    captured_upsert: dict = {}

    class FakeSession:
        async def execute(self, stmt, params=None):
            # SELECT 분기: episode + summary join — None summary (cache miss)
            if params and "eid" in params:
                # cache miss row: episode 존재, summary 없음
                class Row:
                    def __getitem__(self, i):
                        # row[0]=ep.id, [1]=title, [2]=ep_updated, [3]=es_last_gen, [4..16]=summary fields
                        return [
                            EPISODE_ID, "1화 일기 발견",
                            datetime(2026, 5, 7), None, 0,
                            None, None, None, None, None, None, None, None, None, None, None, None,
                        ][i]
                class R:
                    def fetchone(self):
                        return Row()
                return R()
            # UPSERT: 캡처
            try:
                # SQLAlchemy Insert dialect statement
                compiled = stmt.compile()
                captured_upsert.update(compiled.params)
            except Exception:
                pass
            return None

    ctx = WriterContext(work_id=WORK_ID, writer_id=WRITER_ID)
    result = asyncio.run(ep_mod.summarize_episode(FakeSession(), ctx, episode_id=str(EPISODE_ID)))

    # 반환값은 평문 유지 (Sonnet 즉시 사용)
    assert result["oneline_summary"] == "앤이 일기 발견"            # 평문
    assert result["summary"].startswith("앤이 다락방")             # 평문
    assert result["cliffhanger"] == "마릴라의 침묵"                # 평문
    assert result["time_progression"] == "노을 무렵, 30분"        # 평문
    assert result["pov_character"] == "앤"                        # 평문 (애초에 암호화 안 함)
    assert result["tone"] == "충격·슬픔"                          # 평문
    assert result["present_characters"] == ["앤", "마릴라"]
    assert result["cached"] is False
    assert result["generation_count"] == 1

    # UPSERT 에 들어간 값은 ciphertext (text 4개) + 평문 (pov/tone/JSONB)
    assert captured_upsert.get("oneline_summary") == "v1:CT_앤이 일기 발견"
    assert captured_upsert.get("summary", "").startswith("v1:CT_")
    assert captured_upsert.get("cliffhanger") == "v1:CT_마릴라의 침묵"
    assert captured_upsert.get("time_progression") == "v1:CT_노을 무렵, 30분"
    assert captured_upsert.get("pov_character") == "앤"          # 평문
    assert captured_upsert.get("tone") == "충격·슬픔"            # 평문
    assert captured_upsert.get("raw_result") is None             # 재암호화 비용 회피


# ════════════════════════════════════════════════════════════════
# 5) summarize_episode — cache hit 복호화
# ════════════════════════════════════════════════════════════════

def test_summarize_episode_cache_hit_decrypts(monkeypatch):
    """summary 가 이미 있고 stale 이 아니면 Haiku 미호출 + 복호화한 평문 반환."""
    from app.mcp.tools import episode_plaintext as ep_mod
    from app.services import decrypt_resolver as dec_mod

    fake_llm = SimpleNamespace(_haiku_model="claude-haiku-test",
                                generate_json=AsyncMock(),
                                last_usage={})
    monkeypatch.setattr(ep_mod, "get_llm", lambda: fake_llm)

    async def fake_decrypt_rows(work_id, rows, fields):
        out = []
        for r in rows:
            new = dict(r)
            for f in fields:
                v = new.get(f)
                if isinstance(v, str) and v.startswith("v1:CT_"):
                    new[f] = v[len("v1:CT_"):]      # 복호화 흉내
            out.append(new)
        return out
    monkeypatch.setattr(ep_mod, "decrypt_rows", fake_decrypt_rows)

    class FakeSession:
        async def execute(self, stmt, params=None):
            class Row:
                def __getitem__(self, i):
                    # cache hit row: ep_updated < es_last_gen (ciphertext text 필드)
                    return [
                        EPISODE_ID, "1화 일기 발견",
                        datetime(2026, 5, 6), datetime(2026, 5, 7), 1,
                        "v1:CT_앤이 일기 발견",     # oneline_summary
                        "v1:CT_본문 요약",          # summary
                        "앤",                       # pov_character (평문)
                        ["앤", "마릴라"],           # present_characters
                        ["다락방"],                 # present_locations
                        [{"order": 1, "event": "발견"}],
                        "v1:CT_노을 30분",         # time_progression
                        "충격",                     # tone (평문)
                        "v1:CT_침묵",              # cliffhanger
                        [],                         # foreshadow_planted
                        [],                         # foreshadow_paid_off
                        ["편지", "비밀"],          # keywords
                    ][i]
            class R:
                def fetchone(self):
                    return Row()
            return R()

    ctx = WriterContext(work_id=WORK_ID, writer_id=WRITER_ID)
    result = asyncio.run(ep_mod.summarize_episode(FakeSession(), ctx, episode_id=str(EPISODE_ID)))

    assert result["cached"] is True
    fake_llm.generate_json.assert_not_called()        # Haiku 미호출 보장

    # 복호화된 평문 노출
    assert result["oneline_summary"] == "앤이 일기 발견"
    assert result["summary"] == "본문 요약"
    assert result["cliffhanger"] == "침묵"
    assert result["time_progression"] == "노을 30분"
    # 평문 필드 그대로
    assert result["pov_character"] == "앤"
    assert result["tone"] == "충격"
    assert result["present_characters"] == ["앤", "마릴라"]


# ════════════════════════════════════════════════════════════════
# 6) search_episode_summaries — Option A 어형 변화 매칭
# ════════════════════════════════════════════════════════════════

def test_search_episode_summaries_option_a_substring(monkeypatch):
    """SQL 1차 필터 → batch 복호화 → Python substring 매칭. 어형 변화도 hit."""
    from app.mcp.tools import episode_summary as es_mod

    # SELECT 순서 (11 cols, sort_order 제거 후): ep.id, ep.title,
    #   oneline_summary, pov_character, tone, present_characters, cliffhanger, summary,
    #   present_locations, key_events, keywords
    fake_rows_db = [
        # 회차 1: 본문에 "발견했다" → "발견" 검색 시 hit (Option A 만 가능)
        ("ep-uuid-1", "v1:CT_1화", "v1:CT_앤이 발견했다", "앤", "충격",
         ["앤"], "v1:CT_침묵", "v1:CT_앤이 다락방에서 어머니의 일기를 발견했다.",
         ["다락방"], [{"order":1,"event":"발견"}], ["편지"]),
        # 회차 2: 무관
        ("ep-uuid-2", "v1:CT_2화", "v1:CT_평범한 일상", "앤", "평온",
         ["앤"], None, "v1:CT_앤이 학교에 갔다.",
         ["학교"], [{"order":1,"event":"등교"}], ["일상"]),
        # 회차 3: keywords 매칭
        ("ep-uuid-3", "v1:CT_3화", "v1:CT_새로운 만남", "마릴라", "긴장",
         ["마릴라"], None, "v1:CT_마릴라가 새 친구를 만났다.",
         ["거실"], [{"order":1,"event":"만남"}], ["우정", "비밀"]),
    ]

    class FakeResult:
        def fetchall(self):
            return fake_rows_db

    class FakeSession:
        async def execute(self, stmt, params=None):
            return FakeResult()

    async def fake_decrypt_rows(work_id, rows, fields):
        out = []
        for r in rows:
            new = dict(r)
            for f in fields:
                v = new.get(f)
                if isinstance(v, str) and v.startswith("v1:CT_"):
                    new[f] = v[len("v1:CT_"):]
            out.append(new)
        return out
    monkeypatch.setattr(es_mod, "decrypt_rows", fake_decrypt_rows)

    ctx = WriterContext(work_id=WORK_ID, writer_id=WRITER_ID)

    # 케이스 1: "발견" 검색 — 회차 1 의 "발견했다" 어형 변화 잡힘
    result1 = asyncio.run(es_mod.search_episode_summaries(
        FakeSession(), ctx, keyword="발견", scope="all", limit=10))
    ids = [r["id"] for r in result1]
    assert "ep-uuid-1" in ids, f"회차 1의 '발견했다' substring 매칭 실패. result={result1}"
    assert "ep-uuid-2" not in ids     # 무관 회차 제외

    # 케이스 2: "비밀" 검색 — keywords JSONB 평문 매칭
    result2 = asyncio.run(es_mod.search_episode_summaries(
        FakeSession(), ctx, keyword="비밀", scope="all", limit=10))
    ids2 = [r["id"] for r in result2]
    assert "ep-uuid-3" in ids2, f"회차 3의 keywords '비밀' 매칭 실패. result={result2}"

    # 케이스 3: "ㄱㄴㄷ존재안함" 검색 — 0건
    result3 = asyncio.run(es_mod.search_episode_summaries(
        FakeSession(), ctx, keyword="ㄱㄴㄷ존재안함", scope="all", limit=10))
    assert result3 == []

    # 반환 형식: summary 본문은 list 도구 노출 X
    for r in result1:
        assert "summary" not in r


def test_search_episode_summaries_empty_keyword(monkeypatch):
    """keyword 비어있으면 scope 필터만 적용된 결과 반환."""
    from app.mcp.tools import episode_summary as es_mod

    # SELECT 순서 (11 cols, sort_order 제거 후): ep.id, ep.title, ...
    fake_rows_db = [
        ("ep-uuid-1", "v1:CT_1화", "v1:CT_요약1", "앤", "충격", ["앤"], None, "v1:CT_본문1",
         ["다락방"], [], []),
        ("ep-uuid-2", "v1:CT_2화", "v1:CT_요약2", "앤", "평온", ["앤"], None, "v1:CT_본문2",
         ["학교"], [], []),
    ]

    class FakeResult:
        def fetchall(self): return fake_rows_db
    class FakeSession:
        async def execute(self, stmt, params=None): return FakeResult()

    async def fake_decrypt_rows(work_id, rows, fields):
        return [{**r, **{f: r[f][len('v1:CT_'):] if isinstance(r.get(f), str) and r[f].startswith('v1:CT_') else r.get(f) for f in fields}} for r in rows]
    monkeypatch.setattr(es_mod, "decrypt_rows", fake_decrypt_rows)

    ctx = WriterContext(work_id=WORK_ID, writer_id=WRITER_ID)
    result = asyncio.run(es_mod.search_episode_summaries(
        FakeSession(), ctx, keyword="", scope="character:앤", limit=10))
    assert len(result) == 2     # 둘 다 앤 등장


# ════════════════════════════════════════════════════════════════
# 7) find_relevant_episodes — DB only, 암호화 무관 sanity
# ════════════════════════════════════════════════════════════════

def test_find_relevant_episodes_db_only(monkeypatch):
    """find_relevant_episodes 는 embedding 컬럼 만 사용 — 평문/암호화 무관.

    1) 사전 진단 쿼리 (ref_chunks / other_chunks / prev_with_chunks) — chunk 존재 시
    2) 메인 유사도 쿼리 — top-k 결과
    """
    from app.mcp.tools import episode_search as esrch

    # 메인 쿼리 결과 (5 cols, sort_order 제거 후): (episode_id, title, max_sim, avg_sim, chunk_count)
    fake_main_rows = [
        ("ep-uuid-3", "3화 회상", 0.92, 0.85, 5),
        ("ep-uuid-1", "1화 시작", 0.81, 0.72, 4),
        ("ep-uuid-6", "v1:title_ciphertext", 0.78, 0.65, 6),    # 암호화된 title
    ]

    class DiagRow:
        """진단 쿼리 결과: ref_chunks=10, other_chunks=15, prev_with_chunks_id='ep-uuid-prev'"""
        def __getitem__(self, i): return [10, 15, "ep-uuid-prev"][i]

    class DiagResult:
        def fetchone(self): return DiagRow()

    class MainResult:
        def fetchall(self): return fake_main_rows

    class FakeSession:
        def __init__(self):
            self._call_count = 0
        async def execute(self, stmt, params=None):
            self._call_count += 1
            # 첫 호출은 진단, 그 다음은 메인 쿼리
            if self._call_count == 1:
                return DiagResult()
            return MainResult()

    # title batch 복호화 실패 시 placeholder fallback 검증 (DecryptResolverError 모킹)
    from app.services.decrypt_resolver import DecryptResolverError
    async def fake_decrypt_fail(work_id, rows, fields):
        raise DecryptResolverError("test")
    monkeypatch.setattr(esrch, "decrypt_rows", fake_decrypt_fail)

    ctx = WriterContext(work_id=WORK_ID, writer_id=WRITER_ID)
    result = asyncio.run(esrch.find_relevant_episodes(
        FakeSession(), ctx, reference_episode_id="ep-uuid-7", k=5))

    assert result["reference_episode_id"] == "ep-uuid-7"
    assert len(result["top"]) == 3
    assert result["top"][0]["max_sim"] == 0.92
    assert result["top"][0]["id"] == "ep-uuid-3"     # episode_id 노출 검증
    # 암호화된 title 은 placeholder (decrypt_rows 가 raise 한 fallback)
    assert result["top"][2]["title"].startswith("(제목 암호화")


def test_find_relevant_episodes_empty_reference_returns_diagnostic(monkeypatch):
    """기준 회차에 chunk 없음 → suggested_reference + 명확한 message."""
    from app.mcp.tools import episode_search as esrch

    class DiagRow:
        # ref_chunks=0 (비어있음), other_chunks=20, prev_with_chunks_id='ep-uuid-prev'
        def __getitem__(self, i): return [0, 20, "ep-uuid-prev"][i]
    class DiagResult:
        def fetchone(self): return DiagRow()
    class FakeSession:
        async def execute(self, stmt, params=None): return DiagResult()

    ctx = WriterContext(work_id=WORK_ID, writer_id=WRITER_ID)
    result = asyncio.run(esrch.find_relevant_episodes(
        FakeSession(), ctx, reference_episode_id="ep-uuid-target", k=3))

    assert result["top"] == []
    assert result["ref_chunks"] == 0
    assert result["suggested_reference_episode_id"] == "ep-uuid-prev"
    assert "본문이 비어있거나" in result["message"]
    assert "ep-uuid-prev" in result["message"]


def test_find_relevant_episodes_no_other_episodes(monkeypatch):
    """기준 회차는 chunk 있지만 다른 회차들 모두 비어있음 → 0건 + 명확한 사유."""
    from app.mcp.tools import episode_search as esrch

    class DiagRow:
        # ref_chunks=10, other_chunks=0
        def __getitem__(self, i): return [10, 0, None][i]
    class DiagResult:
        def fetchone(self): return DiagRow()
    class FakeSession:
        async def execute(self, stmt, params=None): return DiagResult()

    ctx = WriterContext(work_id=WORK_ID, writer_id=WRITER_ID)
    result = asyncio.run(esrch.find_relevant_episodes(
        FakeSession(), ctx, reference_episode_id="ep-uuid-target", k=3))

    assert result["top"] == []
    assert result["other_chunks"] == 0
    assert "비교 대상 부재" in result["message"]
