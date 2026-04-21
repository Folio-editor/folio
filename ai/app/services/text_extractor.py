"""TipTap JSON → 순수 텍스트 변환기.

DB에 저장된 TipTap JSON 문자열을 청킹/임베딩/요약/RAG/MCP에 쓰기 좋은
plain text로 정제한다.

- 파싱 실패 시 입력을 그대로 반환 (레거시 plain text 호환)
- authorNote 마크는 제외 (작가 개인 메모)
- 단락/장면전환/목록/인용 구조는 텍스트 규약으로 보존
"""

from __future__ import annotations

import json
from typing import Any


def extract_plain_text(content: str | None) -> str:
    """TipTap JSON 문자열에서 순수 텍스트를 추출한다."""
    if not content:
        return ""

    try:
        doc = json.loads(content)
    except (json.JSONDecodeError, TypeError, ValueError):
        return content

    if not isinstance(doc, dict) or doc.get("type") != "doc":
        return content

    return _extract_nodes(doc.get("content", []) or []).strip()


def _extract_nodes(nodes: list[dict[str, Any]]) -> str:
    parts: list[str] = []

    for node in nodes:
        if not isinstance(node, dict):
            continue

        node_type = node.get("type", "")

        if node_type == "text":
            marks = node.get("marks") or []
            if any(isinstance(m, dict) and m.get("type") == "authorNote" for m in marks):
                continue
            parts.append(node.get("text", "") or "")

        elif node_type in ("paragraph", "heading"):
            text = _extract_nodes(node.get("content", []) or [])
            if text:
                parts.append(text + "\n\n")

        elif node_type == "sceneBreak":
            parts.append("* * *\n\n")

        elif node_type == "horizontalRule":
            parts.append("---\n\n")

        elif node_type == "hardBreak":
            parts.append("\n")

        elif node_type == "bulletList":
            for item in node.get("content", []) or []:
                if not isinstance(item, dict):
                    continue
                item_text = _extract_nodes(item.get("content", []) or []).strip()
                if item_text:
                    parts.append("- " + item_text + "\n")
            parts.append("\n")

        elif node_type == "orderedList":
            for idx, item in enumerate(node.get("content", []) or [], 1):
                if not isinstance(item, dict):
                    continue
                item_text = _extract_nodes(item.get("content", []) or []).strip()
                if item_text:
                    parts.append(f"{idx}. " + item_text + "\n")
            parts.append("\n")

        elif node_type == "blockquote":
            inner = _extract_nodes(node.get("content", []) or []).strip()
            if inner:
                for line in inner.split("\n"):
                    parts.append("> " + line + "\n")
                parts.append("\n")

        elif node_type == "codeBlock":
            text = _extract_nodes(node.get("content", []) or [])
            if text:
                parts.append(text + "\n\n")

        elif node_type == "listItem":
            parts.append(_extract_nodes(node.get("content", []) or []))

        else:
            children = node.get("content", []) or []
            if children:
                parts.append(_extract_nodes(children))

    return "".join(parts)
