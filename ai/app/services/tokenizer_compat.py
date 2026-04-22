from __future__ import annotations

import re
from collections.abc import Sequence

try:
    import tiktoken
except ImportError:  # pragma: no cover - optional dependency in some test environments
    tiktoken = None


_FALLBACK_TOKEN_RE = re.compile(r"\S+\s*|\s+", re.UNICODE)


class SimpleEncoding:
    """Small offline-safe fallback used when cl100k_base cannot be loaded."""

    def encode(self, text: str) -> list[str]:
        if not text:
            return []
        return _FALLBACK_TOKEN_RE.findall(text)

    def decode(self, tokens: Sequence[str]) -> str:
        return "".join(tokens)


def get_cl100k_base_encoding():
    if tiktoken is not None:
        try:
            return tiktoken.get_encoding("cl100k_base")
        except Exception:
            pass
    return SimpleEncoding()
