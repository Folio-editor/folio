"""작품 헤더 캐시 블록 (Block B for Anthropic prompt caching).

agent 패러다임에 맞춰 **사전에 인물/세계관/회차를 채워 넣지 않는다**.
agent 는 list_characters / list_world_notes / list_all_oneline_summaries / get_plot
등의 MCP 도구로 필요한 정보를 직접 탐색한다.

본 블록의 목적은 agent 가 "어느 작품을 다루는지" 식별할 수 있는 최소 컨텍스트
(제목·장르·분위기·짧은 줄거리) 만 제공하여 시스템 프롬프트 캐시 적중률을 높이는 것.

캐시 키: (work_id, work.updated_at) — work 메타 변경 시 자동 무효화.
5초 in-memory TTL — 동일 thread 내 재빌드 방지.
"""

from __future__ import annotations

import time
from uuid import UUID

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

_TTL_SECONDS = 5
_cache: dict[str, tuple[float, str]] = {}     # work_id -> (expires_at_ts, block_text)


async def build_work_meta_block(session: AsyncSession, work_id: UUID, writer_id: UUID) -> str:
    cache_key = str(work_id)
    now = time.time()
    cached = _cache.get(cache_key)
    if cached and cached[0] > now:
        return cached[1]

    r = await session.execute(
        sa_text(
            "SELECT title, author_name, description, status, genres, moods, kind "
            "FROM work WHERE id = :wid AND writer_id = :wr"
        ),
        {"wid": work_id, "wr": writer_id},
    )
    row = r.fetchone()
    if row is None:
        block = f"[작품 헤더]\n작품을 찾을 수 없습니다 (work_id={work_id})."
        _cache[cache_key] = (now + _TTL_SECONDS, block)
        return block

    title, author, desc, status, genres, moods, kind = row
    short_desc = (desc or "").strip()
    if len(short_desc) > 400:
        short_desc = short_desc[:400] + "…"

    block = (
        "[작품 헤더 — 캐시됨]\n"
        f"제목: {title or '(제목 없음)'}\n"
        f"저자: {author or '(미정)'}\n"
        f"종류: {kind or 'novel'}\n"
        f"장르: {genres or []}\n"
        f"분위기: {moods or []}\n"
        f"상태: {status or '(미정)'}\n"
        f"\n[작가가 작성한 한 줄 줄거리/소개]\n{short_desc or '(미정)'}\n"
        f"\n[탐색 안내]\n"
        "- 인물 목록: list_characters / 상세: get_character(name)\n"
        "- 세계관 노트 목록: list_world_notes / 상세: get_world_note(name)\n"
        "- 메인 플롯: get_plot\n"
        "- 회차 존재 여부 (요약 유무 무관, 가장 먼저): list_episodes\n"
        "- 작품 흐름 1회 조망 (요약된 회차만): list_all_oneline_summaries\n"
        "- 회차 메타 범위: list_episode_summaries / 단건: get_episode_summary(sort_order)\n"
        "- 본문 평문 (비싸므로 신중): fetch_episode_plaintext(sort_order)\n"
        "- 복선·시간선·인물 추적: track_foreshadow / character_arc / timeline_scan\n"
        "필요한 정보가 있으면 위 도구들을 직접 호출해 탐색하세요."
    )
    _cache[cache_key] = (now + _TTL_SECONDS, block)
    return block
