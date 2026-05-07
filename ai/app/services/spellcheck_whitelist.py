"""Whitelist helpers for the AI spellcheck endpoint.

The spellchecker must avoid flagging story-specific proper nouns.  We keep the
rules intentionally small: collect names from the decrypted AI context payload
and drop LLM issues whose original text touches one of those names, including
simple Korean postposition suffixes.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

from app.schemas.ai_context_payload import AiContextPayload

_PARTICLES = (
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "에",
    "에서",
    "에게",
    "께",
    "한테",
    "으로",
    "로",
    "으로부터",
    "로부터",
    "와",
    "과",
    "랑",
    "이랑",
    "도",
    "만",
    "까지",
    "부터",
    "처럼",
    "보다",
    "조차",
    "마저",
    "야",
    "아",
    "여",
    "이여",
    "의",
)


def collect_spellcheck_whitelist(context: AiContextPayload | None) -> set[str]:
    if context is None:
        return set()

    names: set[str] = set()
    for character in context.characters:
        _add_name(names, character.name)
    for world_note in context.world_notes:
        _add_name(names, world_note.name)
    return names


def filter_whitelisted_issues(
    issues: Iterable[dict],
    whitelist: Iterable[str],
) -> list[dict]:
    names = sorted({name.strip() for name in whitelist if name and name.strip()}, key=len, reverse=True)
    if not names:
        return list(issues)

    return [issue for issue in issues if not _issue_touches_whitelist(issue, names)]


def _add_name(names: set[str], value: str | None) -> None:
    if not value:
        return
    name = value.strip()
    if len(name) >= 2:
        names.add(name)


def _issue_touches_whitelist(issue: dict, names: list[str]) -> bool:
    text = " ".join(
        str(issue.get(field) or "")
        for field in ("original", "suggestion", "reason")
    )
    if not text:
        return False

    for name in names:
        if _contains_protected_name(text, name):
            return True
    return False


def _contains_protected_name(text: str, name: str) -> bool:
    escaped = re.escape(name)
    particle_alt = "|".join(sorted((re.escape(p) for p in _PARTICLES), key=len, reverse=True))
    pattern = rf"(?<![가-힣A-Za-z0-9_]){escaped}(?:{particle_alt})?(?![가-힣A-Za-z0-9_])"
    return re.search(pattern, text) is not None
