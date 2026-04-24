"""TipTap JSON → 순수 텍스트 변환기.

DB에 저장된 TipTap JSON 문자열을 청킹/임베딩/요약/RAG/MCP에 쓰기 좋은
plain text로 정제한다.

- 파싱 실패 시 입력을 그대로 반환 (레거시 plain text 호환)
- authorNote 마크는 제외 (작가 개인 메모)
- 단락/장면전환/목록/인용 구조는 텍스트 규약으로 보존
"""

from __future__ import annotations

import json
import re
from typing import Any


def extract_numbered_text(content: str | None) -> str:
    """TipTap JSON 문자열에서 블록 노드마다 줄 번호를 붙인 텍스트를 추출한다.

    검수 API에서 LLM에게 줄 번호가 매겨진 원고를 전달하여,
    응답의 lines 필드로 에디터 paragraph와 1:1 매핑할 수 있게 한다.

    예시 출력:
        [1] 리운은 사무실 의자에 앉아 창밖을 바라보았다.
        [2] 회색 하늘 아래 도시의 불빛들이 하나둘 켜지고 있었다.
        [3]
    """
    if not content:
        return ""

    try:
        doc = json.loads(content)
    except (json.JSONDecodeError, TypeError, ValueError):
        # 레거시 plain text — 줄 단위로 번호 부여
        lines = content.split("\n")
        return "\n".join(f"[{i + 1}] {line}" for i, line in enumerate(lines))

    if not isinstance(doc, dict) or doc.get("type") != "doc":
        lines = content.split("\n")
        return "\n".join(f"[{i + 1}] {line}" for i, line in enumerate(lines))

    blocks = doc.get("content", []) or []
    result_lines: list[str] = []
    line_num = 0

    for block in blocks:
        if not isinstance(block, dict):
            continue
        line_num += 1
        node_type = block.get("type", "")

        if node_type in ("paragraph", "heading"):
            text = _extract_nodes(block.get("content", []) or []).rstrip("\n")
            result_lines.append(f"[{line_num}] {text}")
        elif node_type == "sceneBreak":
            result_lines.append(f"[{line_num}] * * *")
        elif node_type == "horizontalRule":
            result_lines.append(f"[{line_num}] ---")
        elif node_type == "bulletList":
            for item in block.get("content", []) or []:
                if not isinstance(item, dict):
                    continue
                item_text = _extract_nodes(item.get("content", []) or []).strip()
                result_lines.append(f"[{line_num}] - {item_text}")
                line_num += 1
            line_num -= 1  # 마지막 아이템 후 중복 증가 보정
        elif node_type == "orderedList":
            for idx, item in enumerate(block.get("content", []) or [], 1):
                if not isinstance(item, dict):
                    continue
                item_text = _extract_nodes(item.get("content", []) or []).strip()
                result_lines.append(f"[{line_num}] {idx}. {item_text}")
                line_num += 1
            line_num -= 1
        elif node_type == "blockquote":
            inner = _extract_nodes(block.get("content", []) or []).strip()
            result_lines.append(f"[{line_num}] > {inner}")
        elif node_type == "codeBlock":
            text = _extract_nodes(block.get("content", []) or []).rstrip("\n")
            result_lines.append(f"[{line_num}] {text}")
        else:
            children = block.get("content", []) or []
            if children:
                text = _extract_nodes(children).rstrip("\n")
                result_lines.append(f"[{line_num}] {text}")
            else:
                result_lines.append(f"[{line_num}]")

    return "\n".join(result_lines)


def extract_plain_text(content: str | None) -> str:
    """TipTap JSON 문자열에서 순수 텍스트를 추출한다."""
    if not content:
        return ""

    try:
        doc = json.loads(content)
    except (json.JSONDecodeError, TypeError, ValueError):
        return _normalize_whitespace(content)

    if not isinstance(doc, dict) or doc.get("type") != "doc":
        return _normalize_whitespace(content)

    raw = _extract_nodes(doc.get("content", []) or []).strip()
    return _normalize_whitespace(raw)


_TRAILING_SPACES = re.compile(r"[ \t　]+")
_MULTI_NEWLINE = re.compile(r"\n{3,}")


def _normalize_whitespace(text: str) -> str:
    """토큰 낭비를 일으키는 연속 공백·과도한 빈 줄을 정리.

    문단 구조(\n\n)는 유지해 TipTap 원본의 의미 구분을 손상시키지 않는다.
    - 공백/탭 2개 이상 → 1개
    - 빈 줄 3개 이상 → 2개 (문단 구분만 유지)
    """
    if not text:
        return ""
    text = _TRAILING_SPACES.sub(" ", text)
    text = _MULTI_NEWLINE.sub("\n\n", text)
    return text.strip()


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
