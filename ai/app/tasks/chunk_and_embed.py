"""회차 본문을 청킹 → 임베딩 → episode_chunk UPSERT."""

from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.celery_app import celery_app
from app.db.models.episode_chunk import EpisodeChunk
from app.db.session import async_session
from app.services.chunker import chunk_text, count_tokens
from app.services.providers import get_embedder


async def _run(episode_id: str, work_id: str, writer_id: str, content: str) -> int:
    embedder = get_embedder()
    chunks = chunk_text(content)
    if not chunks:
        return 0

    vectors = await embedder.embed_batch(chunks)

    async with async_session() as session:
        async with session.begin():
            # 기존 청크 삭제 후 새로 삽입 (episode 단위 전체 교체)
            await session.execute(
                delete(EpisodeChunk).where(EpisodeChunk.episode_id == uuid.UUID(episode_id))
            )

            rows = []
            for i, (text, vec) in enumerate(zip(chunks, vectors, strict=True)):
                rows.append({
                    "episode_id": uuid.UUID(episode_id),
                    "work_id": uuid.UUID(work_id),
                    "writer_id": uuid.UUID(writer_id),
                    "chunk_index": i,
                    "content": text,
                    "embedding": vec,
                    "token_count": count_tokens(text),
                })

            if rows:
                await session.execute(pg_insert(EpisodeChunk).values(rows))

    return len(chunks)


@celery_app.task(
    name="app.tasks.chunk_and_embed",
    bind=True,
    autoretry_for=(Exception,),
    max_retries=3,
    retry_backoff=True,
)
def chunk_and_embed_task(self, episode_id: str, work_id: str, writer_id: str, content: str) -> dict:
    count = asyncio.get_event_loop().run_until_complete(
        _run(episode_id, work_id, writer_id, content)
    )
    return {"episode_id": episode_id, "chunk_count": count}
