"""검수 본문에서 반복 표현을 결정론적으로 검출한다.

LLM은 한국어 문장 빈도를 정확히 카운팅하지 못하므로, 후처리 모듈로 분리한다.
검출 결과는 review 응답의 issues 배열에 머지된다.

검출 대상:
1. 동일 문장 2회 이상 반복
2. 어절 n-gram(3~5어절) 4회 이상 반복

입력은 extract_numbered_text() 출력(줄 번호가 붙은 본문)을 받는다.
이 형식이어야 검출 결과의 lines 필드를 정확히 매핑할 수 있다.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any

# [N] 접두사를 떼어 줄별 텍스트로 분해한다.
_LINE_PREFIX_RE = re.compile(r"^\[(\d+)\]\s?")
# 한국어 종결부호 + 따옴표 끝까지를 한 문장으로 본다.
_SENTENCE_SPLIT_RE = re.compile(r'(?<=[.!?…。])\s+|(?<=["”’])\s+')

# 검출에서 무시할 매우 짧은 문장 (단답·감탄사·짧은 대사).
_MIN_SENTENCE_LEN = 8
# 동일 문장 반복 임계치.
_SENTENCE_REPEAT_THRESHOLD = 3
# n-gram 어절 길이 범위 (3~5어절).
_NGRAM_MIN = 3
_NGRAM_MAX = 5
# n-gram 반복 임계치.
_NGRAM_REPEAT_THRESHOLD = 4

# 너무 일반적이라 검출해도 의미 없는 어절 패턴은 차단한다.
# (조사·어미만 다른 표현은 어쩔 수 없이 잡힐 수 있으나, 4회 이상이면 의도된 톤이거나
#  실제 결함이므로 작가가 info 등급으로 검토하면 충분하다.)
_GENERIC_NGRAM_BLOCKLIST = {
    "고개를 끄덕였다",
    "고개를 끄덕였다.",
    "그가 말했다",
    "그녀가 말했다",
}


def _parse_numbered_lines(numbered_text: str) -> list[tuple[int, str]]:
    """[N] 접두사가 붙은 텍스트를 (line_num, content) 리스트로 분해."""
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


def _split_sentences(text: str) -> list[str]:
    pieces = _SENTENCE_SPLIT_RE.split(text)
    return [p.strip() for p in pieces if p and p.strip()]


def _ngrams(words: list[str], n: int) -> list[str]:
    if len(words) < n:
        return []
    return [" ".join(words[i:i + n]) for i in range(len(words) - n + 1)]


def detect_repetitions(numbered_text: str) -> list[dict[str, Any]]:
    """반복 표현 issues를 반환한다.

    각 issue는 review 응답의 schema와 동일한 형태:
      {type, severity, lines, location, description, reference, suggestion}
    """
    if not numbered_text:
        return []

    lines = _parse_numbered_lines(numbered_text)
    if not lines:
        return []

    # 후보 수집: (count, kind, sort_key, location, lines_frozenset, issue_factory)
    # kind: "sentence" | "ngram"
    # 같은 함정이 sentence와 ngram, 또는 다른 n-gram 길이로 중복 검출되는 문제를
    # 한 번에 정리하기 위해 모든 후보를 모은 뒤 통합 dedup 한다.
    Candidate = tuple[int, str, int, str, frozenset[int], dict[str, Any]]
    candidates: list[Candidate] = []

    # 1) 동일 문장 반복 후보
    sentence_to_lines: dict[str, list[int]] = defaultdict(list)
    for line_num, content in lines:
        for sent in _split_sentences(content):
            if len(sent) < _MIN_SENTENCE_LEN:
                continue
            sentence_to_lines[sent].append(line_num)
    for sent, occurrences in sentence_to_lines.items():
        cnt = len(occurrences)
        if cnt < _SENTENCE_REPEAT_THRESHOLD:
            continue
        line_set = frozenset(occurrences)
        candidates.append((
            cnt, "sentence", 0, sent, line_set,
            {
                "type": "tone_conflict",
                "severity": "warning" if cnt >= 5 else "info",
                "lines": sorted(line_set),
                "location": sent[:60],
                "description": (
                    f"동일 문장이 {cnt}회 반복됨. "
                    "표현이 단조로워질 수 있으므로 변주를 검토하세요."
                ),
                "reference": "검수기 후처리 모듈(반복 검출)",
                "suggestion": "동일 표현을 다른 묘사·동작·시점으로 바꿔 리듬을 살리세요.",
            },
        ))

    # 2) 어절 n-gram 반복 후보 (3~5어절)
    ngram_lines: dict[tuple[int, str], list[int]] = defaultdict(list)
    for line_num, content in lines:
        words = content.split()
        for n in range(_NGRAM_MIN, _NGRAM_MAX + 1):
            for ng in _ngrams(words, n):
                if ng in _GENERIC_NGRAM_BLOCKLIST:
                    continue
                ngram_lines[(n, ng)].append(line_num)
    for (n, ng), occurrences in ngram_lines.items():
        cnt = len(occurrences)
        if cnt < _NGRAM_REPEAT_THRESHOLD:
            continue
        line_set = frozenset(occurrences)
        candidates.append((
            cnt, "ngram", n, ng, line_set,
            {
                "type": "tone_conflict",
                "severity": "warning" if cnt >= 6 else "info",
                "lines": sorted(line_set),
                "location": ng[:60],
                "description": (
                    f'표현 "{ng}"이(가) {cnt}회 반복됨. '
                    "한 화 안에서 같은 어구가 자주 나오면 톤이 단조로워집니다."
                ),
                "reference": f"검수기 후처리 모듈(어절 n-gram, n={n})",
                "suggestion": "같은 의미를 다른 어휘·문장 구조로 바꿔 변주를 주세요.",
            },
        ))

    # 통합 dedup:
    #   1) 출현 횟수 DESC (가장 일반적이고 정확한 카운트를 우선)
    #   2) ngram 우선 (같은 카운트일 때 어절 단위가 마침표/공백 변형에 덜 영향받음)
    #   3) n ASC (짧고 일반적인 패턴 우선)
    # 자기 lines가 이미 채택한 lines의 부분집합이면 중복으로 보고 제거한다.
    candidates.sort(
        key=lambda c: (-c[0], 0 if c[1] == "ngram" else 1, c[2])
    )
    issues: list[dict[str, Any]] = []
    kept_line_sets: list[frozenset[int]] = []
    for cnt, kind, _sk, _loc, line_set, issue in candidates:
        if any(line_set <= existing for existing in kept_line_sets):
            continue
        kept_line_sets.append(line_set)
        issues.append(issue)

    return issues


__all__ = ["detect_repetitions"]
