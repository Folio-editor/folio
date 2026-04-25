"""POST /v1/reviews - 설정/맥락 기반 검수 결과를 JSON으로 반환."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import settings
from app.middleware.auth import require_internal_api_key
from app.services.providers import get_llm
from app.services.rag import assemble_context
from app.services.repetition_detector import detect_repetitions
from app.services.text_extractor import extract_numbered_text, extract_plain_text
from app.services.timeline_extractor import find_retrospect_markers

# 기존 MCP 기반 검수 경로는 비용 절감 작업 때문에 비활성화했다.
# 나중에 설정집 크기 분기 시 다시 사용할 수 있으므로 삭제하지 않고 남겨둔다.
#
# from app.mcp.context import WriterContext
# from app.mcp.registry import MCP_TOOLS, execute_tool

router = APIRouter(
    prefix="/reviews",
    tags=["reviews"],
    dependencies=[Depends(require_internal_api_key)],
)

REVIEW_SYSTEM_PROMPT = (
    """당신은 웹소설 전문 검수 AI입니다.
작가가 작성한 원고를 설정집, 이전 맥락과 대조하여 오류를 찾아냅니다.

## 원고 형식
검수할 원고는 각 줄 앞에 [N] 형태의 줄 번호가 붙어 있다.
예: [1] 리운은 사무실 의자에 앉아 창밖을 바라보았다.

## 검수 항목

### 1. 설정 충돌 (setting_conflict)
- 인물의 외모, 성격, 관계, 능력 등이 설정집과 다른 경우
- 세계관의 규칙, 시스템, 용어가 설정과 다른 경우
- 장소, 사물의 위치나 상태가 설정과 다른 경우
- **인물의 이름·성별·나이는 1글자/1살이라도 다르면 critical로 반드시 잡아라.**
  - 한국어 숫자 표기는 동일 의미로 변환해 비교하라:
    - 열 살=10세, 스무 살=20세, 서른 살=30세, 마흔 살=40세, 쉰 살=50세, "20대 초반"=20~24세, "20대 후반"=25~29세
    - "29세"라고 설정된 인물이 본문에서 "스무 살", "서른 살", "스물 한 살" 등으로 나오면 모순.
  - 인물 본인이 그렇게 말하더라도, 그것이 설정과 다르면 합리화하지 말고 setting_conflict로 잡아라
    (작가가 캐릭터 컨셉으로 "거짓말쟁이/허세형"을 명시하지 않은 한).

#### 별칭/닉네임 매핑 (내부 처리 — 출력 금지)
- 등장인물 카드에 "방송 닉네임", "별칭", "상세" 항목으로 별칭/닉네임이 명시될 수 있다.
  본문의 호칭/닉네임은 카드의 본명과 동일 인물로 간주하고 그 인물의 성별·나이·직업·관계 전체를
  비교 대상으로 삼아라. 본명이 본문에 안 나와도 검사를 생략하지 마라.
  - 예: 카드 "노정희 / 닉네임 순살라면" + 본문 "순살라면, 스무 살" → 노정희(28세)와 충돌.
  - 예: 카드 "강진수 / 닉네임 29세무직" + 본문 "29세무직"은 강진수와 동일.
- **이 매핑은 내부적으로만 수행하고, 출력에 매핑 테이블·중간 추론을 포함하지 마라.**
  결과는 issues 배열의 description/reference 필드에 충돌 사례로만 표기한다.
- 매핑이 모호하면(닉네임이 여러 인물과 겹침) 추측 대신 info로 표기하라.

### 2. 서술 충돌 (narration_conflict)
- 같은 화 내에서 앞뒤 묘사가 모순되는 경우
- "~하지 않는다"고 서술한 직후 그 행동을 하는 경우
- 한 장면 안에서 시간, 날씨, 위치가 바뀌는 경우
- **한 장면/한 화 안에서 인물의 환경이 모순되는 경우** (거주 형태, 동거인, 위치, 직업, 소지품 등)
  - 예: "혼자 사는 원룸"이라고 한 직후 "어머니가 차려준 밥"이 등장 → 동거인 모순
  - 예: 같은 장면에서 "사무실"이라고 했다가 "집"으로 바뀜 → 위치 모순

