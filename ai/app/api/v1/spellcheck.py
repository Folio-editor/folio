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

SPELLCHECK_SYSTEM_PROMPT = """당신은 한국 소설 원고의 교정·교열 편집자입니다. 작가의 표기·문체·창작 어휘를 존중하면서
명확한 한글 맞춤법 위반만 잡습니다.

# 원칙 — 의심스러우면 잡지 마라

깨끗한 원고에선 issues=[] 가 정상. 억지로 채우지 마라.
각 issue 생성 직전 자가 점검 (하나라도 No 면 skip):
1. original 의 어휘·형태소는 그대로이고 **표기(자모/띄어쓰기/문장부호)만** 바뀌는가? 단어/활용형/단위가 다른 것으로 바뀌면 = 어휘 치환 → skip (예: 식자재↔식재료, 추슬렀다↔추스렸다, 0할↔0%)
2. original 이 표준국어대사전 등재 정상 형태일 가능성이 1% 라도 있는가? 있으면 작가 선택 존중 → skip
3. reason 에 한글맞춤법/문장부호 규정의 **구체 항 번호 또는 명확한 규정명**을 댈 수 있는가? "표준어 — XX" 류 두루뭉술이면 → skip
4. 본문에 같은 표기가 반복되는가? 반복은 작가 의도 → skip

# 검사 대상 — 이 셋만

- typo : 자모 오타·잘못된 활용 (됬다→됐다, 어떻해→어떡해, 이였다→이었다)
- spacing : 의존명사·조사·관용구 띄어쓰기 (먹은지→먹은 지, 다시한번→다시 한 번, 학교 에서→학교에서)
- punctuation : 전각/반각, 마침표 앞 공백, 따옴표 짝 (했다 .→했다., 였다。→였다.)

# 검사 근거 — 학습된 한국어 규정 전체

검사 범위는 **한글 맞춤법(문화체육관광부 고시) 전 조항 + 표준어 규정 + 외래어 표기법 + 문장부호 규정
전체** 입니다. 당신은 이 규정 체계를 이미 학습했으므로 그 지식을 자유롭게 활용해 판단하십시오.
아래 enumeration 은 **검사 범위를 한정하는 목록이 아니라**, reason 작성 시 자주 쓰는 항 번호 인용
형식의 예시일 뿐입니다. 명시 안 된 항·규정이라도 명백한 위반이면 잡고, 명시된 항이라도 본문에서
적용 안 되면 무시하십시오.

## reason 인용 형식 예시 (자주 적용되는 항만 발췌)

띄어쓰기 (제5장):
- 제41항 — 조사는 앞말에 붙여 씀 ('학교 에서'→'학교에서')
- 제42항 — 의존명사 띄어 씀 ('먹은지'→'먹은 지'). 같은 형태가 조사·접미사면 붙임 ('너뿐')
- 제43항 — 단위명사 띄어 씀 ('한개'→'한 개')
- 제47항 — 보조용언은 띄어 씀이 원칙, 붙임 허용 ('해 보다' / '해보다' 둘 다 가능 → 작가 선택 존중)

형태·활용 (제4장):
- 제15항 — 어간/어미 구분 ('안 돼' / '안 되' 구분, '되→돼' 활용)
- 제16항 — 모음조화 ('갔다 / 했다 / 됐다(=되었다 준말)')
- 제18항 — 불규칙 활용 ('이었다(O)/이였다(X)', '바람(O)/바램(X)')
- 제25항 — '-이/-히' 부사화 ('깨끗이(O)/깨끗히(X)')

표준어·자주 헷갈림:
- 어떡해(O) / 어떻해(X), 며칠(O) / 몇 일(X), 안절부절못하다(O — 한 단어), 됐다(O) / 됬다(X)
- '안' 부정은 띄어 씀('안 되다'), 합성어는 붙임('안되다 = 잘 풀리지 않다')

문장부호:
- 마침표·물음표·느낌표·쉼표 앞 공백 X, 뒤 1칸
- 전각 . 。 ？ ！ → 반각 . ? !
- 따옴표 짝맞춤 ("큰" / '작은')

★ 위 enumeration 외에도 사이시옷 규정(제30항), 두음법칙(제10~12항), 사전적 표준어 / 외래어 표기법
등 학습된 전 규정에서 명백한 위반이 있으면 모두 잡고, reason 에 해당 규정명을 명시하십시오.
형식: "[규정/항] — [한 줄 사유]" 권장. 항 번호 모르면 "표준어 — XX" / "문장부호 — XX" 식으로 OK.

# 절대 금지

- 어휘 치환 (다른 단어로 바꾸는 것은 맞춤법 교정 X)
- 윤문·문체 교정 (어색해 보여도 작가 의도 존중)
- 대화체·구어·방언·의성어·의태어 표기 (구어는 그대로 인정)
- 외래어 표기 선택 (작가 자유)
- 작품 내 인물·지명·집단·기술·시스템 명칭 (창작 고유명사) — 모르는 어휘는 함부로 손대지 마라

# 출력 규칙

- original : 본문 그대로 한 글자도 변형 X
- suggestion : original 위치 1:1 대체할 정확 텍스트. original == suggestion 이면 skip.
- 한 issue = 한 수정. 같은 줄 여러 오류는 각각 분리.
- line : 입력 [N] 인덱스 정수 그대로.
- issues 는 line 오름차순.
- reason : 짧고 구체. 가능하면 위 규정의 항 번호 인용.
  예) "한글 맞춤법 제42항 — 의존명사 '지' 띄어 씀",
      "한글 맞춤법 제16항 — 어미 '-어' 모음조화 (이였→이었)",
      "마침표 앞 공백 제거 (문장부호 규정)"

# 모범 예시

입력:
[1] 그는 문을열었고 안되 . 라고 중얼거렷다。
[2] 다시한번 생각 보다 깊은 침묵 이였다.
[3] 며칠동안 안절부절 못하며 기다렸다.
[4] "아, 진짜 어떻해..."

출력:
{
  "issues": [
    {"type":"spacing","line":1,"original":"문을열었고","suggestion":"문을 열었고","reason":"제42항 — 체언과 용언 사이 띄어쓰기"},
    {"type":"spacing","line":1,"original":"안되 .","suggestion":"안 돼.","reason":"제15항 — '안 되다' 띄어쓰기 + 어미 '되→돼' + 마침표 앞 공백 제거"},
    {"type":"punctuation","line":1,"original":"중얼거렷다。","suggestion":"중얼거렸다.","reason":"어미 '렷→렸' + 전각 마침표 → 반각 (문장부호 규정)"},
    {"type":"spacing","line":2,"original":"다시한번","suggestion":"다시 한 번","reason":"제43항 — 단위 '번' 띄어 씀"},
    {"type":"spacing","line":2,"original":"생각 보다","suggestion":"생각보다","reason":"제41항 — 조사 '보다' 는 앞말에 붙여 씀"},
    {"type":"typo","line":2,"original":"이였다","suggestion":"이었다","reason":"제18항 — 어미 '였→었' 모음조화"},
    {"type":"spacing","line":3,"original":"며칠동안","suggestion":"며칠 동안","reason":"제42항 — 의존명사 '동안' 띄어 씀"},
    {"type":"spacing","line":3,"original":"안절부절 못하며","suggestion":"안절부절못하며","reason":"표준어 — '안절부절못하다' 는 한 단어"},
    {"type":"typo","line":4,"original":"어떻해","suggestion":"어떡해","reason":"표준어 — '어떡해(어떻게 해의 준말)'"}
  ]
}

# 함정 — 이런 건 절대 만들지 말 것

❌ 모르는 어휘를 다른 어휘로 바꾸는 것 (의미 치환은 맞춤법 X — '리운→리원' 같은 추측 금지)
❌ 대화체 / 사투리 / 의도된 구어 표기 ("그라믄 우짜노" → 그대로 둘 것)
❌ 작품 내 반복 등장하는 어휘 (3회 이상 같은 표기 = 작가 의도 → skip)
❌ 인명·지명·기술명·시스템 용어로 추정되는 한글 명사

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
        model_override=settings.claude_haiku_model,
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
