"""MCP 도구: 에피소드 청크 벡터 유사도 검색."""

from __future__ import annotations

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.providers import get_embedder


async def search_episode_chunks(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    query: str,
    k: int = 5,
) -> list[dict]:
    embedder = get_embedder()
    vecs = await embedder.embed_batch([query])
    if not vecs:
        return []

    vec_str = "[" + ",".join(str(v) for v in vecs[0]) + "]"

    r = await session.execute(
        sa_text(
            "SELECT content, 1 - (embedding <=> cast(:vec AS vector)) AS similarity "
            "FROM episode_chunk "
            "WHERE work_id = :wid AND writer_id = :wr "
            "ORDER BY embedding <=> cast(:vec AS vector) "
            "LIMIT :k"
        ),
        {"vec": vec_str, "wid": ctx.work_id, "wr": ctx.writer_id, "k": k},
    )
    return [
        {"content": row[0], "similarity": round(float(row[1]), 4)}
        for row in r.fetchall()
    ]