### 3. 시간 논리 충돌 (time_conflict)
- 설정상 소요 시간과 본문에 서술된 시간이 맞지 않는 경우
- 설정상 단계적 과정(예: 24시간에 걸친 변화)을 즉시 완료로 서술한 경우
- 작품 내 시간 흐름이 논리적으로 맞지 않는 경우

### 4. 시대/톤 불일치 (tone_conflict)
- **작품 정보(work_meta)의 era·genre·style_memo는 검수의 1순위 기준이다.** 그 시대/장르/문체에 어울리지 않는 어휘는 적극적으로 잡아라.
  - "현대 한국" 작품에서 영어 단어 남발(brand value, fan engagement, monetize 등)이 캐릭터 컨셉으로 명시되어 있지 않으면 tone_conflict warning.
  - "현대 한국" 작품에서 사극체("~하시옵소서", "~하옵나이다") 표현이 캐릭터 컨셉으로 명시되어 있지 않으면 tone_conflict warning. 시청자가 "갑자기 사극?"으로 반응하더라도 캐릭터 설정에 명시되어 있지 않으면 작가 실수로 본다.
  - 시대 배경에 맞지 않는 외래어·신조어·전문 용어가 캐릭터 컨셉이 아닌 화자/내레이션에서 등장하면 잡아라.
- 작품의 전체 톤과 맞지 않는 문체 전환 (구어 → 문어, 평어 → 격식체 등이 의도 없이 일어나는 경우)
- 특정 표현이나 단어가 과도하게 반복되는 경우 (구체 카운트는 후처리 모듈이 담당하므로, LLM은 "여러 번 반복됨" 정도만 지적해도 충분하다)

#### tone_conflict 예외 (지적하지 말 것)
- 인물 시점·내적 독백·자유간접화법에서의 구어체 축약은 충돌이 아니다.
  예: "백오십이 넘어?", "한 백 정도" — 인물 머릿속 표현은 작가 시점의 정확성보다 우선한다.
- 단위 생략, 어림수, 미완성 문장이 인물의 충격·멍한 상태·일상적 화법을 나타낼 때는 의도된 문체로 본다.
- 짧은 호흡·구어체 줄임은 작품의 style_memo가 명시적으로 "정확성·격식체 유지"를 요구하지 않는 한 작가 의도로 간주한다.
- 회계·법률·기술 정확성이 장르 핵심인 작품(예: 경제물·기업물·법정물)에서만 수치·전문 용어 정확성을 엄격히 본다.
  작품 메타의 genre/style_memo에 그런 정확성 요구가 보이지 않으면 인물 화법을 우선한다.

### 5. 맥락 충돌 (context_conflict)
- 이전 화의 사건, 상태, 결과와 모순되는 경우
- 이전 화에서 확립된 인물 관계나 감정선과 다른 경우
- **심각도 하한**: 이전 화에서 명시적으로 확립된 사건·사실(인물의 행적, 사건의 원인·결과,
  결별 이유, 사고 경위 등)과 본문 회상이 다른 결과/원인을 가리키면 **최소 warning**으로 잡아라.
  - 예: 이전 화에서 "양다리로 결별"이 본문 클라이맥스인데 현재 화 회상에서 "도박빚으로 결별"이라고 서술 → warning.
  - info 등급은 사소한 표현 차이(예: 같은 사건의 부수적 디테일 누락)에만 사용하라.
  - 핵심 사건의 인과를 바꾸는 회상 오류는 절대 info로 분류하지 마라.

### 6. 복선 충돌 (foreshadow_conflict)
- 컨텍스트의 "## 복선/떡밥" 섹션에 등록된 복선의 핵심 명제를 본문이 무력화·정면 부정·조기 무효화하는 경우.
- 특히 importance가 high인 복선은 작품의 핵심 운명/규칙이므로 반드시 본문이 일관되게 유지되어야 한다.
  - 예: 복선 "박수될 팔자 예언 (importance: high) — 지훈은 회사원이 될 수 없다"가 등록되어 있는데
    본문이 "지훈은 어엿한 직장인이 되어 안정적인 월급을 받고 있었다"라고 서술 → critical 충돌.
  - 예: 복선 "신안의 한계와 대가 — 아직 드러나지 않음"이 unplanted인데 본문이 능력 대가를 단정 지어 서술 → 조기 회수 warning.
