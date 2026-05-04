"""PR5 — AiContextPayload 기반 RAG/설정집 포맷터 단위 테스트.

DB 의존성을 거치지 않는 순수 포맷팅 함수만 검증한다. assemble_context 통합은
test_drafts.py / test_reviews.py에서 검증된다.
"""

from __future__ import annotations

from app.schemas.ai_context_payload import (
    AiContextPayload,
    CharacterCustomFieldPayload,
    CharacterNotePayload,
    CharacterPayload,
    ForeshadowPayload,
    PlotPayload,
    RecentEpisodePayload,
    WorkMetaPayload,
    WorldNotePayload,
)
from app.services.rag import (
    _format_characters,
    _format_foreshadows,
    _format_recent_raw,
    _format_storyline,
    _format_work_meta,
    _format_world_notes,
)
from app.services.settings_loader import load_settings


# ---------- _format_work_meta ----------

def test_format_work_meta_full_fields():
    meta = WorkMetaPayload(
        title="잘못된 방송",
        author_name="홍길동",
        description="현대 한국 인터넷 방송 드라마",
        status="연재중",
    )
    out = _format_work_meta(meta)
    assert "제목: 잘못된 방송" in out
    assert "작가명: 홍길동" in out
    assert "작품 설명: 현대 한국 인터넷 방송 드라마" in out
    assert "상태: 연재중" in out


def test_format_work_meta_empty_returns_empty_string():
    assert _format_work_meta(WorkMetaPayload()) == ""


def test_format_work_meta_partial_fields_only_includes_set():
    meta = WorkMetaPayload(title="제목만", description=None)
    out = _format_work_meta(meta)
    assert out == "제목: 제목만"


# ---------- _format_characters ----------

def test_format_characters_marks_first_as_protagonist():
    chars = [
        CharacterPayload(id="c1", name="박지훈", gender="남", age="29"),
        CharacterPayload(id="c2", name="노정희", gender="여", age="28"),
    ]
    out = _format_characters(chars)
    # 첫 번째 인물은 주인공, 그 이후는 부캐릭터 라벨이 붙어야 한다.
    assert "[C1] [주인공] 박지훈" in out
    assert "[C2] [부캐릭터] 노정희" in out
    assert "성별 남" in out
    assert "나이 29" in out


def test_format_characters_includes_notes_and_custom_fields():
    chars = [
        CharacterPayload(
            id="c1",
            name="박지훈",
            notes=[
                CharacterNotePayload(kind="personality", title="성격", content="무기력함"),
            ],
            custom_fields=[
                CharacterCustomFieldPayload(field_name="직업", field_value="스트리머"),
            ],
        ),
    ]
    out = _format_characters(chars)
    assert "성격:무기력함" in out
    assert "직업:스트리머" in out


def test_format_characters_skips_blank_custom_field_value():
    chars = [
        CharacterPayload(
            id="c1",
            name="박지훈",
            custom_fields=[
                CharacterCustomFieldPayload(field_name="직업", field_value=None),
                CharacterCustomFieldPayload(field_name=None, field_value="고아"),
            ],
        ),
    ]
    out = _format_characters(chars)
    assert "직업" not in out
    assert "고아" not in out


def test_format_characters_empty_returns_empty_string():
    assert _format_characters([]) == ""


# ---------- _format_world_notes ----------

def test_format_world_notes_numbers_each_item():
    notes = [
        WorldNotePayload(name="오션", content="방송 플랫폼"),
        WorldNotePayload(name="물방울", content="후원 단위"),
    ]
    out = _format_world_notes(notes)
    assert "[W1] 오션: 방송 플랫폼" in out
    assert "[W2] 물방울: 후원 단위" in out


def test_format_world_notes_skips_unnamed():
    notes = [
        WorldNotePayload(name=None, content="이름 없는 노트"),
        WorldNotePayload(name="채팅 코러스", content="시청자 닉네임"),
    ]
    out = _format_world_notes(notes)
    # name 누락 노트는 인덱스를 차지해서는 안 된다 — 다음 항목이 [W1]을 받아야 함.
    assert "[W1] 채팅 코러스" in out
    assert "[W2]" not in out


def test_format_world_notes_empty_returns_empty_string():
    assert _format_world_notes([]) == ""


# ---------- _format_foreshadows ----------

def test_format_foreshadows_includes_status_and_importance():
    foreshadows = [
        ForeshadowPayload(
            title="박지훈의 안경",
            status="planted",
            importance="high",
            content="시야의 비밀과 연결",
        ),
    ]
    out = _format_foreshadows(foreshadows)
    assert "[planted]" in out
    assert "박지훈의 안경" in out
    assert "중요도:high" in out
    assert "시야의 비밀과 연결" in out


def test_format_foreshadows_uses_unknown_for_missing_status():
    foreshadows = [ForeshadowPayload(title="제목만", status=None)]
    out = _format_foreshadows(foreshadows)
    assert "[unknown]" in out


