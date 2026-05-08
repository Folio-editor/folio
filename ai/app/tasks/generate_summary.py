"""회차 본문 → Haiku LLM 메타 추출 → episode_summary UPSERT.

v2 (curious-wiggling-thacker plan R-3, R-2):
  - 풍부한 회차 메타 12 필드 (oneline_summary / pov_character / present_characters /
    present_locations / key_events / time_progression / tone / cliffhanger /
    foreshadow_planted / foreshadow_paid_off / referenced_world_notes / keywords)
  - 폭주 가드 4 (content_hash, generation_count, last_generated_at, raw_result JSONB 저장)
  - Vault Transit content=None 호환 (chunk_and_embed 패턴 동일)
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.celery_app import celery_app
from app.config import settings
from app.db.models.episode_summary import EpisodeSummary
from app.services.encrypt_resolver import (
    EncryptResolverError,
    encrypt_summary_text_fields,
)
from app.services.providers import get_llm
from app.services.text_extractor import extract_plain_text
from app.services.work_key_resolver import (
    WorkKeyResolverError,
    resolve_episode_plaintext,
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "당신은 웹소설 회차 메타 분석 전문가입니다. "
    "회차 본문을 분석하여 향후 AI 가 회차 간 일관성 검수, 다음 회차 초안 생성, "
    "작가 검색에 사용할 풍부한 메타데이터를 JSON 으로 추출합니다.\n\n"
    "추출 원칙:\n"
    "- 본문에 명시된 정보만 사용 (추측·확장 금지)\n"
    "- 인물·장소 이름은 본문 표기 그대로 (별칭 매핑 금지)\n"
    "- 핵심 사건은 시간순 정렬\n"
    "- 복선 candidates 는 작가 의도 명확한 것만 (모호한 묘사 제외)\n"
    # Phase 3 R-K — 노이즈 제거 정책
    "- present_characters: 고유 명칭 있는 인물만. '도사들'·'시녀들' 같은 무명 군중 제외.\n"
    "- present_locations: 작품 전개의 주요 무대만. '화장실'·'편의점' 같은 일상 공간 제외.\n"
    "- summary: 3 문장 이내로 압축 (cliffhanger 가 끝점 별도 보존하므로 결말 반복 금지)."
)

SCHEMA_HINT = """{
  "oneline_summary": "string (15~30자)",
  "summary": "string (3 문장)",
  "pov_character": "string | null",
  "present_characters": ["고유명 인물만"],
  "present_locations": ["주요 무대만"],
  "key_events": [{"order": 1, "event": "string"}],
  "time_progression": "string",
  "tone": "string",
  "cliffhanger": "string | null",
  "foreshadow_planted": [{"name": "string", "description": "string"}],
  "keywords": ["5~10개"]
}"""


def _compute_content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _extract_field(result: dict, key: str, default: Any = None) -> Any:
    """LLM 응답에서 안전하게 필드 추출. 누락 시 default."""
    val = result.get(key)
    return val if val is not None else default


async def _run(
    episode_id: str,
    work_id: str,
    writer_id: str,
    content: str | None,
) -> dict:
    # Vault Transit 경로: content None → AI 서버가 직접 평문 fetch
    if content is None:
        try:
            content = await resolve_episode_plaintext(episode_id, work_id)
        except WorkKeyResolverError as e:
            logger.warning(
                "generate_summary.skip_no_plaintext",
                extra={"episode_id": episode_id, "reason": str(e)},
            )
            return {"episode_id": episode_id, "status": "skipped", "reason": "no_plaintext"}

    plain = extract_plain_text(content)
    content_hash = _compute_content_hash(plain)
    word_count = len(plain)

    llm = get_llm()
    user_prompt = f"아래 회차 본문을 분석하세요:\n\n{plain}"
    result = await llm.generate_json(SYSTEM_PROMPT, user_prompt, SCHEMA_HINT, max_tokens=1500)

    summary_text = _extract_field(result, "summary", "")
    if not summary_text:
        # summary 누락 시 episode_summary.summary NOT NULL 위반 — fail 처리
        raise ValueError("LLM response missing required 'summary' field")

    ep_uuid = uuid.UUID(episode_id)
    wk_uuid = uuid.UUID(work_id)
    wr_uuid = uuid.UUID(writer_id)
    now = datetime.utcnow()

    # Phase 4.6: 자유형 서사 텍스트만 암호화. pov_character / tone 은 SQL 매칭 의존 → 평문.
    plain_text_fields = {
        "oneline_summary": _extract_field(result, "oneline_summary"),
        "summary": summary_text,
        "time_progression": _extract_field(result, "time_progression"),
        "cliffhanger": _extract_field(result, "cliffhanger"),
    }
    try:
        enc_text = await encrypt_summary_text_fields(work_id, plain_text_fields)
    except EncryptResolverError as e:
        logger.warning(
            "generate_summary.skip_no_encrypt",
            extra={"episode_id": episode_id, "reason": str(e)},
        )
        return {"episode_id": episode_id, "status": "skipped", "reason": "no_encrypt"}

    engine = create_async_engine(settings.database_url, pool_size=1)
    try:
        async with AsyncSession(engine) as session:
            async with session.begin():
                values = {
                    "episode_id": ep_uuid,
                    "work_id": wk_uuid,
                    "writer_id": wr_uuid,
                    "oneline_summary": enc_text.get("oneline_summary"),
                    "summary": enc_text.get("summary"),
                    "pov_character": _extract_field(result, "pov_character"),  # 평문
                    "present_characters": _extract_field(result, "present_characters"),
                    "present_locations": _extract_field(result, "present_locations"),
                    "key_events": _extract_field(result, "key_events"),
                    "time_progression": enc_text.get("time_progression"),
                    "tone": _extract_field(result, "tone"),                    # 평문
                    "cliffhanger": enc_text.get("cliffhanger"),
                    "foreshadow_planted": _extract_field(result, "foreshadow_planted"),
                    "foreshadow_paid_off": _extract_field(result, "foreshadow_paid_off"),
                    "referenced_world_notes": _extract_field(result, "referenced_world_notes"),
                    "keywords": _extract_field(result, "keywords"),
                    "word_count": word_count,
                    "model_used": type(llm).__name__,
                    "raw_result": None,    # Phase 4.6: 평문 dict 저장 금지
                    "content_hash": content_hash,
                    "generation_count": 1,
                    "last_generated_at": now,
                }
                stmt = pg_insert(EpisodeSummary).values(**values).on_conflict_do_update(
                    index_elements=["episode_id"],
                    set_={
                        **{k: v for k, v in values.items() if k not in ("episode_id", "work_id", "writer_id", "generation_count")},
                        "generation_count": EpisodeSummary.__table__.c.generation_count + 1,
                        "updated_at": now,
                    },
                )
                await session.execute(stmt)
    finally:
        await engine.dispose()

    return {
        "episode_id": episode_id,
        "work_id": work_id,
        "writer_id": writer_id,
        "content_hash": content_hash,
        "status": "ok",
    }


@celery_app.task(
    name="app.tasks.generate_summary",
    bind=True,
    autoretry_for=(Exception,),
    max_retries=3,
    retry_backoff=True,
)
def generate_summary_task(
    self,
    episode_id: str,
    work_id: str,
    writer_id: str,
    content: str | None,
) -> dict:
    # 본문 평문은 절대 로그로 노출하지 않는다.
    logger.info(
        "generate_summary.start",
        extra={
            "episode_id": episode_id,
            "work_id": work_id,
            "content_length": len(content) if content else 0,
        },
    )
    loop = asyncio.new_event_loop()
    try:
        out = loop.run_until_complete(_run(episode_id, work_id, writer_id, content))
        logger.info(
            "generate_summary.success",
            extra={"episode_id": episode_id, "status": out.get("status")},
        )
        return out
    except Exception as e:
        logger.error(
            "generate_summary.failed",
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