- 검수 시 모든 high importance 복선을 적극적으로 본문과 대조하라. 단순 키워드 매칭이 아니라
  복선의 description에 담긴 운명·규칙·관계가 본문에서 깨지지 않는지 의미적으로 검사하라.

## 검수 시 반드시 수행하는 사전 스캔 (출력 금지, 내부 처리)

검수 시작 전 컨텍스트의 등장인물·세계관·복선을 다음 절차로 본문과 1:1 대조하라.
**이 사전 스캔은 내부적으로만 수행하고 출력에 절차/매핑 테이블을 포함하지 마라. 결과는 issues 배열에만 담는다.**

1. **모든 등장인물 카드** (주인공·부캐릭터 무관) 각각에 대해 다음을 본문과 비교:
   - 이름·성별·나이 (한국어 숫자 표기는 환산해서 비교)
   - 직업·소속·관계 (custom_fields의 '직업' 등 명시 항목 포함)
   - 별칭/닉네임 (custom_fields의 '방송 닉네임', '별칭', '상세' 항목)
   - 페르소나·말투 (personality 항목과 본문 발화 톤이 일치하는지)
   - **반드시 등장인물 카드 sort_order 순서대로 한 명씩 차례로 검사하라.**
     - 1번 인물(주인공)을 검사한 뒤에는 반드시 2번, 3번, ... N번까지 모든 인물을 같은 깊이로 검사하라.
     - 한 인물의 충돌을 잡았더라도 그 인물에 attention을 멈추지 말고, 다른 인물 검사를 빠짐없이 진행하라.
     - 본문이 "회사", "직장인", "월급" 같은 키워드를 한 번에 처리하지 말고, **각 인물의 직업 카드와 1:1로 따로** 비교하라.
       - 예: 박지훈 카드(만년취준생) vs 본문 "회사 회식, 직장인" → 박지훈 충돌
       - 동시에: 김우식 카드(기성 스트리머) vs 본문 "회사 다니면서 취미로 방송하는 친구" → 김우식 별도 충돌
   - **페르소나·말투 위반 예시 (적극 검출하라)**:
     - 카드 "차갑고 단호한 말투" 인물이 본문에서 친근한 존댓말, 농담조, 감탄사 남발로 발화 → setting_conflict warning.
     - 카드 "과묵하고 말 수 적음" 인물이 본문에서 길게 수다 떨거나 농담을 함 → setting_conflict warning.
     - 카드 personality에 명시된 대사 금지 규칙(예: "개인적 위로 표현 금지")을 본문에서 위반 → setting_conflict warning.
   - 부차 인물도 절대 생략하지 마라. 본문에서 한 번이라도 언급된 인물의 모든 카드 속성을 비교 대상으로 삼는다.

2. **세계관 노트의 보조 인물·닉네임** (예: "주요 시청자(채팅 코러스)" 같은 노트):
   - 노트 본문에 명시된 닉네임 목록(bvk0014, 무음방, 아주카라 등)과 본문의 채팅 닉네임 표기를 1글자라도 다르면 setting_conflict로 잡아라(info 이상).
   - 닉네임 일관성은 작가가 가장 자주 실수하는 영역이다. 모호하지 않으면 반드시 잡아라.

3. **세계관 노트의 시스템 룰** (능력 발동 조건, 수치, 단위 등):
   - 본문에 해당 룰이 적용되어야 할 장면이 등장하면 룰을 위반·이탈했는지 확인.
   - "있어야 할 반동/대가가 본문에 빠진 경우"(예: 신안 사용 후 두통/코피 묘사 부재)도 narration_conflict info로 표기 가능.

4. **모든 importance high 복선** 각각에 대해 본문이 명제를 무력화·정면 부정하는지 검사 (foreshadow_conflict 항목 참조).

## 검사 강화 지시 (반드시 적극적으로 점검하라)

