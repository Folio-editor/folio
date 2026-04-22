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

import uuid

from sqlalchemy import select, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.config import settings
from app.services.chunker import count_tokens
from app.services.providers import get_embedder
from app.services.text_extractor import extract_plain_text

TOKEN_BUDGET = 28_000

PRIORITY_1_LABEL = "recent_raw"


async def assemble_context(
    work_id: str,
    writer_id: str,
    storyline: str,
    current_episode_num: int,
) -> str:
    engine = create_async_engine(settings.database_url, pool_size=1)
    try:
        async with AsyncSession(engine) as session:
            sections = {}

            sections["work_meta"] = await _fetch_work_meta(session, work_id)
            sections["characters"] = await _fetch_characters(session, work_id)
            sections["world_notes"] = await _fetch_world_notes(session, work_id)
            sections["foreshadows"] = await _fetch_foreshadows(session, work_id)
            sections["storyline"] = await _fetch_storyline(session, work_id, storyline)
            sections["recent_raw"] = await _fetch_recent_raw(
                session, work_id, current_episode_num
            )
            sections["vector_search"] = await _fetch_vector_similar(
                session, work_id, writer_id, storyline
            )

        return _trim_to_budget(sections)
    finally:
        await engine.dispose()


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
    parts = [f"제목: {row[0]}"]
    if row[1]:
        parts.append(f"작가명: {row[1]}")
    if row[2]:
        parts.append(f"작품 설명: {row[2]}")
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
    for char in chars:
        char_id = char[0] if isinstance(char[0], uuid.UUID) else uuid.UUID(str(char[0]))
        parts = [f"- {char[1]}"]
        if char[2]:
            parts.append(f"성별:{char[2]}")
        if char[3]:
            parts.append(f"나이:{char[3]}")
        char_notes = notes_by_char.get(char_id, [])
        for note in char_notes:
            content = note[3]
            if content:
                label = note[2] or note[1] or ""
                text = extract_plain_text(content)[:200]
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
    lines = []
    for row in rows:
        content = extract_plain_text(row[1])[:300] if row[1] else ""
        lines.append(f"- {row[0]}: {content}")
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
    lines = []
    for row in rows:
        status = row[1] or "unknown"
        importance = row[2] or ""
        content = extract_plain_text(row[3])[:200] if row[3] else ""
        lines.append(f"- [{status}] {row[0]} (중요도:{importance}) {content}")
    return "\n".join(lines)


async def _fetch_storyline(
    session: AsyncSession, work_id: str, storyline: str
) -> str:
    r = await session.execute(
        sa_text(
            "SELECT title, content FROM plot "
            "WHERE work_id = :wid ORDER BY sort_order"
        ),
        {"wid": uuid.UUID(work_id)},
    )
    rows = r.fetchall()
    parts = []
    if rows:
        for row in rows:
            content = extract_plain_text(row[1])[:300] if row[1] else ""
            parts.append(f"- {row[0]}: {content}")
    if storyline:
        parts.append(f"\n이번 회차 방향: {storyline}")
    return "\n".join(parts)


async def _fetch_recent_summaries(
    session: AsyncSession, work_id: str, current_episode_num: int
) -> str:
    return ""


async def _fetch_recent_raw(
    session: AsyncSession, work_id: str, current_episode_num: int
) -> str:
    r = await session.execute(
        sa_text(
            "SELECT sort_order, title, content FROM episode "
            "WHERE work_id = :wid AND sort_order < :ep_num "
            "ORDER BY sort_order DESC LIMIT 3"
        ),
        {"wid": uuid.UUID(work_id), "ep_num": current_episode_num},
    )
    rows = r.fetchall()
    if not rows:
        return ""
    lines = []
    for row in reversed(rows):
        content = extract_plain_text(row[2])
        lines.append(f"=== {row[0]}화: {row[1]} ===\n{content}")
    return "\n\n".join(lines)


async def _fetch_vector_similar(
    session: AsyncSession, work_id: str, writer_id: str, storyline: str
) -> str:
    if not storyline:
        return ""
    embedder = get_embedder()
    vecs = await embedder.embed_batch([storyline])
    if not vecs:
        return ""
    vec = vecs[0]
    vec_str = "[" + ",".join(str(v) for v in vec) + "]"

    r = await session.execute(
        sa_text(
            "SELECT content, 1 - (embedding <=> cast(:vec AS vector)) AS similarity "
            "FROM episode_chunk "
            "WHERE work_id = :wid AND writer_id = :wr "
            "ORDER BY embedding <=> cast(:vec AS vector) "
            "LIMIT 12"
        ),
        {
            "vec": vec_str,
            "wid": uuid.UUID(work_id),
            "wr": uuid.UUID(writer_id),
        },
    )
    rows = r.fetchall()
    if not rows:
        return ""
    lines = []
    for row in rows:
        lines.append(row[0])
    return "\n---\n".join(lines)


def _trim_to_budget(sections: dict[str, str]) -> str:
    """토큰 예산 내로 트리밍. 우선순위: 최근 원문 > 최근 요약 > 나머지."""

    template = [
        ("work_meta", "## 작품 정보"),
        ("characters", "## 등장인물"),
        ("world_notes", "## 세계관 설정"),
        ("foreshadows", "## 복선/떡밥"),
        ("storyline", "## 스토리라인"),
        ("recent_raw", "## 최근 회차 원문"),
        ("vector_search", "## 관련 과거 장면"),
    ]

    trimmable_keys = ["vector_search", "foreshadows", "world_notes", "characters"]

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
