"""검수 본문에서 결정론적으로 잡을 수 있는 구조적 오류를 검출한다.

LLM의 attention 분산 한계를 우회하기 위한 결정론 후처리 모듈.
검출된 issue는 review 응답의 issues 배열에 머지된다.

검출 대상:
1. 메타 회차 참조 — 본문이 자기 작품을 메타로 가리키는 표현 (예: "3화에서~")
2. 날짜-요일 불일치 — 본문에 명시된 날짜와 요일 짝이 캘린더 상 모순되는 경우
"""

from __future__ import annotations

import datetime as _dt
import re
from typing import Any

# [N] 접두사를 떼어 줄별 텍스트로 분해. repetition_detector와 동일 포맷.
_LINE_PREFIX_RE = re.compile(r"^\[(\d+)\]\s?")

# 메타 회차 참조 패턴.
# - "N화에서", "N화 때", "N화의", "N화쯤", "N화에 등장" 등
# 단, 본문에 실제로 회차 번호가 디제틱(diegetic)으로 등장하는 경우는 거의 없으므로
# 이 패턴이 본문에 나타나면 작가의 메타 표현 실수일 가능성이 매우 높다.
_META_EPISODE_RE = re.compile(r"(?P<num>\d+)\s*화(?:에서|에|의|쯤|때|째|에서는|에서의)")

# 과거 직접 서술 패턴 ("N년 전 …했다", "N개월 전 …이었다" 등).
# 웹소설 본문은 디제틱 서술이 원칙으로, "N년 전"으로 시작하는 회상을 직접 과거 시제로
# 서술하면 시점 일관성·몰입을 깨는 작가 시점 진술이 된다. style_memo에 "직접 진술 금지"가
# 명시된 작품에서 자주 잡혀야 할 패턴.
_PAST_DIRECT_NARRATION_RE = re.compile(
    r"(?P<marker>\d+\s*(?:년|개월|달|주|일)\s*전)\s*"
    r"[^.!?]*?"
    r"(?:했다|했었다|였다|이었다|되었다|있었다|겪었다|많았다|시작했다|끝났다|떠났다)"
)

# 한국어 요일 매핑.
_WEEKDAY_KO_TO_INT = {
    "월요일": 0, "화요일": 1, "수요일": 2, "목요일": 3,
    "금요일": 4, "토요일": 5, "일요일": 6,
    "월": 0, "화": 1, "수": 2, "목": 3, "금": 4, "토": 5, "일": 6,
}

# 날짜+요일 동반 표현 패턴.
# 예: "2025년 5월 9일 금요일", "5월 9일 금요일", "9일 금요일"
# 연도 없으면 검증 시 모든 합리적 연도(2020~2030)에 대해 짝이 맞는지 확인.
_DATE_WITH_WEEKDAY_RE = re.compile(
    r"(?:(?P<year>\d{4})\s*년\s*)?"
    r"(?P<month>\d{1,2})\s*월\s*"
    r"(?P<day>\d{1,2})\s*일\s*"
    r"\(?\s*(?P<wd>월요일|화요일|수요일|목요일|금요일|토요일|일요일|[월화수목금토일])\s*\)?"
)


def _parse_numbered_lines(numbered_text: str) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    for raw_line in numbered_text.splitlines():
        m = _LINE_PREFIX_RE.match(raw_line)
        if not m:
            continue
        line_num = int(m.group(1))
        content = raw_line[m.end():].strip()
        if content:
            out.append((line_num, content))
    return out


def detect_meta_episode_references(numbered_text: str) -> list[dict[str, Any]]:
    """본문이 'N화에서~' 같은 메타 회차 참조를 포함하면 issue로 보고."""
    if not numbered_text:
        return []
    lines = _parse_numbered_lines(numbered_text)
    matched: dict[int, list[int]] = {}  # episode_num → line_nums
    for line_num, content in lines:
        for m in _META_EPISODE_RE.finditer(content):
            ep = int(m.group("num"))
            matched.setdefault(ep, []).append(line_num)

    issues: list[dict[str, Any]] = []
    for ep, occurrences in matched.items():
        # 1자리 화수가 본문에 자주 등장할 수 있어 위 정규식이 다소 보수적이지만,
        # "화에서/화 때/화의" 같이 명확한 메타 마커가 붙은 경우만 잡으므로 false positive 낮다.
        issues.append({
            "type": "narration_conflict",
            "severity": "warning",
            "lines": sorted(set(occurrences)),
            "location": f"{ep}화에서…",
            "description": (
                f"본문이 '{ep}화에서~' 같이 자기 작품을 메타로 지칭하고 있다. "
                "웹소설 본문은 디제틱 서술이어야 하며, 작가가 N화 번호를 직접 언급하는 것은 "
                "독자 몰입을 깨는 메타 표현 실수다."
            ),
            "reference": "검수기 후처리 모듈(메타 회차 참조)",
            "suggestion": (
                "회차 번호를 직접 언급하지 말고 '얼마 전', '며칠 전', '그날' 등 "
                "디제틱 표현으로 바꾸세요."
            ),
        })
    return issues