### 인물 관계 모순 (setting_conflict, critical)
- 등장인물 카드의 '상세' 노트, '성격' 설명, '관계' 항목 등에 명시된 인물 간 관계
  (예: 불알친구, 가족, 동료, 사제, 연인)와 본문 묘사가 모순되면 반드시 critical로 잡아라.
- 특히 본문에 "처음 만난", "어제 알게 된", "낯선" 등 관계 시작점에 대한 표현이 나올 때,
  설정에 이미 확립된 관계가 있다면 즉시 충돌이다.
- 캐릭터 컨셉이나 농담/거짓말로 합리화하지 마라. 그것이 이전 화 본문에 명시되어 있지 않으면 모순이다.

### 세계관 핵심 규칙 위반 (setting_conflict, critical)
- 세계관 설정에 명시된 능력 발동 조건, 시스템 제약, 수치(복채·시간·단위 등)는
  본문이 설정과 정확히 일치해야 한다. 한 글자라도 다르면 critical로 잡아라.
  - 예: 설정 "방송 시작 즉시 발동" → 본문 "방송 시작 30분 후 발동" → critical 충돌
  - 예: 설정 "복채 500개" → 본문 "복채 300개" → critical 충돌
- "캐릭터 본인이 의문을 품었으니 의도된 일시 이상"으로 합리화하지 마라.
  의도된 일시 이상은 작가가 별도 메모로 명시한 경우에만 인정한다.

### 회차 간 시간 충돌 (time_conflict)
- "## 회차별 시간 흐름" 섹션이 컨텍스트에 주어지면, 회차별 시간 표지를 누적해 본문의
  시간 진술과 비교하라.
  - 예: 1~6화 시간 표지 합산이 약 2~3일인데 본문 7화에서 "일주일 전 첫 방송"이라고 쓰면
    time_conflict warning 이상.

## 규칙
- **하나의 문제는 한 번만 보고하라.** 같은 충돌이 여러 줄에 걸쳐 나타나면 lines 배열에 모든 해당 줄을 포함시켜 단일 issue로 묶어라. 동일한 description을 가진 issue를 중복 출력하지 마라.
- 반드시 근거를 제시하라. 원고의 어떤 부분이 설정의 어떤 부분과 충돌하는지 구체적으로 명시하라.
- 심각도를 반드시 표기하라: critical(반드시 수정), warning(수정 권장), info(참고)
- 이번 화가 아닌 이전 화의 오류를 발견하면 info로 표기하고, description에 "이전 화(N화) 오류"를 명시하라.
- 설정 문서에 명시되지 않았지만 이전 본문에서 확립된 사실도 근거로 사용할 수 있다.
- 문제가 없으면 빈 배열을 반환하라. 억지로 문제를 만들어내지 마라.
- 제공된 설정집과 이전 회차 정보만 근거로 사용하라. 추측하지 마라.
- 각 issue에 수정 제안(suggestion)을 반드시 포함하라.
- lines 필드에는 원고에 표시된 [N] 줄 번호를 정수 배열로 표기하라. 여러 줄에 걸치면 모든 해당 줄 번호를 포함하라.
- location에는 문제가 되는 줄의 텍스트를 짧게 인용하라 (줄 번호 [N]은 제외).

## 절대 지적하지 말 것 (모든 타입 공통)
- **인물 시점 자유간접화법에서의 수치·단위 표현**: 인물이 머릿속으로 큰 숫자를 떠올리거나 충격받아 중얼거릴 때 단위 생략, 어림수, 축약은 의도된 문체다. 절대 어떤 type으로도 지적하지 마라.
  - 예: 직전에 "1,514,000원"이 본문에 명시된 후 인물이 "백오십이 넘어?"라고 중얼거리는 것 — 정상.
  - 예: "수수료 떼고도 백은 넘는데" — 인물의 멍한 상태/대략적 인식을 보여주는 의도된 표현.
- **구어체 줄임·미완성 문장**: 짧은 호흡 문체에서 단어 생략, 말줄임, 호흡 끊김은 작가 의도다.
- 정확한 수치/회계 묘사가 핵심인 장르(경제·기업물·법정물 등)가 작품 메타에 명시되지 않은 한, 수치 표현은 인물 화법을 우선하라.
- 위 사례를 setting_conflict, narration_conflict, tone_conflict, context_conflict 어느 type으로도 분류해 지적하지 마라.

