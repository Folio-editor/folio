"""generate_summary 결과에서 인물/용어/복선 후보를 extraction_suggestion에 UPSERT."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.celery_app import celery_app
from app.config import settings
from app.db.models.extraction_suggestion import ExtractionSuggestion


def _build_rows(
    episode_id: str, work_id: str, writer_id: str, result: dict,
) -> list[dict]:
    ep = uuid.UUID(episode_id)
    wk = uuid.UUID(work_id)
    wr = uuid.UUID(writer_id)
    rows: list[dict] = []

    characters = result.get("characters", {})
    for name in characters.get("new", []):
        rows.append({
            "episode_id": ep,
            "work_id": wk,
            "writer_id": wr,
            "entity_type": "character",
            "suggested_name": name,
            "payload": {"source": "summary", "episode_id": episode_id},
        })

    for term in result.get("newTerms", []):
        rows.append({
            "episode_id": ep,
            "work_id": wk,
            "writer_id": wr,
            "entity_type": "term",
            "suggested_name": term,
            "payload": {"source": "summary", "episode_id": episode_id},
        })

    for hint in result.get("foreshadowingCandidates", []):
        rows.append({
            "episode_id": ep,
            "work_id": wk,
            "writer_id": wr,
            "entity_type": "foreshadowing",
            "suggested_name": hint[:200],
            "payload": {"source": "summary", "episode_id": episode_id, "text": hint},
        })

    return rows


async def _run(episode_id: str, work_id: str, writer_id: str, result: dict) -> int:
    rows = _build_rows(episode_id, work_id, writer_id, result)
    if not rows:
        return 0

    engine = create_async_engine(settings.database_url, pool_size=1)
    try:
        async with AsyncSession(engine) as session:
            async with session.begin():
                for row in rows:
                    stmt = pg_insert(ExtractionSuggestion).values(**row).on_conflict_do_update(
                        constraint="extraction_suggestion_work_id_entity_type_suggested_name_key",
                        set_={
                            "episode_id": row["episode_id"],
                            "payload": row["payload"],
                            "updated_at": datetime.utcnow(),
                        },
                    )
                    await session.execute(stmt)
    finally:
        await engine.dispose()

    return len(rows)


@celery_app.task(
    name="app.tasks.extract_items",
    bind=True,
    autoretry_for=(Exception,),
    max_retries=3,
    retry_backoff=True,
)
def extract_items_task(self, prev: dict) -> dict:
    """prev = generate_summary_task의 리턴값 (chain에서 자동 전달)."""
    episode_id = prev["episode_id"]
    work_id = prev["work_id"]
    writer_id = prev["writer_id"]
    result = prev["result"]
    loop = asyncio.new_event_loop()
    try:
        count = loop.run_until_complete(_run(episode_id, work_id, writer_id, result))
    finally:
        loop.close()
    return {"episode_id": episode_id, "suggestion_count": count}
