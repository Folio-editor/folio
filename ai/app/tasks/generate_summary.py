"""회차 본문 → LLM 요약 → episode_summary UPSERT."""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime

from sqlalchemy.dialects.postgresql import insert as pg_insert

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.celery_app import celery_app
from app.config import settings
from app.db.models.episode_summary import EpisodeSummary
from app.services.providers import get_llm
from app.services.text_extractor import extract_plain_text

SYSTEM_PROMPT = (
    "당신은 웹소설 회차 요약 전문가입니다. "
    "주어진 회차 본문을 분석하여 JSON 형식으로 요약 결과를 반환하세요."
)

SCHEMA_HINT = """{
  "summary": "string — 3~5문장 회차 줄거리 요약",
  "characters": {
    "existing": ["기존 등장인물 이름 목록"],
    "new": ["이번 회차에 새로 등장한 인물 이름 목록"]
  },
  "newTerms": ["새로운 용어/지명/아이템 등"],
  "foreshadowingCandidates": ["복선이 될 수 있는 요소"]
}"""


async def _run(episode_id: str, work_id: str, writer_id: str, content: str) -> dict:
    llm = get_llm()

    user_prompt = f"아래 회차 본문을 분석하세요:\n\n{extract_plain_text(content)}"
    result = await llm.generate_json(SYSTEM_PROMPT, user_prompt, SCHEMA_HINT)

    raw_json = json.dumps(result, ensure_ascii=False)
    summary_text = result.get("summary", "")

    ep_uuid = uuid.UUID(episode_id)
    wk_uuid = uuid.UUID(work_id)
    wr_uuid = uuid.UUID(writer_id)

    engine = create_async_engine(settings.database_url, pool_size=1)
    try:
        async with AsyncSession(engine) as session:
            async with session.begin():
                stmt = pg_insert(EpisodeSummary).values(
                    episode_id=ep_uuid,
                    work_id=wk_uuid,
                    writer_id=wr_uuid,
                    summary=summary_text,
                    model_used=type(llm).__name__,
                    raw_result=raw_json,
                ).on_conflict_do_update(
                    index_elements=["episode_id"],
                    set_={
                        "summary": summary_text,
                        "model_used": type(llm).__name__,
                        "raw_result": raw_json,
                        "updated_at": datetime.utcnow(),
                    },
                )
                await session.execute(stmt)
    finally:
        await engine.dispose()

    return {
        "episode_id": episode_id,
        "work_id": work_id,
        "writer_id": writer_id,
        "result": result,
    }


@celery_app.task(
    name="app.tasks.generate_summary",
    bind=True,
    autoretry_for=(Exception,),
    max_retries=3,
    retry_backoff=True,
)
def generate_summary_task(self, episode_id: str, work_id: str, writer_id: str, content: str) -> dict:
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_run(episode_id, work_id, writer_id, content))
    finally:
        loop.close()
