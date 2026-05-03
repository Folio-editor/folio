"""RAG 컨텍스트 조립 엔진.

입력: payload(클라이언트 평문 컨텍스트), work_id, writer_id, storyline, current_episode_num
출력: 28,000 토큰 이하의 컨텍스트 문자열 (LLM 프롬프트에 삽입)

수집 소스 및 토큰 예산:
- 작품 메타데이터 (~500)            ← payload.work_meta
- 설정집(인물/세계관) (~2,000~5,000)  ← payload.characters / payload.world_notes
- 미회수 떡밥 (~500~1,000)          ← payload.foreshadows (review 모드만)
- 최근 5~10화 요약 (~2,000~4,000)
- 최근 1~2화 원문 샘플 (~10,000~15,000) ← payload.recent_episodes
- 관련 과거 화 벡터 검색 (~1,500~3,000) ← episode_chunk DB SELECT (평문 예외)
- 작가 스토리라인 (~500~1,000)        ← payload.plots

PR5 — Plan C 옵션 1 보안 모델: 클라이언트가 KEK + work_key로 평문화한 컨텍스트를
페이로드로 동봉하면, AI 서버는 더 이상 work/character/world_note/plot/foreshadow/
character_note/character_custom_field/episode 의 v1: 암호문 컬럼을 SELECT하지 않는다.
vector_search(episode_chunk + embedding)와 timeline은 평문 예외 영역이라 DB 직접 SELECT 유지.
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session
from app.schemas.ai_context_payload import (
    AiContextPayload,
    CharacterPayload,
    ForeshadowPayload,
    PlotPayload,
    RecentEpisodePayload,
    WorkMetaPayload,
    WorldNotePayload,
)
from app.services.chunker import count_tokens
from app.services.providers import get_embedder
from app.services.settings_loader import load_settings
from app.services.text_extractor import extract_plain_text
from app.services.timeline_extractor import build_timeline

TOKEN_BUDGET = 40_000

PRIORITY_1_LABEL = "recent_raw"


RECENT_RAW_LIMIT = {
    "draft": 4,           # 하위 호환 기본값
    "draft_sonnet": 2,
    "draft_opus": 4,
    "review": 1,
}
VECTOR_SEARCH_LIMIT = {
    "draft": 15,          # 하위 호환 기본값
    "draft_sonnet": 10,
    "draft_opus": 15,
    "review": 5,
}
# 복선(foreshadows)을 컨텍스트에 포함할지 여부 — 초안에서는 제거(작가 주도 영역)
FORESHADOWS_MODES = {"review"}
# 회차별 시간 표지(타임라인) 메타데이터를 prompt에 주입할지 — 검수의 시간 충돌 검출용
TIMELINE_MODES = {"review"}

# 캐릭터 서브노트(외형/성격/MBTI 등) 본문 문자 제한
SUBNOTE_TRUNC = 150
# 세계관 / 플롯 본문 제한
WORLD_NOTE_TRUNC = 300
PLOT_TRUNC = 300
# vector 검색: 같은 화에서 뽑을 수 있는 청크 최대 개수
MAX_CHUNKS_PER_EPISODE = 3

_MULTI_NEWLINE_RE = re.compile(r"\n{3,}")
_MULTI_SPACE_RE = re.compile(r"[ \t　]{2,}")


def _clean(text: str | None) -> str:
    """plain-text에서 연속 공백·빈 줄을 줄여 토큰 낭비를 제거."""
    if not text:
        return ""
    text = _MULTI_NEWLINE_RE.sub("\n\n", text)
    text = _MULTI_SPACE_RE.sub(" ", text)
    return text.strip()


def _plain(content: Any) -> str:
    return _clean(extract_plain_text(content))


# 검수 모드에서는 등장인물 카드가 트리밍되면 부차 인물(예: 김우식, 노정희) 정보가
# 사라져 같은 종류 함정의 검출 일관성이 깨진다. 따라서 review 모드에서는 characters를
# 트리밍 대상에서 제외해 결정론적으로 전부 포함시킨다.
PROTECTED_KEYS_BY_MODE: dict[str, set[str]] = {
    # 검수 모드: 등장인물·세계관 노트 둘 다 트리밍하지 않는다.
    # - characters: 부차 인물(예: 김우식 직업) 정보가 사라지면 검출 일관성이 깨진다.
    # - world_notes: 채팅 코러스 닉네임/플랫폼 룰 등 보조 정보가 사라지면 검출 사각지대 생김.
    "review": {"characters", "world_notes"},
}


async def assemble_context(
    payload: AiContextPayload,
    work_id: str,
    writer_id: str,
    storyline: str,
    current_episode_num: int,
    mode: str = "draft",
) -> str:
    recent_raw_limit = RECENT_RAW_LIMIT.get(mode, RECENT_RAW_LIMIT["draft"])
    vector_search_limit = VECTOR_SEARCH_LIMIT.get(mode, VECTOR_SEARCH_LIMIT["draft"])
    include_foreshadows = mode in FORESHADOWS_MODES

    async with async_session() as session:
        sections: dict[str, str] = {}
        settings_bundle = load_settings(payload)

        sections["work_meta"] = _format_work_meta(payload.work_meta)
        if settings_bundle["mode"] == "full":
            sections["characters"] = _format_characters(payload.characters)
            sections["world_notes"] = _format_world_notes(payload.world_notes)
        else:
            sections["characters"] = settings_bundle["characters_text"]
            sections["world_notes"] = settings_bundle["world_notes_text"]
        if include_foreshadows:
            sections["foreshadows"] = _format_foreshadows(payload.foreshadows)
        if mode in TIMELINE_MODES:
            # timeline은 episode.content에 의존하지만 v1: 암호문이면 markers 매칭이
            # 빈 결과로 fallback된다. 페이로드로 옮기면 검수 대상 이전 모든 회차를
            # 보내야 해서 페이로드가 폭발적으로 커지므로 PR5 범위에서는 DB 직접 유지.
            sections["timeline"] = await build_timeline(
                session, work_id, current_episode_num
            )
        sections["storyline"] = _format_storyline(payload.plots)
        recent_raw_text, recent_raw_orders = _format_recent_raw(
            payload.recent_episodes, limit=recent_raw_limit
        )
        sections["recent_raw"] = recent_raw_text
        sections["vector_search"] = await _fetch_vector_similar(
            session,
            work_id,
            writer_id,
            storyline,
            current_episode_num=current_episode_num,
            excluded_sort_orders=recent_raw_orders,
            limit=vector_search_limit,
        )

    protected = PROTECTED_KEYS_BY_MODE.get(mode, set())
    return _trim_to_budget(sections, protected_keys=protected)


def _format_work_meta(meta: WorkMetaPayload) -> str:
    parts: list[str] = []
    if meta.title:
        parts.append(f"제목: {meta.title}")
    if meta.author_name:
        parts.append(f"작가명: {meta.author_name}")
    if meta.description:
        parts.append(f"작품 설명: {meta.description}")
    if meta.status:
        parts.append(f"상태: {meta.status}")
    return "\n".join(parts)


def _format_characters(chars: list[CharacterPayload]) -> str:
    if not chars:
        return ""

    lines: list[str] = []
    # character 테이블에 주인공 플래그가 없으므로 sort_order 최상위(=첫 번째) 인물을
    # 주인공으로 간주해 명시 라벨을 붙인다. 프롬프트의 "중심 인물" 지시와 일치시킨다.
    for idx, char in enumerate(chars):
        role_label = "주인공" if idx == 0 else "부캐릭터"
        name = char.name or f"인물{idx + 1}"
        # 이름 라인 — 성별·나이를 헤더에 묶어 LLM이 핵심 속성을 한눈에 파악하게 한다.
        # 검수 시 "노정희 28세 → 본문에서 스무 살" 같은 속성 모순을 일관되게 잡기 위함.
        # 추가로 [C번호] 라벨을 붙여 시스템 프롬프트의 "캐릭터 룰 체크리스트"가
        # 각 인물을 한 명씩 차례로 본문과 1:1 대조하도록 강제한다 (attention 분산 완화).
        attrs: list[str] = []
        if char.gender:
            attrs.append(f"성별 {char.gender}")
        if char.age:
            attrs.append(f"나이 {char.age}")
        head = f"- [C{idx + 1}] [{role_label}] {name}"
        if attrs:
            head += f" ({', '.join(attrs)})"
        parts = [head]
        for note in char.notes:
            content = note.content
            if not content:
                continue
            label = note.title or note.kind or ""
            text = _plain(content)[:SUBNOTE_TRUNC]
            if text:
                parts.append(f"{label}:{text}")
        # custom_fields도 본문 검수에 직접적으로 쓰이는 정보(직업·소지품 위치 등)라
        # 인물 헤더 아래 함께 기재한다.
        for cf in char.custom_fields:
            if not cf.field_name or not cf.field_value:
                continue
            value = _plain(cf.field_value)[:SUBNOTE_TRUNC]
            if value:
                parts.append(f"{cf.field_name}:{value}")
        lines.append(" / ".join(parts))
    return "\n".join(lines)


def _format_world_notes(notes: list[WorldNotePayload]) -> str:
    if not notes:
        return ""
    # 각 항목에 번호를 매겨 체크리스트 식 검수가 가능하게 한다.
    # 검수 LLM은 시스템 프롬프트의 "세계관 룰 체크리스트" 지시에 따라
    # 각 번호 항목을 본문과 1:1로 점검하게 된다 (attention 분산 완화).
    lines: list[str] = []
    idx = 0
    for note in notes:
        if not note.name:
            continue
        idx += 1
        content = _plain(note.content)[:WORLD_NOTE_TRUNC] if note.content else ""
        lines.append(f"[W{idx}] {note.name}: {content}")
    return "\n".join(lines)


def _format_foreshadows(foreshadows: list[ForeshadowPayload]) -> str:
    if not foreshadows:
        return ""
    lines: list[str] = []
    for f in foreshadows:
        if not f.title:
            continue
        status = f.status or "unknown"
        importance = f.importance or ""
        content = _plain(f.content)[:200] if f.content else ""
        lines.append(f"- [{status}] {f.title} (중요도:{importance}) {content}")
    return "\n".join(lines)


def _format_storyline(plots: list[PlotPayload]) -> str:
    """작품 전체 플롯(plot)만 반환한다.

    이번 회차 방향(storyline)은 drafts.py의 user prompt에서 별도 지시로 전달되므로
    여기서는 중복 삽입하지 않는다.
    """
    if not plots:
        return ""
    lines: list[str] = []
    for p in plots:
        if not p.title:
            continue
        content = _plain(p.content)[:PLOT_TRUNC] if p.content else ""
        lines.append(f"- {p.title}: {content}")
    return "\n".join(lines)


def _format_recent_raw(
    episodes: list[RecentEpisodePayload], limit: int
) -> tuple[str, list[int]]:
    """클라이언트가 평문화해 보낸 회차들을 라벨링해 반환.

    페이로드는 과거→최근 순으로 보내진다(useAiContextPayload).
    server-side에서 mode별 limit으로 끝(=최신)에서부터 잘라 사용한다.
    vector_search가 이미 원문으로 들어간 화의 청크를 중복 반환하지 않도록
    포함된 sort_order 리스트도 함께 돌려준다.
    """
    if not episodes:
        return "", []
    # 평문이 누락된 회차(복호화 실패 등)는 제외 — content가 None이면 스킵.
    plain_only = [e for e in episodes if e.content]
    if not plain_only:
        return "", []
    # 끝(최신)에서 limit개만 사용.
    selected = plain_only[-limit:] if limit > 0 else []
    if not selected:
        return "", []
    lines: list[str] = []
    included_orders: list[int] = []
    total = len(selected)
    for idx, ep in enumerate(selected):
        steps_back = total - idx  # 1 = 직전 화, 2 = 2화 전, ...
        rel_label = "직전 화" if steps_back == 1 else f"{steps_back}화 전"
        title = ep.title or ""
        content = _plain(ep.content)
        lines.append(f"=== {rel_label}: {title} ===\n{content}")
        included_orders.append(int(ep.sort_order))
    return "\n\n".join(lines), included_orders


async def _fetch_vector_similar(
    session: AsyncSession,
    work_id: str,
    writer_id: str,
    storyline: str,
    *,
    current_episode_num: int | None = None,
    excluded_sort_orders: list[int] | None = None,
    limit: int = 15,
) -> str:
    if not storyline:
        return ""
    embedder = get_embedder()
    vecs = await embedder.embed_batch([storyline])
    if not vecs:
        return ""
    vec = vecs[0]
    vec_str = "[" + ",".join(str(v) for v in vec) + "]"

    # current_episode_num / excluded_sort_orders가 주어지면 episode 테이블을
    # JOIN해서 (a) 현재 이후 화, (b) 이미 recent_raw로 풀 삽입된 화의 청크를
    # 검색 대상에서 배제한다.
    # 같은 화의 인접 청크가 TOP-N에 몰려드는 것을 방지하기 위해 DB에서는
    # `limit`의 N배까지 끌어오고, Python에서 화당 MAX_CHUNKS_PER_EPISODE로
    # 후처리한다.
    oversample = limit * MAX_CHUNKS_PER_EPISODE
    params: dict[str, Any] = {
        "vec": vec_str,
        "wid": uuid.UUID(work_id),
        "wr": uuid.UUID(writer_id),
        "lim": oversample,
    }
    extra_filters: list[str] = []
    if current_episode_num is not None:
        extra_filters.append("e.sort_order < :ep_num")
        params["ep_num"] = current_episode_num
    if excluded_sort_orders:
        extra_filters.append("e.sort_order <> ALL(:excluded)")
        params["excluded"] = list(excluded_sort_orders)
    extra_where = (" AND " + " AND ".join(extra_filters)) if extra_filters else ""

    sql = (
        "SELECT ec.content, e.sort_order, "
        "       1 - (ec.embedding <=> cast(:vec AS vector)) AS similarity "
        "FROM episode_chunk ec "
        "JOIN episode e ON e.id = ec.episode_id "
        "WHERE ec.work_id = :wid AND ec.writer_id = :wr"
        f"{extra_where} "
        "ORDER BY ec.embedding <=> cast(:vec AS vector) "
        "LIMIT :lim"
    )
    r = await session.execute(sa_text(sql), params)
    rows = r.fetchall()
    if not rows:
        return ""

    per_ep: dict[int, int] = {}
    picked: list[str] = []
    for row in rows:
        content, sort_order = row[0], int(row[1])
        if per_ep.get(sort_order, 0) >= MAX_CHUNKS_PER_EPISODE:
            continue
        picked.append(_clean(content))
        per_ep[sort_order] = per_ep.get(sort_order, 0) + 1
        if len(picked) >= limit:
            break
    return "\n---\n".join(picked)


def _trim_to_budget(
    sections: dict[str, str],
    protected_keys: set[str] | None = None,
) -> str:
    """토큰 예산 내로 트리밍. 우선순위: 최근 원문 > 최근 요약 > 나머지.

    protected_keys: 모드별로 트리밍하지 않을 섹션. (예: review 모드의 'characters')
    """
    protected = protected_keys or set()

    template = [
        ("work_meta", "## 작품 정보"),
        ("characters", "## 등장인물"),
        ("world_notes", "## 세계관 설정"),
        ("foreshadows", "## 복선/떡밥"),
        ("timeline", "## 회차별 시간 흐름"),
        ("storyline", "## 스토리라인"),
        ("recent_raw", "## 최근 회차 원문"),
        ("vector_search", "## 관련 과거 장면"),
    ]

    trimmable_keys = [
        k for k in ["vector_search", "foreshadows", "world_notes", "characters"]
        if k not in protected
    ]

    blocks = {}
    for key, header in template:
        content = sections.get(key, "")
        if content:
            blocks[key] = f"{header}\n{content}"

    total = sum(count_tokens(b) for b in blocks.values())

    if total <= TOKEN_BUDGET:
        return "\n\n".join(blocks[k] for k, _ in template if k in blocks)

    for trim_key in reversed(trimmable_keys):
        if total <= TOKEN_BUDGET:
            break
        if trim_key in blocks:
            removed = count_tokens(blocks[trim_key])
            half_content = sections.get(trim_key, "")
            half_lines = half_content.split("\n")
            half = "\n".join(half_lines[: len(half_lines) // 2])
            if half:
                header = next(h for k, h in template if k == trim_key)
                blocks[trim_key] = f"{header}\n{half}"
                total = total - removed + count_tokens(blocks[trim_key])
            else:
                del blocks[trim_key]
                total -= removed

    if total > TOKEN_BUDGET:
        for trim_key in reversed(trimmable_keys):
            if total <= TOKEN_BUDGET:
                break
            if trim_key in blocks:
                total -= count_tokens(blocks[trim_key])
                del blocks[trim_key]

    return "\n\n".join(blocks[k] for k, _ in template if k in blocks)
