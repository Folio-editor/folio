"""POST /v1/quick/spellcheck — 맞춤법 검사 + 결과를 extraction_suggestion(spelling_batch) 큐로 적재.

기존 /v1/spellcheck 와 동일한 LLM 호출 후, propose_spelling_fix_batch 도구를 직접 호출해
DB INSERT 까지 한 번에 처리. 카드 모드 사용자가 SuggestionInbox 또는 카드 내부에서 [적용]/
[거절] 을 선택할 수 있도록 하는 통합 흐름의 백엔드 진입점.

비용: Haiku 1회 (~5 크레딧). 큐 적재 (DB INSERT) 는 LLM 비용 없음.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.spellcheck import (
    SPELLCHECK_SCHEMA_HINT,
    SPELLCHECK_SYSTEM_PROMPT,
    _build_summary,
    _normalize_spellcheck_result,
)
from app.config import settings
from app.db.session import get_session
from app.mcp.context import WriterContext
from app.mcp.tools.proposals import propose_spelling_fix_batch
from app.middleware.auth import require_internal_api_key
from app.schemas.ai_context_payload import AiContextPayload
from app.services.providers import get_llm
from app.services.spellcheck_whitelist import (
    collect_spellcheck_whitelist,
    filter_whitelisted_issues,
)
from app.services.text_extractor import extract_numbered_text

router = APIRouter(
    prefix="/quick/spellcheck",
    tags=["quick"],
    dependencies=[Depends(require_internal_api_key)],
)


class QuickSpellcheckRequest(BaseModel):
    work_id: UUID
    writer_id: UUID
    episode_id: UUID
    content: str
    context: AiContextPayload


@router.post("")
async def quick_spellcheck(
    req: QuickSpellcheckRequest,
    session: AsyncSession = Depends(get_session),
):
    """맞춤법 검사 + spelling_batch suggestion 적재 통합 흐름.

    응답 형식:
      - issues / summary / usage : /v1/spellcheck 와 동일
      - suggestion_id : 적재된 extraction_suggestion 행 id (issues 가 0건이면 None)
      - suggestion_error : 적재 실패 시 사유 (정상 시 누락)
    """
    # 1) 기존 spellcheck 흐름 그대로 — Haiku 호출 + whitelist 필터 + 정규화
    numbered_content = extract_numbered_text(req.content)
    whitelist = collect_spellcheck_whitelist(req.context)
    whitelist_block = "\n".join(f"- {name}" for name in sorted(whitelist))
    if not whitelist_block:
        whitelist_block = "- 없음"

    user_prompt = (
        "## 보호할 고유명사\n"
        f"{whitelist_block}\n\n"
        "위 고유명사와 조사 결합형은 오류로 보고하지 마십시오.\n\n"
        "## 검사할 원고\n"
        f"{numbered_content}"
    )

    llm = get_llm()
    raw = await llm.generate_json(
        system=SPELLCHECK_SYSTEM_PROMPT,
        user=user_prompt,
        schema_hint=SPELLCHECK_SCHEMA_HINT,
        model_override=settings.claude_haiku_model,
        max_tokens=3000,
    )

    normalized = _normalize_spellcheck_result(raw)
    issues = filter_whitelisted_issues(list(normalized.get("issues", [])), whitelist)
    normalized["issues"] = issues
    normalized["summary"] = _build_summary(issues)
    normalized["usage"] = llm.last_usage
    normalized["suggestion_id"] = None

    if not issues:
        # 오류 0건 — 큐 적재 X (사용자에게 빈 batch 카드를 만들어 줄 이유 없음)
        return normalized

    # 2) propose_spelling_fix_batch 도구 호출 — extraction_suggestion(spelling_batch) INSERT
    fixes = [
        {
            "line": it["line"],
            "original": it["original"],
            "suggestion": it["suggestion"],
            "fix_type": it["type"],
            "reason": it.get("reason"),
        }
        for it in issues
    ]
    ctx = WriterContext(writer_id=req.writer_id, work_id=req.work_id)
    propose_result = await propose_spelling_fix_batch(
        session,
        ctx,
        episode_id=str(req.episode_id),
        fixes=fixes,
    )
    if isinstance(propose_result, dict) and "error" in propose_result:
        # 적재 실패해도 issues 자체는 반환 — 카드 인라인 표시는 가능
        normalized["suggestion_error"] = propose_result["error"]
        return normalized

    suggestion_id = (
        propose_result.get("suggestion_id")
        if isinstance(propose_result, dict)
        else None
    )
    if not suggestion_id:
        normalized["suggestion_error"] = "suggestion_id_missing"
        return normalized

    await session.commit()
    normalized["suggestion_id"] = suggestion_id
    return normalized
