from __future__ import annotations

import re
from typing import Any

from tokenizer_compat import get_cl100k_base_encoding

_ENCODING = get_cl100k_base_encoding()
_SCENE_DELIMITER_LINE_RE = re.compile(r"^\s*(\*{3,}|-{3,})\s*$")
_SENTENCE_BOUNDARY_RE = re.compile(r"[.!?。！？]\s+")


def count_tokens(text: str) -> int:
    """Return the cl100k_base token count for the given text."""
    if not text:
        return 0
    return len(_ENCODING.encode(text))


def chunk_episode(
    content: str,
    max_tokens: int = 800,
    min_tokens: int = 100,
    overlap_tokens: int = 50,
) -> list[dict[str, Any]]:
    """Split an episode into scene-aware chunks for Folio retrieval."""
    if not content or not content.strip():
        return []

    scenes = _split_into_scenes(content)
    if not scenes:
        return []

    chunks = _build_scene_chunks(scenes, max_tokens=max_tokens)
    if not chunks:
        return []

    chunks = _merge_small_chunks(chunks, min_tokens=min_tokens)
    chunks = _apply_overlap(chunks, overlap_tokens=overlap_tokens)

    for chunk_index, chunk in enumerate(chunks):
        chunk["chunk_index"] = chunk_index
        chunk.pop("_scene_id", None)
        chunk.pop("_base_content", None)

    return chunks


def _split_into_scenes(content: str) -> list[str]:
    normalized = content.replace("\r\n", "\n").replace("\r", "\n")
    lines = normalized.splitlines(keepends=True)

    scenes: list[str] = []
    current_lines: list[str] = []
    blank_buffer: list[str] = []

    def finalize_scene() -> None:
        scene_text = "".join(current_lines).strip("\n")
        current_lines.clear()
        if scene_text.strip():
            scenes.append(scene_text)

    for line in lines:
        stripped = line.strip()

        if _is_scene_delimiter_line(stripped):
            if blank_buffer:
                current_lines.extend(blank_buffer)
                blank_buffer.clear()
            finalize_scene()
            continue

        if stripped == "":
            blank_buffer.append(line)
            continue

        if blank_buffer:
            if len(blank_buffer) >= 3:
                finalize_scene()
            else:
                current_lines.extend(blank_buffer)
            blank_buffer.clear()

        current_lines.append(line)

    if blank_buffer:
        if len(blank_buffer) >= 3:
            finalize_scene()
        else:
            current_lines.extend(blank_buffer)

    finalize_scene()
    return scenes


def _is_scene_delimiter_line(stripped_line: str) -> bool:
    return bool(_SCENE_DELIMITER_LINE_RE.match(stripped_line))


def _build_scene_chunks(
    scenes: list[str],
    max_tokens: int,
) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []

    for scene_id, scene in enumerate(scenes):
        scene_token_count = count_tokens(scene)
        if scene_token_count <= max_tokens:
            chunks.append(
                _make_chunk(
                    scene,
                    token_count=scene_token_count,
                    is_scene_break=True,
                    scene_id=scene_id,
                )
            )
            continue

        scene_chunks = _split_large_scene(scene, scene_id=scene_id, max_tokens=max_tokens)
        chunks.extend(scene_chunks)

    return chunks


def _split_large_scene(
    scene: str,
    scene_id: int,
    max_tokens: int,
) -> list[dict[str, Any]]:
    paragraphs = _split_paragraphs(scene)
    if not paragraphs:
        return []

    units: list[tuple[str, str]] = []
    for paragraph in paragraphs:
        pieces = _split_oversized_text(paragraph, max_tokens=max_tokens)
        for piece_index, piece in enumerate(pieces):
            separator = ""
            if units and piece_index == 0:
                separator = "\n\n"
            units.append((separator, piece))

    chunks: list[dict[str, Any]] = []
    current_content = ""

    for separator, piece in units:
        candidate = piece if not current_content else f"{current_content}{separator}{piece}"
        if current_content and count_tokens(candidate) > max_tokens:
            chunks.append(
                _make_chunk(
                    current_content,
                    token_count=count_tokens(current_content),
                    is_scene_break=not chunks,
                    scene_id=scene_id,
                )
            )
            current_content = piece
        else:
            current_content = candidate

    if current_content.strip():
        chunks.append(
            _make_chunk(
                current_content,
                token_count=count_tokens(current_content),
                is_scene_break=not chunks,
                scene_id=scene_id,
            )
        )

    return chunks


