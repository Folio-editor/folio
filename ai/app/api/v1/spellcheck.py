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

원고를 처음부터 끝까지 줄 단위로 빠짐없이 훑어, 아래 빈출 패턴을 **모든 줄에서 반드시 점검**하십시오. 일부 줄만 검사하고 끝내지 마십시오.

[문장부호]
- 마침표·물음표·쉼표 앞 공백 제거: "말했다 . → 말했다.", "끄덕엿다 . → 끄덕였다."
- 전각 부호 → 반각: "있엇다。 → 있었다.", "왜그래？ → 왜 그래?"
- 큰따옴표·작은따옴표 짝 맞추기, 미닫는 따옴표

금지 사항:
- 설정 충돌, 맥락 충돌, 복선 충돌, 개연성, 문체, 표현 취향을 평가하지 마십시오.
- 문장을 더 문학적으로 고치거나 윤문하지 마십시오.
- 등장인물/세계관 고유명사를 맞춤법 오류로 잡지 마십시오.
- 고유명사에 조사가 붙은 형태도 오류로 잡지 마십시오.

original / suggestion 작성 규칙:
- original: 본문에 등장하는 문자열을 한 글자도 빠뜨리거나 더하지 말고 그대로 복사. 임의 축약 금지.
- suggestion: original 자리를 그대로 대체할 올바른 문자열. 띄어쓰기/문장부호 차이까지 정확히 반영.
- original ≠ suggestion 이어야 합니다. 동일하면 issue를 만들지 마십시오.
- 띄어쓰기 issue는 양쪽에 공백 위치 차이가 명확히 보여야 합니다 (예: "지금 부터" → "지금부터", "정해야할" → "정해야 할").
- 한 issue에는 한 가지 수정만 담으십시오. 같은 줄에 여러 오류가 있으면 각각 별개 issue로 분리.

입력 원고는 각 줄 앞에 [N] 형태의 줄 번호가 붙어 있습니다.
문제가 있는 경우 line에는 해당 [N] 번호를 정수로 넣으십시오.
문제가 없으면 issues는 빈 배열로 반환하십시오.

다음은 모범 응답 예시입니다 (형식 준수에 참고).

입력:
[1] 그는 문을열었고 안되 . 라고 중얼거렷다。
[2] 다시한번 생각 보다 깊은 침묵 이였다.

기대 출력:
{
  "issues": [
    {"type": "spacing", "line": 1, "original": "문을열었고", "suggestion": "문을 열었고", "reason": "명사 '문을'과 동사 '열었고' 사이 띄어쓰기"},
    {"type": "spacing", "line": 1, "original": "안되 .", "suggestion": "안 돼.", "reason": "'안 되다' 띄어쓰기 + 마침표 앞 공백 제거"},
    {"type": "punctuation", "line": 1, "original": "중얼거렷다。", "suggestion": "중얼거렸다.", "reason": "전각 마침표 → 반각, 과거형 어미 오탈자 함께 수정"},
    {"type": "spacing", "line": 2, "original": "다시한번", "suggestion": "다시 한 번", "reason": "부사 띄어쓰기"},
    {"type": "spacing", "line": 2, "original": "생각 보다", "suggestion": "생각보다", "reason": "조사 '보다'는 앞 명사에 붙여 씀"},
    {"type": "spacing", "line": 2, "original": "침묵 이였다", "suggestion": "침묵이었다", "reason": "조사 '이' 붙여쓰기 + 어미 '였→었' 오탈자"}
  ],
  "summary": "띄어쓰기 4건, 문장부호 1건, 오탈자 1건"
}"""

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
        "summary": _build_summary(issues),
    }


_TYPE_LABEL = {"spacing": "띄어쓰기", "typo": "오탈자", "punctuation": "문장부호"}


def _build_summary(issues: list[dict[str, Any]]) -> str:
    counts: dict[str, int] = {}
    for issue in issues:
        counts[issue["type"]] = counts.get(issue["type"], 0) + 1
    parts = [
        f"{label} {counts[key]}건"
        for key, label in _TYPE_LABEL.items()
        if counts.get(key)
    ]
    return ", ".join(parts) if parts else "맞춤법 오류 없음"


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
        model_override=settings.claude_sonnet_model,
        max_tokens=3000,
    )

    normalized = _normalize_spellcheck_result(result)
    normalized["issues"] = filter_whitelisted_issues(
        list(normalized.get("issues", [])),
        whitelist,
    )
    # whitelist 필터까지 끝난 최종 issues 기준으로 summary 재계산 — 카드 수와 항상 일치.
    normalized["summary"] = _build_summary(normalized["issues"])
    normalized["usage"] = llm.last_usage
    return normalized
