"""MCP 도구: 회차 본문 평문 fetch + 회차 메타 목록 + Haiku 매개 분석 (Phase 4.5+).

- list_episodes      : episode 테이블 직접 조회 — 요약 유무 무관 모든 회차 노출
- fetch_episode_plaintext : 본문 평문 (Vault Transit 경유) — 재작성·인용 시
- analyze_episode    : 본문 fetch + Haiku 자유 task 추출 (양식 외 분석)
- summarize_episode  : 본문 fetch + Haiku 12-필드 양식 요약 + episode_summary UPSERT (Phase 4.6)
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.episode_summary import EpisodeSummary
from app.mcp.context import WriterContext
from app.services.decrypt_resolver import (
    DecryptResolverError,
    decrypt_rows,
)
from app.services.encrypt_resolver import (
    EncryptResolverError,
    encrypt_summary_text_fields,
    summary_text_fields,
)
from app.services.providers import get_llm
from app.services.work_key_resolver import (
    WorkKeyResolverError,
    resolve_episode_plaintext,
)


async def list_episodes(
    session: AsyncSession,
    ctx: WriterContext,
) -> list[dict[str, Any]]:
    """작품의 모든 회차 메타 (episode 테이블 직접). 요약 유무 무관.

    반환: [{sort_order, title, status, word_count, has_summary}].
    title 은 v1: 암호문이면 backend Vault 경유 복호화.
    """
    r = await session.execute(
        sa_text(
            "SELECT ep.id, ep.title, ep.status, ep.word_count, ep.sort_order, "
            "       (es.episode_id IS NOT NULL) AS has_summary "
            "FROM episode ep "
            "LEFT JOIN episode_summary es ON es.episode_id = ep.id "
            "WHERE ep.work_id = :wid AND ep.writer_id = :wr "
            "ORDER BY ep.sort_order ASC"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id},
    )
    rows = [
        {
            "id": str(row[0]),
            "title": row[1],
            "status": row[2],
            "word_count": row[3],
            "sort_order": row[4],
            "has_summary": bool(row[5]),
        }
        for row in r.fetchall()
    ]
    try:
        rows = await decrypt_rows(ctx.work_id, rows, ["title"])
    except DecryptResolverError:
        # 복호화 실패 — 회차 존재 자체는 alle 노출 (agent 가 '없다' 단정 못 하도록)
        for r in rows:
            t = r.get("title")
            if isinstance(t, str) and t.startswith("v1:"):
                r["title"] = "(제목 암호화 미해제)"
    # id 는 LLM 노출 불필요 (sort_order 로 충분)
    return [
        {k: v for k, v in r.items() if k != "id"}
        for r in rows
    ]


async def fetch_episode_plaintext(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    sort_order: int,
) -> dict[str, Any]:
    r = await session.execute(
        sa_text(
            "SELECT id, title FROM episode "
            "WHERE work_id = :wid AND writer_id = :wr AND sort_order = :so LIMIT 1"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id, "so": sort_order},
    )
    row = r.fetchone()
    if row is None:
        return {"error": "episode_not_found", "sort_order": sort_order}

    episode_id, title = row[0], row[1]
    try:
        content = await resolve_episode_plaintext(str(episode_id), str(ctx.work_id))
    except WorkKeyResolverError as e:
        return {"error": "no_plaintext", "reason": str(e), "sort_order": sort_order}

    return {
        "sort_order": sort_order,
        "title": title,
        "content": content,
        "word_count": len(content),
    }


_ANALYZE_SYSTEM = (
    "당신은 회차 본문 분석 worker 입니다. 주어진 task 에 따라 본문에서 핵심만 추출해 "
    "JSON 으로 반환합니다. 추측·확장 금지. 본문에 명시된 내용만."
)


async def analyze_episode(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    sort_order: int,
    task: str,
) -> dict[str, Any]:
    """회차 평문 fetch + Haiku 가 task 별 추출. Sonnet 비용 ~70% 절감.

    예시 task:
      - "등장 인물별 페르소나 (이름·성격·외형) 추출"
      - "이번 화 핵심 사건 시간순 정리"
      - "심어진 복선·회수된 복선 추출"

    Sonnet 은 raw 본문 대신 Haiku 압축본만 받음 → 토큰 누적 폭주 방지.
    """
    # 1) 본문 fetch (재사용)
    text_result = await fetch_episode_plaintext(session, ctx, sort_order=sort_order)
    if "error" in text_result:
        return text_result
    plaintext = text_result["content"]

    # 2) Haiku 분석
    llm = get_llm()
    haiku_model = getattr(llm, "_haiku_model", None)
    if haiku_model is None:
        # Fake provider — 평문 그대로 반환 (테스트 모드)
        return {
            "sort_order": sort_order,
            "title": text_result["title"],
            "task": task,
            "analysis": plaintext[:2000],
            "usage": {"input_tokens": 0, "output_tokens": 0},
        }
    user_prompt = (
        f"[task]\n{task}\n\n"
        f"[회차 {sort_order} — {text_result['title']}]\n{plaintext}"
    )
    schema_hint = '{"analysis": "object or string — task 결과만 담을 것"}'
    try:
        result = await llm.generate_json(
            _ANALYZE_SYSTEM,
            user_prompt,
            schema_hint,
            model_override=haiku_model,
            max_tokens=2000,
        )
    except Exception as e:
        return {"error": "haiku_analysis_failed", "reason": str(e)[:200]}

    usage = getattr(llm, "last_usage", {"input_tokens": 0, "output_tokens": 0})
    return {
        "sort_order": sort_order,
        "title": text_result["title"],
        "task": task,
        "analysis": result.get("analysis") if isinstance(result, dict) else result,
        "usage": usage,
        "word_count": len(plaintext),
    }


# ============================================================
# summarize_episode — 12-필드 schema + episode_summary UPSERT (Phase 4.6)
# ============================================================

_SUMMARIZE_SYSTEM = (
    "당신은 웹소설 회차 메타 분석 worker 입니다. 회차 본문을 분석해 향후 일관성 검수, "
    "다음 회차 초안 생성, 작가 검색에 사용할 풍부한 메타데이터를 JSON 으로 추출합니다.\n"
    "추출 원칙:\n"
    "- 본문에 명시된 정보만 (추측·확장 금지)\n"
    "- 인물·장소 이름은 본문 표기 그대로\n"
    "- 핵심 사건은 시간순 정렬\n"
    "- 복선은 작가 의도 명확한 것만 (모호한 묘사 제외)\n"
    "- present_characters: 고유 명칭 인물만 (무명 군중 제외)\n"
    "- present_locations: 주요 무대만 (일상 공간 제외)\n"
    "- summary: 3 문장 이내 (cliffhanger 가 끝점 별도 보존하므로 결말 반복 금지)"
)

_SUMMARIZE_SCHEMA = """{
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
  "foreshadow_paid_off": [{"name": "string"}],
  "keywords": ["5~10개"]
}"""


async def summarize_episode(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    sort_order: int,
    force_regenerate: bool = False,
) -> dict[str, Any]:
    """회차 본문 → Haiku 12-필드 양식 요약 + episode_summary UPSERT (부산물).

    부산물 캐시 hit 동작:
      - 기존 episode_summary 행이 있고 (ep.updated_at <= es.last_generated_at) 이면
        Haiku 재호출 없이 캐시 반환 (force_regenerate=True 면 무시).
      - stale (본문 수정 후) 또는 미생성 시 Haiku 1회 호출 → UPSERT.

    과금: agent run 의 Haiku 토큰만 청구 (이 경로는 generate_summary_task 미경유 →
    feature='episode_summary' 영수증 별도 발행 X. 이중 청구 없음).

    반환: 12-필드 schema 결과 + {sort_order, title, cached, generation_count, usage}.
    """
    r = await session.execute(
        sa_text(
            "SELECT ep.id, ep.title, ep.updated_at, "
            "       es.last_generated_at, es.generation_count, "
            "       es.oneline_summary, es.summary, es.pov_character, "
            "       es.present_characters, es.present_locations, es.key_events, "
            "       es.time_progression, es.tone, es.cliffhanger, "
            "       es.foreshadow_planted, es.foreshadow_paid_off, es.keywords "
            "FROM episode ep "
            "LEFT JOIN episode_summary es ON es.episode_id = ep.id "
            "WHERE ep.work_id = :wid AND ep.writer_id = :wr AND ep.sort_order = :so LIMIT 1"
        ),
        {"wid": ctx.work_id, "wr": ctx.writer_id, "so": sort_order},
    )
    row = r.fetchone()
    if row is None:
        return {"error": "episode_not_found", "sort_order": sort_order}

    episode_id, title, ep_updated, es_last_gen = row[0], row[1], row[2], row[3]
    cache_hit = (
        es_last_gen is not None
        and ep_updated is not None
        and ep_updated <= es_last_gen
        and not force_regenerate
    )
    if cache_hit:
        cached = {
            "sort_order": sort_order,
            "title": title,
            "cached": True,
            "generation_count": int(row[4] or 0),
            "oneline_summary": row[5],
            "summary": row[6],
            "pov_character": row[7],
            "present_characters": row[8],
            "present_locations": row[9],
            "key_events": row[10],
            "time_progression": row[11],
            "tone": row[12],
            "cliffhanger": row[13],
            "foreshadow_planted": row[14],
            "foreshadow_paid_off": row[15],
            "keywords": row[16],
            "usage": {"input_tokens": 0, "output_tokens": 0},
        }
        # Phase 4.6: 자유형 텍스트 필드 일괄 복호화 (JSONB 는 평문 유지)
        try:
            decrypted = await decrypt_rows(ctx.work_id, [cached], list(summary_text_fields()))
            return decrypted[0]
        except DecryptResolverError:
            for fn in summary_text_fields():
                v = cached.get(fn)
                if isinstance(v, str) and v.startswith("v1:"):
                    cached[fn] = "(암호화 미해제)"
            return cached

    try:
        plaintext = await resolve_episode_plaintext(str(episode_id), str(ctx.work_id))
    except WorkKeyResolverError as e:
        return {"error": "no_plaintext", "reason": str(e), "sort_order": sort_order}

    llm = get_llm()
    haiku_model = getattr(llm, "_haiku_model", None)
    user_prompt = f"[회차 {sort_order} — {title}]\n\n{plaintext}"
    try:
        result = await llm.generate_json(
            _SUMMARIZE_SYSTEM,
            user_prompt,
            _SUMMARIZE_SCHEMA,
            model_override=haiku_model,
            max_tokens=2000,
        )
    except Exception as e:
        return {"error": "haiku_summarize_failed", "reason": str(e)[:200]}

    if not isinstance(result, dict):
        return {"error": "haiku_invalid_response", "sort_order": sort_order}

    summary_text = result.get("summary") or ""
    if not summary_text:
        return {"error": "missing_summary_field", "sort_order": sort_order}

    content_hash = hashlib.sha256(plaintext.encode("utf-8")).hexdigest()
    now = datetime.utcnow()
    # Phase 4.6: pov_character / tone 은 SQL 매칭 의존 — 평문 유지 (암호화 대상 제외)
    plain_values = {
        "oneline_summary": result.get("oneline_summary"),
        "summary": summary_text,
        "time_progression": result.get("time_progression"),
        "cliffhanger": result.get("cliffhanger"),
    }
    # Phase 4.6: 자유형 텍스트 필드 암호화 (사용자 원고 기반 정보).
    try:
        encrypted_text = await encrypt_summary_text_fields(ctx.work_id, plain_values)
    except EncryptResolverError as e:
        return {"error": "encrypt_failed", "reason": str(e)[:200], "sort_order": sort_order}

    values = {
        "episode_id": episode_id,
        "work_id": ctx.work_id,
        "writer_id": ctx.writer_id,
        "oneline_summary": encrypted_text.get("oneline_summary"),
        "summary": encrypted_text.get("summary"),
        "pov_character": result.get("pov_character"),     # 평문 (SQL 매칭)
        "present_characters": result.get("present_characters"),
        "present_locations": result.get("present_locations"),
        "key_events": result.get("key_events"),
        "time_progression": encrypted_text.get("time_progression"),
        "tone": result.get("tone"),                        # 평문 (SQL 매칭)
        "cliffhanger": encrypted_text.get("cliffhanger"),
        "foreshadow_planted": result.get("foreshadow_planted"),
        "foreshadow_paid_off": result.get("foreshadow_paid_off"),
        "referenced_world_notes": result.get("referenced_world_notes"),
        "keywords": result.get("keywords"),
        "word_count": len(plaintext),
        "model_used": f"agent:{type(llm).__name__}",
        "raw_result": None,    # Phase 4.6: raw 평문 dict 저장 금지 (재암호화 비용 회피)
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

    usage = getattr(llm, "last_usage", {"input_tokens": 0, "output_tokens": 0})
    # 반환값은 LLM 이 즉시 사용 — 평문 (plain_values) 유지. DB 에는 ciphertext 적재됨.
    return {
        "sort_order": sort_order,
        "title": title,
        "cached": False,
        "generation_count": (int(row[4] or 0)) + 1,
        "oneline_summary": plain_values["oneline_summary"],
        "summary": plain_values["summary"],
        "pov_character": result.get("pov_character"),
        "present_characters": result.get("present_characters"),
        "present_locations": result.get("present_locations"),
        "key_events": result.get("key_events"),
        "time_progression": plain_values["time_progression"],
        "tone": result.get("tone"),
        "cliffhanger": plain_values["cliffhanger"],
        "foreshadow_planted": result.get("foreshadow_planted"),
        "foreshadow_paid_off": result.get("foreshadow_paid_off"),
        "keywords": result.get("keywords"),
        "usage": usage,
    }
