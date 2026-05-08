"""회차 본문을 청킹 → 임베딩 → episode_chunk UPSERT."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import uuid

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.celery_app import celery_app
from app.config import settings
from app.db.models.episode_chunk import EpisodeChunk
from app.services.chunker import chunk_text, count_tokens
from app.services.encrypt_resolver import EncryptResolverError, encrypt_fields
from app.services.providers import get_embedder
from app.services.text_extractor import extract_plain_text
from app.services.work_key_resolver import (
    WorkKeyResolverError,
    resolve_episode_plaintext,
)

# stdlib logger를 사용한다. configure_logging()이 설정한 JSON 포맷터가
# 모든 stdlib 로그에도 적용되므로 extra={}로 전달한 필드가 JSON 출력에 포함된다.
# (structlog 직접 사용은 CI 환경의 twisted/zope.interface 충돌로 피함)
logger = logging.getLogger(__name__)


async def _run(episode_id: str, work_id: str, writer_id: str, content: str | None) -> int:
    # Vault Transit 전환 (curious-wiggling-thacker plan V-7):
    # backend SyncService 가 트리거할 땐 content=None — AI 서버가 직접 평문 fetch.
    # 페이로드로 content 가 전달된 경우 (레거시·테스트) 는 그대로 사용.
    if content is None:
        try:
            content = await resolve_episode_plaintext(episode_id, work_id)
        except WorkKeyResolverError as e:
            logger.warning(
                "chunk_embed.skip_no_plaintext",
                extra={"episode_id": episode_id, "reason": str(e)},
            )
            return 0
    # 본문이 비었거나(작가가 전체 삭제) 청킹 결과가 0이면 기존 청크는 무조건
    # 제거해야 한다. 그렇지 않으면 옛 본문 임베딩이 RAG에 계속 끌려온다.
    plain_for_hash = extract_plain_text(content)
    content_hash = hashlib.sha256(plain_for_hash.encode("utf-8")).hexdigest()
    chunks = chunk_text(plain_for_hash)
    vectors = await get_embedder().embed_batch(chunks) if chunks else []

    # Phase 4.6: chunk content 암호화 (사용자 원고 기반 정보).
    # 임베딩 vector 는 평문 기반 의미 공간 — 암호화 X (검색 동작 유지).
    # token_count 도 평문 기준이지만 운영 메타라 평문 유지.
    encrypted_chunks: list[str] = []
    if chunks:
        try:
            payload = {f"c{i}": chunks[i] for i in range(len(chunks))}
            enc = await encrypt_fields(work_id, payload)
            encrypted_chunks = [enc.get(f"c{i}") or "" for i in range(len(chunks))]
            if any(not v or not v.startswith("v1:") for v in encrypted_chunks):
                # 모두 암호화돼 있어야 정상 — 평문 잔존 시 즉시 fail (DB 평문 적재 차단)
                raise EncryptResolverError("일부 chunk 암호화 누락 — 평문 적재 거부")
        except EncryptResolverError as e:
            logger.warning(
                "chunk_embed.skip_no_encrypt",
                extra={"episode_id": episode_id, "reason": str(e)},
            )
            return 0

    engine = create_async_engine(settings.database_url, pool_size=1)
    try:
        async with AsyncSession(engine) as session:
            async with session.begin():
                await session.execute(
                    delete(EpisodeChunk).where(EpisodeChunk.episode_id == uuid.UUID(episode_id))
                )

                if chunks:
                    rows = [
                        {
                            "episode_id": uuid.UUID(episode_id),
                            "work_id": uuid.UUID(work_id),
                            "writer_id": uuid.UUID(writer_id),
                            "chunk_index": i,
                            "content": encrypted_chunks[i],
                            "embedding": vec,
                            "token_count": count_tokens(text),
                            "content_hash": content_hash,    # 평문 본문 SHA256 (idempotency)
                        }
                        for i, (text, vec) in enumerate(zip(chunks, vectors, strict=True))
                    ]
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
def chunk_and_embed_task(
    self, episode_id: str, work_id: str, writer_id: str, content: str | None
) -> dict:
    # content 본문은 절대 로그 필드로 전달하지 않는다. 길이/ID만 기록.
    logger.info(
        "chunk_embed.start",
        extra={
            "episode_id": episode_id,
            "work_id": work_id,
            "content_length": len(content) if content else 0,
        },
    )
    loop = asyncio.new_event_loop()
    try:
        count = loop.run_until_complete(_run(episode_id, work_id, writer_id, content))
        logger.info(
            "chunk_embed.success",
            extra={"episode_id": episode_id, "chunk_count": count},
        )
        return {"episode_id": episode_id, "chunk_count": count}
    except Exception as e:
        logger.error(
            "chunk_embed.failed",
            extra={
                "episode_id": episode_id,
                "retry": self.request.retries,
                "max_retries": self.max_retries,
                "error_type": type(e).__name__,
                "error_message": str(e)[:200],
            },
        )
        raise
    finally:
        loop.close()