def test_format_foreshadows_skips_titleless():
    foreshadows = [
        ForeshadowPayload(title=None, content="내용만 있음"),
        ForeshadowPayload(title="제목 있음"),
    ]
    out = _format_foreshadows(foreshadows)
    assert "내용만 있음" not in out
    assert "제목 있음" in out


# ---------- _format_storyline ----------

def test_format_storyline_lists_plots():
    plots = [
        PlotPayload(title="1부: 도입", content="박지훈이 방송을 시작한다"),
        PlotPayload(title="2부: 전개", content="시청자가 늘어난다"),
    ]
    out = _format_storyline(plots)
    assert "- 1부: 도입: 박지훈이 방송을 시작한다" in out
    assert "- 2부: 전개: 시청자가 늘어난다" in out


def test_format_storyline_empty_returns_empty_string():
    assert _format_storyline([]) == ""


# ---------- _format_recent_raw ----------

def test_format_recent_raw_labels_relative_distance():
    episodes = [
        RecentEpisodePayload(sort_order=1, title="1화", content="첫 화 본문"),
        RecentEpisodePayload(sort_order=2, title="2화", content="두 번째 본문"),
    ]
    text, orders = _format_recent_raw(episodes, limit=4)
    # 페이로드는 과거→최근 순. 마지막 항목이 직전 화.
    assert "직전 화: 2화" in text
    assert "2화 전: 1화" in text
    assert orders == [1, 2]


def test_format_recent_raw_truncates_to_limit_from_latest():
    episodes = [
        RecentEpisodePayload(sort_order=1, title="A", content="aa"),
        RecentEpisodePayload(sort_order=2, title="B", content="bb"),
        RecentEpisodePayload(sort_order=3, title="C", content="cc"),
        RecentEpisodePayload(sort_order=4, title="D", content="dd"),
    ]
    text, orders = _format_recent_raw(episodes, limit=2)
    # limit=2 일 때 끝에서 두 개(=가장 최근 2개)만 사용해야 한다.
    assert orders == [3, 4]
    assert "A" not in text
    assert "B" not in text
    assert "직전 화: D" in text


def test_format_recent_raw_skips_missing_content():
    episodes = [
        RecentEpisodePayload(sort_order=1, title="1화", content=None),
        RecentEpisodePayload(sort_order=2, title="2화", content="본문 있음"),
    ]
    text, orders = _format_recent_raw(episodes, limit=4)
    assert orders == [2]
    assert "직전 화: 2화" in text


def test_format_recent_raw_empty_returns_empty():
    text, orders = _format_recent_raw([], limit=4)
    assert text == ""
    assert orders == []


def test_format_recent_raw_zero_limit_returns_empty():
    episodes = [RecentEpisodePayload(sort_order=1, title="1화", content="본문")]
    text, orders = _format_recent_raw(episodes, limit=0)
    assert text == ""
    assert orders == []


# ---------- load_settings ----------

def test_load_settings_full_mode_for_small_payload():
    payload = AiContextPayload(
        characters=[
            CharacterPayload(
                id="c1",
                name="박지훈",
                gender="남",
                age="29",
                notes=[
                    CharacterNotePayload(kind="personality", content="무기력하지만 예민함"),
                ],
            ),
        ],
        world_notes=[
            WorldNotePayload(name="오션", content="방송 플랫폼"),
        ],
    )
    bundle = load_settings(payload)
    assert bundle["mode"] == "full"
    assert bundle["count"] == 2
    assert "이름: 박지훈" in bundle["characters_text"]
    assert "성격: 무기력하지만 예민함" in bundle["characters_text"]
    assert "이름: 오션" in bundle["world_notes_text"]
    assert "상세: 방송 플랫폼" in bundle["world_notes_text"]


def test_load_settings_compact_mode_when_above_threshold():
    chars = [CharacterPayload(id=f"c{i}", name=f"인물{i}", age="20") for i in range(25)]
    notes = [WorldNotePayload(name=f"세계{i}", content="설명") for i in range(20)]
    payload = AiContextPayload(characters=chars, world_notes=notes)
    bundle = load_settings(payload)
    assert bundle["mode"] == "compact"
    assert bundle["count"] == 45
    # compact 형식은 하이픈 + 슬래시 구분자.
    assert "- 인물0 / 나이:20" in bundle["characters_text"]
    assert "- 세계0: 설명" in bundle["world_notes_text"]


def test_load_settings_skips_unnamed_world_notes_in_count():
    payload = AiContextPayload(
        characters=[CharacterPayload(id="c1", name="A")],
        world_notes=[
            WorldNotePayload(name=None, content="이름 없음"),
            WorldNotePayload(name="유효", content="설명"),
        ],
    )
    bundle = load_settings(payload)
    # name=None 노트는 카운트·출력에서 제외된다.
    assert bundle["count"] == 2
    assert "이름 없음" not in bundle["world_notes_text"]
    assert "유효" in bundle["world_notes_text"]


def test_load_settings_empty_payload_returns_placeholders():
    bundle = load_settings(AiContextPayload())
    assert bundle["mode"] == "full"
    assert bundle["count"] == 0
    assert bundle["characters_text"] == "(없음)"
    assert bundle["world_notes_text"] == "(없음)"
