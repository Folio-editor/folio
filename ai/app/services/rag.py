"""RAG 컨텍스트 조립 엔진.

입력: work_id, writer_id, storyline, current_episode_num
출력: 28,000 토큰 이하의 컨텍스트 문자열 (LLM 프롬프트에 삽입)

수집 소스 및 토큰 예산:
- 작품 메타데이터 (~500)
- 설정집 벡터 검색 (~2,000~5,000)
- 미회수 떡밥 (~500~1,000)
- 최근 5~10화 요약 (~2,000~4,000)
- 최근 1~2화 원문 샘플 (~10,000~15,000)
- 관련 과거 화 벡터 검색 (~1,500~3,000)
- 작가 스토리라인 (~500~1,000)
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session
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
        sections = {}
        settings_bundle = await load_settings(session, work_id)

        sections["work_meta"] = await _fetch_work_meta(session, work_id)
        if settings_bundle["mode"] == "full":
            sections["characters"] = await _fetch_characters(session, work_id)
            sections["world_notes"] = await _fetch_world_notes(session, work_id)
        else:
            sections["characters"] = settings_bundle["characters_text"]
            sections["world_notes"] = settings_bundle["world_notes_text"]
        if include_foreshadows:
            sections["foreshadows"] = await _fetch_foreshadows(session, work_id)
        if mode in TIMELINE_MODES:
            sections["timeline"] = await build_timeline(
                session, work_id, current_episode_num
            )
        sections["storyline"] = await _fetch_storyline(session, work_id)
        recent_raw_text, recent_raw_orders = await _fetch_recent_raw(
            session, work_id, current_episode_num, limit=recent_raw_limit
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


async def _fetch_work_meta(session: AsyncSession, work_id: str) -> str:
    r = await session.execute(
        sa_text(
            "SELECT title, author_name, description, status "
            "FROM work WHERE id = :wid"
        ),
        {"wid": uuid.UUID(work_id)},
    )
    row = r.fetchone()
    if not row:
        return ""
    # Plan C PR2 — title/author_name/description은 v1: 접두사면 암호문이라 평문을 알 수 없다.
    # 후속 PR5에서 클라이언트가 복호화한 메타를 payload로 전달하기 전까지는 해당 필드를 생략.
    title = row[0] if not _is_ciphertext(row[0]) else None
    author_name = row[1] if not _is_ciphertext(row[1]) else None
    description = row[2] if not _is_ciphertext(row[2]) else None
    parts: list[str] = []
    if title:
        parts.append(f"제목: {title}")
    if author_name:
        parts.append(f"작가명: {author_name}")
    if description:
        parts.append(f"작품 설명: {description}")
    if row[3]:
        parts.append(f"상태: {row[3]}")
    return "\n".join(parts)


async def _fetch_characters(session: AsyncSession, work_id: str) -> str:
    wid = uuid.UUID(work_id)
    r = await session.execute(
        sa_text(
            "SELECT id, name, gender, age "
            "FROM character WHERE work_id = :wid ORDER BY sort_order"
        ),
        {"wid": wid},
    )
    chars = r.fetchall()
    if not chars:
        return ""

    # character_note에서 성격/외형 등 서브노트 조회
    nr = await session.execute(
        sa_text(
            "SELECT cn.character_id, cn.kind, cn.title, cn.content "
            "FROM character_note cn "
            "JOIN character c ON c.id = cn.character_id "
            "WHERE c.work_id = :wid "
            "ORDER BY cn.sort_order"
        ),
        {"wid": wid},
    )
    notes = nr.fetchall()
    notes_by_char: dict[uuid.UUID, list[tuple]] = {}
    for note in notes:
        cid = note[0] if isinstance(note[0], uuid.UUID) else uuid.UUID(str(note[0]))
        notes_by_char.setdefault(cid, []).append(note)

    lines = []
    # character 테이블에 주인공 플래그가 없으므로 sort_order 최상위(=첫 번째) 인물을
    # 주인공으로 간주해 명시 라벨을 붙인다. 프롬프트의 "중심 인물" 지시와 일치시킨다.
    for idx, char in enumerate(chars):
        char_id = char[0] if isinstance(char[0], uuid.UUID) else uuid.UUID(str(char[0]))
        role_label = "주인공" if idx == 0 else "부캐릭터"
        # Plan C PR3 — name/age는 v1: 접두사면 암호문이라 평문을 알 수 없다.
        # 이름이 암호문이면 익명화 라벨로 대체하고, 나이가 암호문이면 생략.
        name = char[1] if not _is_ciphertext(char[1]) else f"인물{idx + 1}"
        gender = char[2]
        age = char[3] if not _is_ciphertext(char[3]) else None
        # 이름 라인 — 성별·나이를 헤더에 묶어 LLM이 핵심 속성을 한눈에 파악하게 한다.
        # 검수 시 "노정희 28세 → 본문에서 스무 살" 같은 속성 모순을 일관되게 잡기 위함.
        # 추가로 [C번호] 라벨을 붙여 시스템 프롬프트의 "캐릭터 룰 체크리스트"가
        # 각 인물을 한 명씩 차례로 본문과 1:1 대조하도록 강제한다 (attention 분산 완화).
        attrs: list[str] = []
        if gender:
            attrs.append(f"성별 {gender}")
        if age:
            attrs.append(f"나이 {age}")
        head = f"- [C{idx + 1}] [{role_label}] {name}"
        if attrs:
            head += f" ({', '.join(attrs)})"
        parts = [head]
        char_notes = notes_by_char.get(char_id, [])
        for note in char_notes:
            # title/content가 v1: 접두사면 암호문 — 해당 노트는 컨텍스트에서 제외.
            title_raw = note[2]
            content = note[3]
            if not content or _is_ciphertext(content):
                continue
            label = (title_raw if not _is_ciphertext(title_raw) else None) or note[1] or ""
            text = _plain(content)[:SUBNOTE_TRUNC]
            if text:
                parts.append(f"{label}:{text}")
        lines.append(" / ".join(parts))
    return "\n".join(lines)


async def _fetch_world_notes(session: AsyncSession, work_id: str) -> str:
    r = await session.execute(
        sa_text(
            "SELECT name, content FROM world_note "
            "WHERE work_id = :wid ORDER BY sort_order"
        ),
        {"wid": uuid.UUID(work_id)},
    )
    rows = r.fetchall()
    if not rows:
        return ""
    # 각 항목에 번호를 매겨 체크리스트 식 검수가 가능하게 한다.
    # 검수 LLM은 시스템 프롬프트의 "세계관 룰 체크리스트" 지시에 따라
    # 각 번호 항목을 본문과 1:1로 점검하게 된다 (attention 분산 완화).
    # Plan C v1 암호문(v1: 접두사)은 AI 서버가 복호화 키를 보유하지 않으므로
    # 컨텍스트에서 제외한다 (name 또는 content가 암호문이면 row 전체 스킵).
    lines = []
    idx = 0
    for row in rows:
        if _is_ciphertext(row[0]) or _is_ciphertext(row[1]):
            continue
        idx += 1
        content = _plain(row[1])[:WORLD_NOTE_TRUNC] if row[1] else ""
        lines.append(f"[W{idx}] {row[0]}: {content}")
    return "\n".join(lines)


async def _fetch_foreshadows(session: AsyncSession, work_id: str) -> str:
    r = await session.execute(
        sa_text(
            "SELECT title, status, importance, content "
            "FROM foreshadow WHERE work_id = :wid ORDER BY sort_order"
        ),
        {"wid": uuid.UUID(work_id)},
    )
    rows = r.fetchall()
    if not rows:
        return ""
    # title/content 중 하나라도 v1: 암호문이면 row 스킵.
    # status/importance는 운영 메타데이터(평문)라 필터 대상이 아님.
    lines = []
    for row in rows:
        if _is_ciphertext(row[0]) or _is_ciphertext(row[3]):
            continue
        status = row[1] or "unknown"
        importance = row[2] or ""
        content = _plain(row[3])[:200] if row[3] else ""
        lines.append(f"- [{status}] {row[0]} (중요도:{importance}) {content}")
    return "\n".join(lines)


async def _fetch_storyline(session: AsyncSession, work_id: str) -> str:
    """작품 전체 플롯(plot)만 반환한다.

    이번 회차 방향(storyline)은 drafts.py의 user prompt에서 별도 지시로 전달되므로
    여기서는 중복 삽입하지 않는다.
    """
    r = await session.execute(
        sa_text(
            "SELECT title, content FROM plot "
            "WHERE work_id = :wid ORDER BY sort_order"
        ),
        {"wid": uuid.UUID(work_id)},
    )
    rows = r.fetchall()
    if not rows:
        return ""
    # title 또는 content가 v1: 암호문이면 컨텍스트에서 제외.
    lines: list[str] = []
    for row in rows:
        if _is_ciphertext(row[0]) or _is_ciphertext(row[1]):
            continue
        content = _plain(row[1])[:PLOT_TRUNC] if row[1] else ""
        lines.append(f"- {row[0]}: {content}")
    return "\n".join(lines)


async def _fetch_recent_summaries(
    session: AsyncSession, work_id: str, current_episode_num: int
) -> str:
    return ""


async def _fetch_recent_raw(
    session: AsyncSession, work_id: str, current_episode_num: int, limit: int = 4
) -> tuple[str, list[int]]:
    """최근 화 원문을 반환하고, 포함된 sort_order 리스트도 함께 돌려준다.

    vector 검색이 이미 원문으로 들어간 화의 청크를 중복 반환하지 않도록
    exclusion 용도로 사용된다.
    """
    r = await session.execute(
        sa_text(
            "SELECT sort_order, title, content FROM episode "
            "WHERE work_id = :wid AND sort_order < :ep_num "
            "ORDER BY sort_order DESC LIMIT :lim"
        ),
        {"wid": uuid.UUID(work_id), "ep_num": current_episode_num, "lim": limit},
    )
    rows = r.fetchall()
    if not rows:
        return "", []
    # Plan C 옵션 1 보안 모델: episode.content가 "v1:" 접두사로 시작하면
    # 클라이언트가 KEK으로 암호화한 본문이라 AI 서버는 평문을 알 수 없다.
    # 컨텍스트에 암호문을 넣으면 LLM이 "암호화된 원고라 못 읽겠다"고 답하므로
    # 해당 회차는 RAG 컨텍스트에서 제외한다. (후속 PR에서 클라이언트가 평문
    # 컨텍스트를 함께 전송하는 방식으로 대체될 예정)
    ordered = list(reversed(rows))  # 과거 → 최근 순
    plain_only = [row for row in ordered if not _is_ciphertext(row[2])]
    if not plain_only:
        return "", []
    lines: list[str] = []
    included_orders: list[int] = []
    total = len(plain_only)
    for idx, row in enumerate(plain_only):
        steps_back = total - idx  # 1 = 직전 화, 2 = 2화 전, ...
        if steps_back == 1:
            rel_label = "직전 화"
        else:
            rel_label = f"{steps_back}화 전"
        content = _plain(row[2])
        lines.append(f"=== {rel_label}: {row[1]} ===\n{content}")
        included_orders.append(int(row[0]))
    return "\n\n".join(lines), included_orders


def _is_ciphertext(content: Any) -> bool:
    """Plan C v1 암호문 판별. 'v1:' 접두사로 시작하는 문자열만 암호문."""
    return isinstance(content, str) and content.startswith("v1:")


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