def _split_paragraphs(scene: str) -> list[str]:
    return [part.strip("\n") for part in re.split(r"\n{2,}", scene) if part.strip()]


def _split_oversized_text(text: str, max_tokens: int) -> list[str]:
    if count_tokens(text) <= max_tokens:
        return [text]

    sentences = _split_sentences(text)
    if len(sentences) > 1:
        pieces: list[str] = []
        current = ""

        for sentence in sentences:
            candidate = sentence if not current else f"{current} {sentence}"
            if current and count_tokens(candidate) > max_tokens:
                pieces.append(current)
                current = sentence
            else:
                current = candidate

        if current:
            pieces.append(current)

        if all(count_tokens(piece) <= max_tokens for piece in pieces):
            return pieces

    token_ids = _ENCODING.encode(text)
    return [
        _ENCODING.decode(token_ids[index:index + max_tokens]).strip()
        for index in range(0, len(token_ids), max_tokens)
        if _ENCODING.decode(token_ids[index:index + max_tokens]).strip()
    ]


def _split_sentences(text: str) -> list[str]:
    sentences: list[str] = []
    start = 0

    for match in _SENTENCE_BOUNDARY_RE.finditer(text):
        end = match.end()
        sentence = text[start:end].strip()
        if sentence:
            sentences.append(sentence)
        start = end

    remainder = text[start:].strip()
    if remainder:
        sentences.append(remainder)

    return sentences if len(sentences) > 1 else [text]


def _merge_small_chunks(
    chunks: list[dict[str, Any]],
    min_tokens: int,
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []

    for chunk in chunks:
        if (
            merged
            and not chunk["is_scene_break"]
            and chunk["token_count"] < min_tokens
            and merged[-1]["_scene_id"] == chunk["_scene_id"]
        ):
            base_content = f'{merged[-1]["_base_content"]}\n\n{chunk["_base_content"]}'
            merged[-1]["_base_content"] = base_content
            merged[-1]["content"] = base_content
            merged[-1]["token_count"] = count_tokens(base_content)
            continue

        merged.append(chunk)

    return merged


def _apply_overlap(
    chunks: list[dict[str, Any]],
    overlap_tokens: int,
) -> list[dict[str, Any]]:
    if overlap_tokens <= 0:
        return chunks

    for index, chunk in enumerate(chunks):
        if chunk["is_scene_break"] or index == 0:
            continue

        previous_chunk = chunks[index - 1]
        if previous_chunk["_scene_id"] != chunk["_scene_id"]:
            continue

        overlap_text = _extract_overlap_text(previous_chunk["_base_content"], overlap_tokens)
        if not overlap_text:
            continue

        chunk["content"] = f"{overlap_text}\n\n{chunk['_base_content']}"
        chunk["token_count"] = count_tokens(chunk["content"])

    return chunks


def _extract_overlap_text(text: str, overlap_tokens: int) -> str:
    token_ids = _ENCODING.encode(text)
    if not token_ids:
        return ""

    tail_text = _ENCODING.decode(token_ids[-overlap_tokens:]).strip()
    if not tail_text:
        return ""

    match = _SENTENCE_BOUNDARY_RE.search(tail_text)
    if not match:
        return tail_text

    cleaned = tail_text[match.end():].strip()
    return cleaned or tail_text


def _make_chunk(
    content: str,
    token_count: int,
    is_scene_break: bool,
    scene_id: int,
) -> dict[str, Any]:
    return {
        "chunk_index": -1,
        "content": content,
        "token_count": token_count,
        "is_scene_break": is_scene_break,
        "_scene_id": scene_id,
        "_base_content": content,
    }
