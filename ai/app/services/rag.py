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
from typing import Any

from sqlalchemy import select, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.config import settings
from app.services.chunker import count_tokens
from app.services.providers import get_embedder
from app.services.settings_loader import load_settings
from app.services.text_extractor import extract_plain_text

TOKEN_BUDGET = 40_000

PRIORITY_1_LABEL = "recent_raw"
PRIORITY_2_LABEL = "recent_summaries"


RECENT_RAW_LIMIT = {"draft": 4, "review": 2}
VECTOR_SEARCH_LIMIT = {"draft": 15, "review": 5}


async def assemble_context(
    work_id: str,
    writer_id: str,
    storyline: str,
    current_episode_num: int,
    mode: str = "draft",
) -> str:
    recent_raw_limit = RECENT_RAW_LIMIT.get(mode, RECENT_RAW_LIMIT["draft"])
    vector_search_limit = VECTOR_SEARCH_LIMIT.get(mode, VECTOR_SEARCH_LIMIT["draft"])
    engine = create_async_engine(settings.database_url, pool_size=1)
    try:
        async with AsyncSession(engine) as session:
            sections = {}
            settings_bundle = await load_settings(session, work_id)

            sections["work_meta"] = await _fetch_work_meta(session, work_id)
            if settings_bundle["mode"] == "full":
                sections["characters"] = _format_rag_characters(settings_bundle["characters"])
                sections["world_notes"] = _format_rag_world_notes(settings_bundle["world_notes"])
            else:
                sections["characters"] = settings_bundle["characters_text"]
                sections["world_notes"] = settings_bundle["world_notes_text"]
            sections["foreshadows"] = await _fetch_foreshadows(session, work_id)
            sections["storyline"] = await _fetch_storyline(session, work_id, storyline)
            sections["recent_summaries"] = await _fetch_recent_summaries(
                session, work_id, current_episode_num
            )
            sections["recent_raw"] = await _fetch_recent_raw(
                session, work_id, current_episode_num, limit=recent_raw_limit
            )
            sections["vector_search"] = await _fetch_vector_similar(
                session, work_id, writer_id, storyline, limit=vector_search_limit
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


def _format_rag_characters(rows: list[tuple[Any, ...]]) -> str:
    if not rows:
        return ""
    lines = []
    for row in rows:
        parts = [f"- {row[0]}"]
        if row[1]:
            parts.append(f"성별:{row[1]}")
        if row[2]:
            parts.append(f"나이:{row[2]}")
        if row[3]:
            parts.append(f"성격:{row[3]}")
        if row[4]:
            parts.append(f"설명:{extract_plain_text(row[4])[:200]}")
        lines.append(" / ".join(parts))
    return "\n".join(lines)


def _format_rag_world_notes(rows: list[tuple[Any, ...]]) -> str:
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
    r = await session.execute(
        sa_text(
            "SELECT e.sort_order, e.title, es.summary "
            "FROM episode_summary es "
            "JOIN episode e ON e.id = es.episode_id "
            "WHERE es.work_id = :wid AND e.sort_order < :ep_num "
            "ORDER BY e.sort_order DESC LIMIT 10"
        ),
        {"wid": uuid.UUID(work_id), "ep_num": current_episode_num},
    )
    rows = r.fetchall()
    if not rows:
        return ""
    lines = []
    for row in reversed(rows):
        lines.append(f"[{row[0]}화 - {row[1]}] {row[2]}")
    return "\n".join(lines)


async def _fetch_recent_raw(
    session: AsyncSession, work_id: str, current_episode_num: int, limit: int = 4
) -> str:
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
        return ""
    lines = []
    for row in reversed(rows):
        content = extract_plain_text(row[2])
        lines.append(f"=== {row[0]}화: {row[1]} ===\n{content}")
    return "\n\n".join(lines)


async def _fetch_vector_similar(
    session: AsyncSession,
    work_id: str,
    writer_id: str,
    storyline: str,
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

    r = await session.execute(
        sa_text(
            "SELECT content, 1 - (embedding <=> cast(:vec AS vector)) AS similarity "
            "FROM episode_chunk "
            "WHERE work_id = :wid AND writer_id = :wr "
            "ORDER BY embedding <=> cast(:vec AS vector) "
            "LIMIT :lim"
        ),
        {
            "vec": vec_str,
            "wid": uuid.UUID(work_id),
            "wr": uuid.UUID(writer_id),
            "lim": limit,
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
        ("recent_summaries", "## 최근 회차 요약"),
        ("recent_raw", "## 최근 회차 원문"),
        ("vector_search", "## 관련 과거 장면"),
    ]

    priority_keys = ["recent_raw", "recent_summaries"]
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