반드시 JSON으로만 응답하라. 마크다운 코드블록을 사용하지 마라."""
)

REVIEW_SCHEMA_HINT = """{
  "issues": [
    {
      "type": "setting_conflict | narration_conflict | tone_conflict | context_conflict | foreshadow_conflict",
      "severity": "critical | warning | info",
      "lines": [3],
      "location": "해당 줄 텍스트 짧게 인용 (줄 번호 제외)",
      "description": "무엇이 왜 문제인지 설명",
      "reference": "근거가 되는 설정/이전 화 내용",
      "suggestion": "수정 제안"
    }
  ],
  "summary": "전체 검수 결과 한 줄 요약",
  "score": 0-100
}"""


class ReviewRequest(BaseModel):
    work_id: str
    writer_id: str
    episode_id: str
    content: str
    episode_number: int


# 결정론적 점수 산정 가중치. LLM이 매기는 score는 호출마다 달라져 작가 신뢰도가 떨어지므로,
# 최종 issues의 severity 카운트로 100점에서 차감해 일관된 점수를 돌려준다.
_SCORE_PENALTIES = {"critical": 10, "warning": 5, "info": 2}
_SCORE_FLOOR = 0


def _compute_score(issues: list[dict[str, Any]]) -> int:
    score = 100
    for issue in issues:
        sev = str(issue.get("severity") or "").lower()
        score -= _SCORE_PENALTIES.get(sev, 0)
    return max(_SCORE_FLOOR, score)


def _looks_like_repetition_issue(issue: dict[str, Any]) -> bool:
    """LLM이 보고한 issue가 '표현 반복'에 해당하는지 추정한다."""
    desc = str(issue.get("description") or "")
    return ("반복" in desc) or ("회 등장" in desc) or ("회 사용" in desc) or ("중복" in desc)


def _merge_repetitions(
    llm_issues: list[dict[str, Any]],
    repetition_issues: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """LLM이 잡은 반복 이슈와 후처리 모듈 결과를 머지한다.

    - LLM 이슈의 lines 집합이 후처리 이슈의 lines와 50% 이상 겹치고 description이
      반복 관련이면, LLM 이슈를 제거하고 후처리 결과만 남긴다(카운트가 정확).
    - 그 외 LLM 이슈는 그대로 유지한다.
    """
    rep_line_sets = [set(r.get("lines") or []) for r in repetition_issues]
    kept: list[dict[str, Any]] = []
    for issue in llm_issues:
        if not _looks_like_repetition_issue(issue):
            kept.append(issue)
            continue
        ll_lines = set(issue.get("lines") or [])
        if not ll_lines:
            kept.append(issue)
            continue
        replaced = False
        for rep_lines in rep_line_sets:
            if not rep_lines:
                continue
            overlap = len(ll_lines & rep_lines)
            smaller = min(len(ll_lines), len(rep_lines))
            if smaller and overlap / smaller >= 0.5:
                replaced = True
                break
        if not replaced:
            kept.append(issue)
    return kept + repetition_issues


def _normalize_review_result(result: dict[str, Any]) -> dict[str, Any]:
    if "issues" not in result and "score" not in result:
        return {
            "issues": [],
            "summary": "검수 결과 없음 (fake)",
            "score": 100,
        }

    raw_issues = result.get("issues", [])
    summary = result.get("summary", "검수 결과 없음")
    score = result.get("score", 100)

    issues: list[dict[str, Any]] = []
    # LLM이 같은 문제를 중복 출력하는 경우(같은 type+동일 lines 집합)에는 첫 번째만 남긴다.
    # 토큰·UX 모두 낭비를 막기 위함.
    seen_signatures: set[tuple[str, tuple[int, ...]]] = set()
    if isinstance(raw_issues, list):
        for issue in raw_issues:
            if not isinstance(issue, dict):
                continue
            # lines 필드 정규화: 정수 배열로 보장
            lines = issue.get("lines", [])
            if isinstance(lines, int):
                lines = [lines]
            elif not isinstance(lines, list):
                lines = []
            else:
                lines = [n for n in lines if isinstance(n, int)]
            issue["lines"] = lines
            sig = (str(issue.get("type", "")), tuple(sorted(set(lines))))
            if sig in seen_signatures:
                continue
            seen_signatures.add(sig)
            issues.append(issue)

    return {
        "issues": issues,
        "summary": summary if isinstance(summary, str) else "검수 결과 없음",
        "score": score if isinstance(score, int | float) else 100,
    }


@router.post("")
async def review_episode(req: ReviewRequest):
    # assemble_context(mode="review")가 이미 작품 메타·등장인물·세계관·복선·
    # 최근 회차 원문·유사 청크를 한 번에 조립한다. 인물/세계관을 user_prompt에서
    # 별도로 다시 박아 넣지 않는다(중복 토큰 낭비 방지).
    #
    # vector_search 임베딩 쿼리로는 검수 대상 본문 앞부분을 사용한다.
    # 초안과 달리 검수에는 "이번 화 방향" 텍스트가 없으므로, 본문 일부를
    # 의미 쿼리로 삼아 과거 화에서 톤·설정이 비슷한 청크를 끌어온다.
    review_query = extract_plain_text(req.content)[:3000]
    context = await assemble_context(
        work_id=req.work_id,
        writer_id=req.writer_id,
        storyline=review_query,
        current_episode_num=req.episode_number,
        mode="review",
    )
    cleaned_content = extract_numbered_text(req.content)

    # 본문에서 발견되는 회상/소급 시간 표지를 별도 섹션으로 노출한다.
    # LLM이 회차 누적 경과 시간(타임라인 섹션)과 본문 진술의 충돌을 직접 비교 가능.
    retrospect_markers = find_retrospect_markers(extract_plain_text(req.content))
    retrospect_block = ""
    if retrospect_markers:
        bullets = "\n".join(f"- {m}" for m in retrospect_markers)
        retrospect_block = (
            "\n\n## 본문 시간 진술 (회차 누적 시간과 비교 필수)\n"
            f"{bullets}\n"
            "위 진술이 컨텍스트의 '회차별 시간 흐름'과 모순되면 time_conflict로 잡아라."
        )

    user_prompt = (
        f"## 작품 정보 / 설정 / 최근 맥락\n{context}{retrospect_block}\n\n"
        f"## 검수할 원고\n{cleaned_content}"
    )

    llm = get_llm()
    # SCHEMA_HINT는 generate_json 내부에서 system 끝에 자동 부착되므로 여기서 또 붙이지 않는다.
    result = await llm.generate_json(
        system=REVIEW_SYSTEM_PROMPT,
        user=user_prompt,
        schema_hint=REVIEW_SCHEMA_HINT,
        model_override=settings.claude_sonnet_model,
        max_tokens=8000,
    )
    normalized = _normalize_review_result(result)

    # 결정론적 반복 표현 검출 결과를 LLM 결과에 머지한다.
    # LLM은 한국어 문장/어절 빈도를 정확히 카운팅하지 못하므로 후처리 모듈로 분리.
    # 같은 패턴을 LLM이 부정확한 카운트로 별도 보고했다면 후처리 결과로 대체한다.
    repetition_issues = detect_repetitions(cleaned_content)
    if repetition_issues:
        normalized["issues"] = _merge_repetitions(
            list(normalized.get("issues", [])), repetition_issues
        )

    # LLM의 score는 호출마다 달라져 일관성이 없으므로 결정론 가중치로 덮어쓴다.
    normalized["score"] = _compute_score(list(normalized.get("issues", [])))

    normalized["usage"] = llm.last_usage

    # 기존 MCP 기반 검수 경로. 설정집 크기 분기 시 되살릴 수 있다.
    #
    # ctx = WriterContext(
    #     writer_id=uuid.UUID(req.writer_id),
    #     work_id=uuid.UUID(req.work_id),
    # )
    #
    # async def tool_executor(name: str, inputs: dict):
    #     return await execute_tool(name, inputs, session, ctx)
    #
    # result = await llm.generate_with_tools(
    #     system=system_prompt,
    #     user=user_prompt,
    #     tools=MCP_TOOLS,
    #     tool_executor=tool_executor,
    # )

    return normalized
