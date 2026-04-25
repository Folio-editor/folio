"""회차별 시간 표지를 정규식으로 추출해 타임라인 메타데이터를 만든다.

LLM에게 "회차 누적 경과 시간 추론"을 맡기면 비싸고 부정확하다.
대신 각 회차의 도입부에서 시간 표지를 결정론적으로 뽑아 prompt에 주입한다.

사용처: review 모드 RAG 컨텍스트에 "## 회차별 시간 흐름" 섹션으로 합쳐진다.
"""

from __future__ import annotations

import re
import uuid

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.text_extractor import extract_plain_text

# 한국어 시간 표지 패턴. 각 패턴은 (정규식, 표시 라벨) 튜플.
# 본문 첫 부분에서 매칭되는 첫 번째 표지를 회차의 대표 시간으로 본다.
_TIME_MARKERS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"다음\s*날\s*아침"), "다음 날 아침"),
    (re.compile(r"다음\s*날\s*오전"), "다음 날 오전"),
    (re.compile(r"다음\s*날\s*오후"), "다음 날 오후"),
    (re.compile(r"다음\s*날\s*저녁"), "다음 날 저녁"),
    (re.compile(r"다음\s*날\s*밤"), "다음 날 밤"),
    (re.compile(r"다음\s*날"), "다음 날"),
    (re.compile(r"같은\s*날\s*아침"), "같은 날 아침"),
    (re.compile(r"같은\s*날\s*오전"), "같은 날 오전"),
    (re.compile(r"같은\s*날\s*오후"), "같은 날 오후"),
    (re.compile(r"같은\s*날\s*저녁"), "같은 날 저녁"),
    (re.compile(r"같은\s*날\s*밤"), "같은 날 밤"),
    (re.compile(r"같은\s*날"), "같은 날"),
    (re.compile(r"그\s*날\s*저녁"), "그날 저녁"),
    (re.compile(r"그\s*날\s*밤"), "그날 밤"),
    (re.compile(r"그\s*날"), "그날"),
    (re.compile(r"(\d+)\s*시간\s*(?:뒤|후)"), r"\1시간 후"),
    (re.compile(r"(\d+)\s*분\s*(?:뒤|후)"), r"\1분 후"),
    (re.compile(r"(\d+)\s*일\s*(?:뒤|후)"), r"\1일 후"),
    (re.compile(r"며칠\s*(?:뒤|후)"), "며칠 후"),
    (re.compile(r"일주일\s*(?:뒤|후)"), "일주일 후"),
    (re.compile(r"한\s*달\s*(?:뒤|후)"), "한 달 후"),
    (re.compile(r"새벽"), "새벽"),
    (re.compile(r"이른\s*아침"), "이른 아침"),
    (re.compile(r"늦은\s*밤"), "늦은 밤"),
    (re.compile(r"한밤중"), "한밤중"),
    (re.compile(r"아침"), "아침"),
    (re.compile(r"오전"), "오전"),
    (re.compile(r"오후"), "오후"),
    (re.compile(r"저녁"), "저녁"),
    (re.compile(r"밤"), "밤"),
]

# 본문에서 발견되는 "회상/소급 표현" — 이 표지가 본문에 등장하면 회차 누적 시간과
# 비교 검증이 필요하다. (예: 1~6화 합산이 2~3일인데 본문이 "한 달 전"이라고 쓰면 충돌)
_RETROSPECT_MARKERS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"한\s*달\s*전"), "한 달 전"),
    (re.compile(r"(\d+)\s*개월\s*전"), r"\1개월 전"),
    (re.compile(r"일주일\s*전"), "일주일 전"),
    (re.compile(r"몇\s*주\s*전"), "몇 주 전"),
    (re.compile(r"(\d+)\s*주\s*전"), r"\1주 전"),
    (re.compile(r"(\d+)\s*일\s*전"), r"\1일 전"),
    (re.compile(r"며칠\s*전"), "며칠 전"),
    (re.compile(r"(\d+)\s*년\s*전"), r"\1년 전"),
]

# 회차 도입부 검사 범위 (문자 수). 너무 길면 본문 중반의 시간 변화를 끌어옴.
# 1500자까지 확장: 짧은 도입부에 시간 표지가 없는 경우를 보완.
_INTRO_WINDOW = 1500


def _first_marker(text: str) -> str | None:
    head = text[:_INTRO_WINDOW]
    matches: list[tuple[int, str]] = []
    for pattern, label in _TIME_MARKERS:
        m = pattern.search(head)
        if not m:
            continue
        # 그룹 치환이 있는 패턴 처리 (예: r"\1시간 후")
        try:
            resolved_label = m.expand(label) if "\\" in label else label
        except (re.error, IndexError):
            resolved_label = label
        matches.append((m.start(), resolved_label))
    if not matches:
        return None
    matches.sort(key=lambda x: x[0])
    return matches[0][1]


def find_retrospect_markers(text: str) -> list[str]:
    """본문에서 발견되는 회상/소급 시간 표지를 모두 반환한다.

    LLM이 회차 누적 경과 시간과 본문의 "한 달 전" 같은 진술을 비교하도록
    검수 컨텍스트에 별도 섹션으로 노출한다.
    """
    if not text:
        return []
    found: list[tuple[int, str]] = []
    for pattern, label in _RETROSPECT_MARKERS:
        for m in pattern.finditer(text):
            try:
                resolved = m.expand(label) if "\\" in label else label
            except (re.error, IndexError):
                resolved = label
            found.append((m.start(), resolved))
    if not found:
        return []
    found.sort(key=lambda x: x[0])
    # 중복 제거 (같은 라벨 여러 번 등장 시 한 번만)
    seen: set[str] = set()
    out: list[str] = []
    for _, lbl in found:
        if lbl in seen:
            continue
        seen.add(lbl)
        out.append(lbl)
    return out


async def build_timeline(
    session: AsyncSession,
    work_id: str,
    current_episode_num: int,
) -> str:
    """현재 회차 직전까지의 회차별 첫 시간 표지를 텍스트로 반환.

    LLM에 메타 회차 번호를 노출하지 않으려면 절대 번호 대신 상대 라벨을 쓴다.
    예: "직전 화: 다음 날 아침 / 2화 전: 같은 날 저녁".
    """
    if current_episode_num <= 0:
        return ""
    r = await session.execute(
        sa_text(
            "SELECT sort_order, content FROM episode "
            "WHERE work_id = :wid AND sort_order < :ep_num "
            "ORDER BY sort_order ASC"
        ),
        {"wid": uuid.UUID(work_id), "ep_num": current_episode_num},
    )
    rows = r.fetchall()
    if not rows:
        return ""

    total = len(rows)
    parts: list[str] = []
    for idx, row in enumerate(rows):
        plain = extract_plain_text(row[1])
        marker = _first_marker(plain) if plain else None
        if not marker:
            continue
        steps_back = total - idx  # 1=직전 화
        rel_label = "직전 화" if steps_back == 1 else f"{steps_back}화 전"
        parts.append(f"- {rel_label}: {marker}")

    if not parts:
        return ""
    return "\n".join(parts)


__all__ = ["build_timeline"]
