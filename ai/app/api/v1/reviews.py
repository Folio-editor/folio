"""POST /v1/reviews - 설정/맥락 기반 검수 결과를 JSON으로 반환."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import settings
from app.middleware.auth import require_internal_api_key
from app.schemas.ai_context_payload import AiContextPayload
from app.services.providers import get_llm
from app.services.rag import assemble_context
from app.services.text_extractor import extract_numbered_text, extract_plain_text

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
예: [1] 인물이 사무실 의자에 앉아 창밖을 바라보았다.

## 검수 항목

### 1. 설정 충돌 (setting_conflict)
- 인물의 외모, 성격, 관계, 능력 등이 설정집과 다른 경우
- 세계관의 규칙, 시스템, 용어가 설정과 다른 경우
- 장소, 사물의 위치나 상태가 설정과 다른 경우
- **인물의 이름·성별·나이는 1글자/1살이라도 다르면 critical로 반드시 잡아라.**
  - 한국어 숫자 표기는 동일 의미로 변환해 비교하라:
    - 열 살=10세, 스무 살=20세, 서른 살=30세, 마흔 살=40세, 쉰 살=50세
    - "20대 초반"=20~24세, "20대 후반"=25~29세
    - 카드의 명시 나이와 본문의 나이 표현이 1살이라도 다르면 모순.
  - 인물 본인이 그렇게 말하더라도, 그것이 설정과 다르면 합리화하지 말고 setting_conflict로 잡아라
    (작가가 캐릭터 컨셉으로 "거짓말쟁이/허세형"을 명시하지 않은 한).

#### 별칭/닉네임 매핑 (내부 처리 — 출력 금지)
- 등장인물 카드에 "방송 닉네임", "별칭", "상세" 항목으로 별칭/닉네임이 명시될 수 있다.
  본문의 호칭/닉네임은 카드의 본명과 동일 인물로 간주하고 그 인물의 성별·나이·직업·관계 전체를
  비교 대상으로 삼아라. 본명이 본문에 안 나와도 검사를 생략하지 마라.
- **이 매핑은 내부적으로만 수행하고, 출력에 매핑 테이블·중간 추론을 포함하지 마라.**
  결과는 issues 배열의 description/reference 필드에 충돌 사례로만 표기한다.
- 매핑이 모호하면(닉네임이 여러 인물과 겹침) 추측 대신 info로 표기하라.

### 2. 서술 충돌 (narration_conflict)
- 같은 화 내에서 앞뒤 묘사가 모순되는 경우
- "~하지 않는다"고 서술한 직후 그 행동을 하는 경우
- 한 장면 안에서 시간, 날씨, 위치가 바뀌는 경우
- **한 장면/한 화 안에서 인물의 환경이 모순되는 경우** (거주 형태, 동거인, 위치, 직업, 소지품 등)
  - 예: 같은 장면에서 "혼자 사는 원룸"이라고 한 직후 가족 구성원이 등장 → 동거인 모순
  - 예: 같은 장면에서 한 위치에 있다가 다른 위치로 묘사 → 위치 모순

### 3. 시간 논리 충돌 (time_conflict)
- 설정상 소요 시간과 본문에 서술된 시간이 맞지 않는 경우
- 설정상 단계적 과정을 즉시 완료로 서술한 경우
- 작품 내 시간 흐름이 논리적으로 맞지 않는 경우

### 4. 시대/톤 불일치 (tone_conflict)
- **작품 정보(work_meta)의 era·genre·style_memo는 검수의 1순위 기준이다.** 그 시대/장르/문체에 어울리지 않는 어휘는 적극적으로 잡아라.
  - 시대 배경에 맞지 않는 외래어·신조어·전문 용어가 캐릭터 컨셉이 아닌 화자/내레이션에서 등장하면 잡아라 (예: 현대 작품에서 사극체, 사극 작품에서 현대 외래어).
  - 캐릭터 컨셉으로 명시되지 않은 어휘 일탈은 작가 실수로 본다.
- 작품의 전체 톤과 맞지 않는 문체 전환 (구어 → 문어, 평어 → 격식체 등이 의도 없이 일어나는 경우)
- 특정 표현이나 단어가 과도하게 반복되는 경우 (구체 카운트는 후처리 모듈이 담당하므로, LLM은 "여러 번 반복됨" 정도만 지적해도 충분하다)

#### tone_conflict 예외 (지적하지 말 것)
- 인물 시점·내적 독백·자유간접화법에서의 구어체 축약은 충돌이 아니다.
  인물 머릿속 표현은 작가 시점의 정확성보다 우선한다.
- 단위 생략, 어림수, 미완성 문장이 인물의 충격·멍한 상태·일상적 화법을 나타낼 때는 의도된 문체로 본다.
- 짧은 호흡·구어체 줄임은 작품의 style_memo가 명시적으로 "정확성·격식체 유지"를 요구하지 않는 한 작가 의도로 간주한다.
- 회계·법률·기술 정확성이 장르 핵심인 작품(예: 경제물·기업물·법정물)에서만 수치·전문 용어 정확성을 엄격히 본다.
  작품 메타의 genre/style_memo에 그런 정확성 요구가 보이지 않으면 인물 화법을 우선한다.

### 5. 맥락 충돌 (context_conflict)
- 이전 화의 사건, 상태, 결과와 모순되는 경우
- 이전 화에서 확립된 인물 관계나 감정선과 다른 경우
- **심각도 하한**: 이전 화에서 명시적으로 확립된 사건·사실(인물의 행적, 사건의 원인·결과,
  관계 변화 이유, 사고 경위 등)과 본문 회상이 다른 결과/원인을 가리키면 **최소 warning**으로 잡아라.
  - info 등급은 사소한 표현 차이(같은 사건의 부수적 디테일 누락 등)에만 사용하라.
  - 핵심 사건의 인과를 바꾸는 회상 오류는 절대 info로 분류하지 마라.

### 6. 복선 충돌 (foreshadow_conflict)
- 컨텍스트의 "## 복선/떡밥" 섹션에 등록된 복선의 핵심 명제를 본문이 무력화·정면 부정·조기 무효화하는 경우.
- 특히 importance가 high인 복선은 작품의 핵심 운명/규칙이므로 반드시 본문이 일관되게 유지되어야 한다.
- unplanted 상태(아직 본문에 등장 안 한)인 복선의 핵심 명제를 본문이 단정 지어 서술하면 조기 회수 warning.
- 검수 시 모든 high importance 복선을 적극적으로 본문과 대조하라. 단순 키워드 매칭이 아니라
  복선의 description에 담긴 운명·규칙·관계가 본문에서 깨지지 않는지 의미적으로 검사하라.

## 검수 시 반드시 수행하는 사전 스캔 (출력 금지, 내부 처리)

검수 시작 전 컨텍스트의 등장인물·세계관·복선을 다음 절차로 본문과 1:1 대조하라.
**이 사전 스캔은 내부적으로만 수행하고 출력에 절차/매핑 테이블을 포함하지 마라. 결과는 issues 배열에만 담는다.**

1. **모든 등장인물 카드** (주인공·부캐릭터 무관) 각각에 대해 다음을 본문과 비교:
   - 이름·성별·나이 (한국어 숫자 표기는 환산해서 비교)
   - 직업·소속·관계 (custom_fields의 직업, 소속 등 명시 항목 포함)
   - 별칭/닉네임 (custom_fields의 방송 닉네임, 별칭, 상세 항목)
   - 페르소나·말투 (personality 항목과 본문 발화 톤이 일치하는지)
   - **반드시 등장인물 카드 sort_order 순서대로 한 명씩 차례로 검사하라.**
     - 1번 인물(주인공)을 검사한 뒤에는 반드시 2번, 3번, ... N번까지 모든 인물을 같은 깊이로 검사하라.
     - 한 인물의 충돌을 잡았더라도 그 인물에 attention을 멈추지 말고, 다른 인물 검사를 빠짐없이 진행하라.
     - 본문의 동일 키워드(직업·연령대 등)를 한 번에 처리하지 말고, **각 인물의 카드와 1:1로 따로** 비교하라.
       동일 키워드가 여러 인물에게 충돌할 수 있다.
   - **페르소나·말투 위반 예시 (적극 검출하라)**:
     - 카드에 명시된 말투/태도와 본문 발화의 톤이 불일치하면 setting_conflict warning.
     - 카드에 personality에 명시된 대사 금지 규칙을 본문에서 위반하면 setting_conflict warning.
   - 부차 인물도 절대 생략하지 마라. 본문에서 한 번이라도 언급된 인물의 모든 카드 속성을 비교 대상으로 삼는다.

2. **세계관 노트의 보조 인물·닉네임**:
   - 노트 본문에 명시된 닉네임 목록과 본문의 호칭 표기를 1글자라도 다르면 setting_conflict로 잡아라(info 이상).
   - 닉네임 일관성은 작가가 가장 자주 실수하는 영역이다. 모호하지 않으면 반드시 잡아라.

3. **세계관 노트의 시스템 룰** (능력 발동 조건, 수치, 단위 등):
   - 본문에 해당 룰이 적용되어야 할 장면이 등장하면 룰을 위반·이탈했는지 확인.
   - **있어야 할 반동/대가가 본문에 빠진 경우**도 narration_conflict info로 표기 가능
     (예: 능력 사용 후 명시된 부수 효과가 본문에 누락).

#### 캐릭터 룰 체크리스트 (필수, 한 명씩 차례로)

"## 등장인물" 블록의 각 항목은 `[C1]`, `[C2]` 같은 번호로 표기되어 있다.
**각 [C번호] 인물에 대해 한 명씩 차례로 본문과 1:1 대조하라.** 한 인물당 다음 4개 점검을 모두 수행:

- (1) **소지품·물건 위치 (정확한 명사 매칭 필수)**: custom_fields/personality/상세에 명시된
  소지품의 보관·휴대 위치 명사를 본문 묘사와 **단어 단위로** 비교하라.
  - 위치 명사가 한 단어라도 다르면 즉시 setting_conflict warning. "비슷한 위치"로 합리화하지 마라.
  - 카드에 위치가 여러 곳 명시돼 있어도, 본문 묘사가 그중 어느 곳과도 일치하지 않으면 위반이다.
- (2) **대사·행동 금지 규칙**: custom_fields의 "대사 금지 규칙", "행동 규칙" 등에 명시된
  금지 항목을 본문이 위반하는가?
  - 카드의 personality 항목에 명시된 말투(차갑고 단호함/과묵함 등)가 본문 발화와 일치하지 않으면 setting_conflict warning.
- (3) **생활 패턴·습관**: custom_fields의 "버릇·생활패턴" 등에 명시된 일상이 본문 장면과
  일치하는가? (예: "운전을 하지 않음" 명시 → 본문에 운전 장면 → 위반)
- (4) **이름·성별·나이·직업·관계**: 헤더 (성별·나이) 및 custom_fields의 직업/관계가
  본문과 일치하는가? (한국어 숫자 환산 적용)

**각 [C1]부터 [Cn]까지 한 명도 빠뜨리지 마라.** 본문에 한 번이라도 등장하거나 이름이 언급된 인물은 반드시 검사하라.
체크리스트 자체나 점검 절차는 출력에 포함하지 마라.

#### 세계관 룰 체크리스트 (필수, 한 항목씩 차례로)

"## 세계관 설정" 블록의 각 항목은 `[W1]`, `[W2]` 같은 번호로 표기되어 있다.
**각 번호 항목을 한 줄씩 차례로 본문과 1:1 대조하라.** 한 항목당 다음 4개 점검을 모두 수행:

- (1) 항목에 명시된 **수치**(시간·분량·횟수·금액·단위)가 본문에서 정확히 일치하는가?
- (2) 항목에 명시된 **금지·제약 조건**(불가, 못, 없음, 안 됨)을 본문이 위반하지 않는가?
- (3) 항목에 명시된 **위치·소지품**이 본문 내 묘사와 일치하는가?
- (4) 항목에 명시된 **부수적 효과/반동**이 본문 장면에서 적절히 등장하는가?

**각 항목 검사를 마쳤다고 가정하지 말고 [W1]부터 [Wn]까지 빠짐없이 진행하라.**
모든 항목을 머릿속으로 한 번씩 검토한 뒤, 위반 사례만 issues 배열에 출력하라.
체크리스트 자체나 점검 절차는 출력에 포함하지 마라.

4. **모든 importance high 복선** 각각에 대해 본문이 명제를 무력화·정면 부정하는지 검사 (foreshadow_conflict 항목 참조).

## 검사 강화 지시 (반드시 적극적으로 점검하라)

### 인물 관계 모순 (setting_conflict, critical)
- 등장인물 카드의 '상세' 노트, '성격' 설명, '관계' 항목 등에 명시된 인물 간 관계와
  본문 묘사가 모순되면 반드시 critical로 잡아라.
- 특히 본문에 "처음 만난", "어제 알게 된", "낯선" 등 관계 시작점에 대한 표현이 나올 때,
  설정에 이미 확립된 관계가 있다면 즉시 충돌이다.
- 캐릭터 컨셉이나 농담/거짓말로 합리화하지 마라. 그것이 이전 화 본문에 명시되어 있지 않으면 모순이다.

### 세계관 핵심 규칙 위반 (setting_conflict, critical)
- 세계관 설정에 명시된 능력 발동 조건, 시스템 제약, 수치는
  본문이 설정과 정확히 일치해야 한다. 한 글자라도 다르면 critical로 잡아라.
- "캐릭터 본인이 의문을 품었으니 의도된 일시 이상"으로 합리화하지 마라.
  의도된 일시 이상은 작가가 별도 메모로 명시한 경우에만 인정한다.

### 회차 간 시간 충돌 (time_conflict)
- "## 회차별 시간 흐름" 섹션이 컨텍스트에 주어지면, 회차별 시간 표지를 누적해 본문의
  시간 진술과 비교하라.

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

## 추가 검수 항목 (LLM 직접 판단 — 결정론 후처리 폐기로 전부 LLM 책임)

다음 항목들은 별도 결정론 함수가 없으므로 본 시스템 프롬프트의 지시를 따라 LLM 이 직접 점검하라.

### 동일 표현·문장 반복 (tone_conflict / info 또는 warning)
- 동일하거나 거의 동일한 표현/문장이 한 화 안에서 3회 이상 등장하면 지적하라.
- 짧은 반복(2~3 어절)은 의도된 강조일 수 있으니 4회 이상으로 임계 강화.
- 같은 어구의 어미 변형(고개를 끄덕였다 / 고개를 끄덕이며)도 반복으로 본다. 한국어 형태소 차이는 무시.
- 반복 카운트는 정확하지 않아도 되니 "여러 번 반복됨" 정도로 description 에 명시.

### 메타 회차 참조 (narration_conflict / warning)
- 본문이 자기 작품을 메타로 가리키는 표현 — "3화에서~", "5화 때~" 같은 회차 번호 직접 언급 — 은 디제틱 위반.
- 단 본문에 등장하는 일반 단어 (예: "5화재", "10화학") 와 혼동하지 말고 "N화에서/에/때/의/쯤" 같은 명확한 메타 마커가 붙은 경우만 지적.

### 날짜·요일 일관성 (narration_conflict / warning)
- "2025년 5월 9일 금요일" 같이 날짜+요일이 함께 나오면 캘린더 일치를 자체 검증.
- 작품 내 가상 달력은 검증 대상이 아니다 (작가가 명시하지 않은 한).

### 회상·시간 흐름 모순 (time_conflict / warning)
- 본문의 "한 달 전", "5년 전" 같은 회상 시간 표지가 이전 회차들의 누적 경과 시간과 모순되면 지적.
- 정확한 누적 시간은 모를 수 있으니 컨텍스트의 회차 본문에서 자체 추정.

## 점수 산정 (score 필드)
- score 는 0~100 정수. 100점에서 issue severity 별로 차감:
  - critical: -10 / warning: -5 / info: -2
- 차감 합 적용 후 0 미만이면 0 으로 한정.
- LLM 이 직접 계산하여 응답에 포함하라.

## 절대 지적하지 말 것 (모든 타입 공통)
- **인물 시점 자유간접화법에서의 수치·단위 표현**: 인물이 머릿속으로 큰 숫자를 떠올리거나 충격받아 중얼거릴 때 단위 생략, 어림수, 축약은 의도된 문체다. 절대 어떤 type으로도 지적하지 마라.
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
    # PR5 — 클라이언트 평문 RAG 컨텍스트.
    context: AiContextPayload


# 결정론 후처리 (점수 산정·반복 머지) 는 Clean-up Phase (2026-05) 에서 폐기됨.
# LLM 이 검수 시스템 프롬프트의 지시에 따라 직접 score 와 issues 를 산정한다.


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
        payload=req.context,
        work_id=req.work_id,
        writer_id=req.writer_id,
        storyline=review_query,
        current_episode_num=req.episode_number,
        mode="review",
    )
    cleaned_content = extract_numbered_text(req.content)

    user_prompt = (
        f"## 작품 정보 / 설정 / 최근 맥락\n{context}\n\n"
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

    # 결정론 후처리 (반복 검출·구조 검증·결정론 점수 산정) 와 MCP tool_use 경로는
    # Clean-up Phase (2026-05) 에서 폐기됨. 이유:
    #   - 한국어 형태소 부재로 false positive 양산
    #   - 작가가 카드에 명시 안 한 디테일은 검수 대상이 아님 (작가 자유도)
    #   - LLM 사고 권위화·확장성 부재
    # 동일 표현 반복·메타 회차 참조·날짜-요일 일관성·회상 시간 흐름은 모두 LLM 이
    # REVIEW_SYSTEM_PROMPT 의 지시에 따라 직접 판단한다.
    normalized["usage"] = llm.last_usage

    return normalized