def _is_valid_date_weekday(year: int, month: int, day: int, weekday_int: int) -> bool:
    try:
        return _dt.date(year, month, day).weekday() == weekday_int
    except ValueError:
        return False


def detect_date_weekday_mismatches(
    numbered_text: str,
    *,
    candidate_years: tuple[int, ...] = tuple(range(2020, 2036)),
) -> list[dict[str, Any]]:
    """본문에 날짜+요일이 함께 나오는 부분을 찾아 캘린더상 모순을 검출.

    연도가 명시 안 되면 후보 연도 범위 중 단 하나라도 매칭되면 통과로 본다
    (작품 내 시간이 임의일 수 있으므로).
    """
    if not numbered_text:
        return []
    lines = _parse_numbered_lines(numbered_text)
    issues: list[dict[str, Any]] = []
    for line_num, content in lines:
        for m in _DATE_WITH_WEEKDAY_RE.finditer(content):
            month = int(m.group("month"))
            day = int(m.group("day"))
            wd_label = m.group("wd")
            wd_int = _WEEKDAY_KO_TO_INT.get(wd_label)
            if wd_int is None:
                continue
            year_str = m.group("year")
            if year_str:
                year = int(year_str)
                if _is_valid_date_weekday(year, month, day, wd_int):
                    continue
                date_label = f"{year}년 {month}월 {day}일"
            else:
                # 연도 미명시 — 후보 범위 중 하나라도 맞으면 통과
                if any(_is_valid_date_weekday(y, month, day, wd_int) for y in candidate_years):
                    continue
                date_label = f"{month}월 {day}일"
            issues.append({
                "type": "narration_conflict",
                "severity": "warning",
                "lines": [line_num],
                "location": f"{date_label} {wd_label}",
                "description": (
                    f"본문에 '{date_label} {wd_label}'로 명시되어 있으나 "
                    "이 날짜와 요일 조합은 캘린더상 일치하지 않는다."
                ),
                "reference": "검수기 후처리 모듈(날짜-요일 검증)",
                "suggestion": (
                    "날짜 또는 요일 중 하나를 실제 캘린더에 맞춰 수정하세요. "
                    "작품 내 명시 연도가 있다면 그 연도 기준으로 다시 확인하세요."
                ),
            })
    return issues


def detect_past_direct_narration(numbered_text: str) -> list[dict[str, Any]]:
    """본문에 'N년 전 …했다' 같은 직접 과거 서술이 있으면 issue로 보고.

    웹소설 본문은 디제틱 서술이 원칙이며, 작가가 시점 밖에서 과거를 직접 진술하면
    style_memo의 일반 규칙을 위반한다. 회상은 인물 시점·내적 독백·자연스러운 회상으로
    풀어야 하므로 'N년 전 …했다' 패턴은 작가 실수 가능성이 높다.
    """
    if not numbered_text:
        return []
    lines = _parse_numbered_lines(numbered_text)
    issues: list[dict[str, Any]] = []
    seen: set[tuple[int, str]] = set()
    for line_num, content in lines:
        for m in _PAST_DIRECT_NARRATION_RE.finditer(content):
            marker = m.group("marker").replace(" ", "")
            sig = (line_num, marker)
            if sig in seen:
                continue
            seen.add(sig)
            issues.append({
                "type": "tone_conflict",
                "severity": "info",
                "lines": [line_num],
                "location": m.group(0)[:60],
                "description": (
                    f"본문이 '{marker} …' 같은 직접 과거 서술로 시작한다. "
                    "웹소설은 디제틱 서술이 원칙이므로, 작가 시점에서 과거를 단언하는 진술 대신 "
                    "인물 회상·내적 독백·자연스러운 화법으로 풀어 쓰는 것이 좋다."
                ),
                "reference": "검수기 후처리 모듈(과거 직접 진술)",
                "suggestion": (
                    "'그날 이후', '오래전부터', 인물 시점의 회상 문장 등으로 바꿔 디제틱 서술을 유지하세요."
                ),
            })
    return issues


def detect_structural_issues(numbered_text: str) -> list[dict[str, Any]]:
    """모든 결정론 구조 검증을 한 번에 실행한다."""
    return (
        detect_meta_episode_references(numbered_text)
        + detect_date_weekday_mismatches(numbered_text)
        + detect_past_direct_narration(numbered_text)
    )


__all__ = [
    "detect_meta_episode_references",
    "detect_date_weekday_mismatches",
    "detect_past_direct_narration",
    "detect_structural_issues",
]
