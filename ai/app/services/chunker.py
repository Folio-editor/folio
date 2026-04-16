from __future__ import annotations

import tiktoken

_enc = tiktoken.get_encoding("cl100k_base")

MIN_TOKENS = 500
MAX_TOKENS = 1000


def count_tokens(text: str) -> int:
    return len(_enc.encode(text))


def chunk_text(text: str, min_tokens: int = MIN_TOKENS, max_tokens: int = MAX_TOKENS) -> list[str]:
    """본문을 단락 기반으로 500~1,000 토큰 청크로 분할한다."""
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    if not paragraphs:
        return []

    chunks: list[str] = []
    buf: list[str] = []
    buf_tokens = 0

    for para in paragraphs:
        para_tokens = count_tokens(para)

        # 단일 단락이 max_tokens를 초과하면 문장 단위로 분할
        if para_tokens > max_tokens:
            if buf:
                chunks.append("\n\n".join(buf))
                buf, buf_tokens = [], 0
            chunks.extend(_split_long_paragraph(para, max_tokens))
            continue

        if buf_tokens + para_tokens > max_tokens:
            chunks.append("\n\n".join(buf))
            buf, buf_tokens = [], 0

        buf.append(para)
        buf_tokens += para_tokens

    if buf:
        # 마지막 청크가 너무 짧으면 이전 청크에 합침
        last = "\n\n".join(buf)
        if chunks and count_tokens(last) < min_tokens:
            chunks[-1] = chunks[-1] + "\n\n" + last
        else:
            chunks.append(last)

    return chunks


def _split_long_paragraph(para: str, max_tokens: int) -> list[str]:
    """max_tokens를 초과하는 단락을 문장 단위로 분할."""
    sentences = _split_sentences(para)
    chunks: list[str] = []
    buf: list[str] = []
    buf_tokens = 0

    for sent in sentences:
        sent_tokens = count_tokens(sent)
        if buf_tokens + sent_tokens > max_tokens and buf:
            chunks.append(" ".join(buf))
            buf, buf_tokens = [], 0
        buf.append(sent)
        buf_tokens += sent_tokens

    if buf:
        chunks.append(" ".join(buf))
    return chunks


def _split_sentences(text: str) -> list[str]:
    """마침표/물음표/느낌표 기준 문장 분리. 한국어·영어 혼용 대응."""
    import re
    parts = re.split(r"(?<=[.!?。])\s+", text)
    return [p for p in parts if p.strip()]
