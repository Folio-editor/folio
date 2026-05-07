"""POST /v1/spellcheck - Korean typo/spacing/punctuation checks only."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import settings
from app.middleware.auth import require_internal_api_key
from app.schemas.ai_context_payload import AiContextPayload
from app.services.providers import get_llm
from app.services.spellcheck_whitelist import (
    collect_spellcheck_whitelist,
    filter_whitelisted_issues,
)
from app.services.text_extractor import extract_numbered_text

router = APIRouter(
    prefix="/spellcheck",
    tags=["spellcheck"],
    dependencies=[Depends(require_internal_api_key)],
)

SPELLCHECK_SYSTEM_PROMPT = """당신은 한국어 웹소설 원고의 맞춤법 검사 AI입니다.

검사 범위는 다음 네 가지뿐입니다.
- 맞춤법
- 띄어쓰기
- 오탈자
- 문장부호

금지 사항:
- 설정 충돌, 맥락 충돌, 복선 충돌, 개연성, 문체, 표현 취향을 평가하지 마십시오.
- 문장을 더 문학적으로 고치거나 윤문하지 마십시오.
- 등장인물/세계관 고유명사를 맞춤법 오류로 잡지 마십시오.
- 고유명사에 조사가 붙은 형태도 오류로 잡지 마십시오.

original / suggestion 작성 규칙:
- original에는 본문에 실제로 등장하는 잘못된 표기를 그대로 복사해 넣으십시오.
- suggestion에는 그 자리를 대체할 올바른 표기를 넣으십시오.
- 띄어쓰기 issue의 경우, 띄어쓰기 차이가 드러나도록 양쪽에 공백/붙임이 명확히 다른 텍스트여야 합니다 (예: original "지금 부터", suggestion "지금부터").
- original과 suggestion이 동일하면 그 issue는 만들지 마십시오 — 실제 수정이 없는 항목은 보고하지 않습니다.

입력 원고는 각 줄 앞에 [N] 형태의 줄 번호가 붙어 있습니다.
문제가 있는 경우 line에는 해당 [N] 번호를 정수로 넣으십시오.
문제가 없으면 issues는 빈 배열로 반환하십시오."""

SPELLCHECK_SCHEMA_HINT = """{
  "issues": [
    {
      "type": "typo | spacing | punctuation",
      "line": 3,
      "original": "됬다",
      "suggestion": "됐다",
      "reason": "오탈자"
    }
  ],
  "summary": "맞춤법 검사 결과 요약"
}"""

_ALLOWED_TYPES = {"typo", "spacing", "punctuation"}


class SpellcheckRequest(BaseModel):
    work_id: str
    writer_id: str
    episode_id: str
    content: str
    context: AiContextPayload


class SpellcheckIssue(BaseModel):
    type: Literal["typo", "spacing", "punctuation"]
    line: int
    original: str
    suggestion: str
    reason: str


def _normalize_spellcheck_result(result: dict[str, Any]) -> dict[str, Any]:
    raw_issues = result.get("issues", [])
    summary = result.get("summary", "맞춤법 검사 결과입니다.")

    issues: list[dict[str, Any]] = []
    seen: set[tuple[str, int, str, str]] = set()
    if isinstance(raw_issues, list):
        for raw in raw_issues:
            if not isinstance(raw, dict):
                continue
            issue_type = str(raw.get("type") or "").strip().lower()
            if issue_type not in _ALLOWED_TYPES:
                issue_type = "typo"
            line = _int_or_none(raw.get("line"))
            if line is None or line < 1:
                continue
            original = str(raw.get("original") or "").strip()
            suggestion = str(raw.get("suggestion") or "").strip()
            reason = str(raw.get("reason") or "").strip()
            if not original or not suggestion:
                continue
            # original == suggestion인 issue는 LLM이 잘못 채운 노이즈(실제 수정이 없음)이므로 버린다.
            if original == suggestion:
                continue
            sig = (issue_type, line, original, suggestion)
            if sig in seen:
                continue
            seen.add(sig)
            issues.append(
                {
                    "type": issue_type,
                    "line": line,
                    "original": original,
                    "suggestion": suggestion,
                    "reason": reason or "맞춤법 검사",
                }
            )

    return {
        "issues": issues,
        "summary": summary if isinstance(summary, str) else "맞춤법 검사 결과입니다.",
    }


def _int_or_none(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None


@router.post("")
async def spellcheck_episode(req: SpellcheckRequest):
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
    result = await llm.generate_json(
        system=SPELLCHECK_SYSTEM_PROMPT,
        user=user_prompt,
        schema_hint=SPELLCHECK_SCHEMA_HINT,
        model_override=settings.claude_haiku_model,
        max_tokens=3000,
    )

    normalized = _normalize_spellcheck_result(result)
    normalized["issues"] = filter_whitelisted_issues(
        list(normalized.get("issues", [])),
        whitelist,
    )
    normalized["usage"] = llm.last_usage
    return normalized
