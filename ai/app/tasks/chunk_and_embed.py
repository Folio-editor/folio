"""회차 본문을 청킹 → 임베딩 → episode_chunk UPSERT."""

from __future__ import annotations

import asyncio
import uuid

import structlog
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.celery_app import celery_app
from app.config import settings
from app.db.models.episode_chunk import EpisodeChunk
from app.services.chunker import chunk_text, count_tokens
from app.services.providers import get_embedder
from app.services.text_extractor import extract_plain_text

logger = structlog.get_logger(__name__)


async def _run(episode_id: str, work_id: str, writer_id: str, content: str) -> int:
    embedder = get_embedder()
    chunks = chunk_text(extract_plain_text(content))
    if not chunks:
        return 0

    vectors = await embedder.embed_batch(chunks)

    engine = create_async_engine(settings.database_url, pool_size=1)
    try:
        async with AsyncSession(engine) as session:
            async with session.begin():
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
    finally:
        await engine.dispose()

    return len(chunks)


@celery_app.task(
    name="app.tasks.chunk_and_embed",
    bind=True,
    autoretry_for=(Exception,),
    max_retries=3,
    retry_backoff=True,
)
def chunk_and_embed_task(self, episode_id: str, work_id: str, writer_id: str, content: str) -> dict:
    # content 본문은 절대 로그 필드로 전달하지 않는다. 길이/ID만 기록.
    logger.info(
        "chunk_embed.start",
        episode_id=episode_id,
        work_id=work_id,
        content_length=len(content) if content else 0,
    )
    loop = asyncio.new_event_loop()
    try:
        count = loop.run_until_complete(_run(episode_id, work_id, writer_id, content))
        logger.info(
            "chunk_embed.success",
            episode_id=episode_id,
            chunk_count=count,
        )
        return {"episode_id": episode_id, "chunk_count": count}
    except Exception as e:
        logger.error(
            "chunk_embed.failed",
            episode_id=episode_id,
            retry=self.request.retries,
            max_retries=self.max_retries,
            error_type=type(e).__name__,
            error_message=str(e)[:200],
        )
        raise
    finally:
        loop.close()
