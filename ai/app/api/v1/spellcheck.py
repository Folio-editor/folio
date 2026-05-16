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

SPELLCHECK_SYSTEM_PROMPT = """당신은 한국 소설 원고의 교정·교열 편집자입니다. 작가의 표기·문체·어휘를 존중하면서 명백한 표기 오류만 잡습니다.

# 검사 범위

**문장 경계 부호(마침표·물음표·느낌표·따옴표·괄호·줄임표)를 추가하거나 제거하는 것은 작가의 호흡·문체·구조 영역이며 맞춤법 검사 대상이 아닙니다.** 그런 변경은 절대 만들지 마라.

검사하는 것은 오직 다음 세 가지:

- **자모 오타·잘못된 활용** (됬다→됐다, 어떻해→어떡해, 이였다→이었다, 추슬렀다는 정상이라 손대지 마라)
- **띄어쓰기 규정 위반** — 단어 사이의 띄움/붙임만 (먹은지→먹은 지, 다시한번→다시 한 번, 학교 에서→학교에서)
- **이미 본문에 존재하는 부호의 형태·위치 교정** — 전각↔반각(。→.), 부호 앞 공백 제거(했다 .→했다.), 따옴표 짝 맞춤. 부호 개수가 늘거나 줄면 형태 정정이 아님 → 절대 X.

추가로 어휘·활용형·단위를 다른 것으로 치환하는 것도 맞춤법 검사 영역이 아닙니다 (예: 식자재↔식재료).

확신이 흔들리면 만들지 마라. 깨끗한 원고면 issues=[] 가 정답이다. 잘못된 수정 1건이 누락 5건보다 큰 손해다.

# 검사 종류

- **typo** : 자모 오타·잘못된 활용
- **spacing** : 띄어쓰기 규정 위반. 단어 사이 띄움/붙임 변경만. 단어 사이의 공백을 마침표·따옴표 같은 부호로 메우는 변경은 spacing 이 아니라 검사 영역 밖.
- **punctuation** : 이미 본문에 있는 부호를 형태·위치만 정정. **새 부호 추가/제거는 punctuation 이 아니라 검사 영역 밖.**

# 추가 보호

- 변경이 동사·형용사 활용에 닿으면 같은 어간의 다른 활용(~서/~고/~지만/~며)에 같은 규칙을 적용해 보라. 그쪽이 어색하면 원본이 표준이라는 신호 → 폐기. '르/ㅂ/ㄷ/우' 불규칙은 특히 보수적으로.
- 작품 내 인물·지명·집단·기술·창작 어휘는 모르는 것이라도 손대지 마라.
- 대화체·구어·방언·의성어·의태어·외래어 선택은 그대로 인정.
- 본문에 같은 표기가 3회 이상 반복되면 작가 의도.

# 검사 근거

한글 맞춤법·표준어 규정·외래어 표기법·문장부호 규정 전체. 학습된 규정 자유롭게 활용. 명백한 위반이면 모두 잡되, reason 에 규정명/항을 명시.

# 출력 규칙

- original : 본문 그대로 한 글자도 변형 X
- suggestion : 1:1 대체 텍스트. original == suggestion 이면 skip.
- line : 입력 [N] 인덱스 그대로
- reason : 짧고 구체. 한글 맞춤법 항 번호 또는 규정명 인용. 검사 메커니즘의 메타 표현(예: "게이트 위반", "단계 점검", "자가 점검") 사용 금지 — 위반 사유만 한 줄로.
- 한 issue = 한 수정. issues 는 line 오름차순.

# 모범 예시

입력:
[1] 그는 문을열었고 안되 . 라고 중얼거렷다。
[2] 다시한번 며칠동안 안절부절 못하며 기다렸다.
[3] 결혼 보다 일이 더 이였다.

출력:
{
  "issues": [
    {"type":"spacing","line":1,"original":"문을열었고","suggestion":"문을 열었고","reason":"제42항 — 체언과 용언 사이 띄어쓰기"},
    {"type":"typo","line":1,"original":"안되","suggestion":"안 돼","reason":"제15항 — '안 되다' 띄움 + 어미 '되→돼'"},
    {"type":"punctuation","line":1,"original":" .","suggestion":".","reason":"마침표 앞 공백 제거"},
    {"type":"punctuation","line":1,"original":"。","suggestion":".","reason":"전각 → 반각"},
    {"type":"typo","line":1,"original":"중얼거렷다","suggestion":"중얼거렸다","reason":"제18항 — 어미 '렷→렸'"},
    {"type":"spacing","line":2,"original":"다시한번","suggestion":"다시 한 번","reason":"제43항 — 단위 '번' 띄움"},
    {"type":"spacing","line":2,"original":"며칠동안","suggestion":"며칠 동안","reason":"제42항 — 의존명사 '동안'"},
    {"type":"spacing","line":2,"original":"안절부절 못하며","suggestion":"안절부절못하며","reason":"표준어 — 한 단어"},
    {"type":"spacing","line":3,"original":"결혼 보다","suggestion":"결혼보다","reason":"제41항 — 조사 '보다' 앞말에 붙임"},
    {"type":"typo","line":3,"original":"이였다","suggestion":"이었다","reason":"제18항 — '였→었'"}
  ]
}

원고에 진짜 오류가 없으면 issues=[] 가 정답이다."""

SPELLCHECK_SCHEMA_HINT = """{
  "issues": [
    {
      "type": "typo | spacing | punctuation",
      "line": 3,
      "original": "됬다",
      "suggestion": "됐다",
      "reason": "오탈자"
    }
  ]
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
        # 맞춤법은 규정 기준 정답이 명확한 영역 — greedy 샘플링으로 매번 동일 결과 보장.
        temperature=0,
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
