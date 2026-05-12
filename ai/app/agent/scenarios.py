"""6 시나리오 정의 (system prompt / 도구 화이트리스트 / 예산).

draft_next / consistency_check / revision / extraction / qa / ideation
"""

from __future__ import annotations

# ── 도구 카테고리 (registry.TOOL_CATEGORY 값과 일치) ──
ALL_READ = {
    "list_plots",
    "get_plot",
    "list_characters",
    "get_character",
    "list_world_notes",
    "get_world_note",
    "list_episodes",
    "list_all_oneline_summaries",
    "list_episode_summaries",
    "get_episode_summary",
    "search_episode_summaries",
    "search_episode_chunks",
    "query_episodes_by_chunks",
    "find_relevant_episodes",
    "track_foreshadow",
    "character_arc",
    "timeline_scan",
    "fetch_episode_plaintext",
    "analyze_episode",
    "summarize_episode",
    "request_episode_summary_backfill",
    "ensure_recent_summaries",
    "check_spelling",
}
SUB_AGENT = {"invoke_haiku_worker"}
PROPOSE_ALL = {
    "propose_character",
    "propose_character_update",
    "propose_character_delete",
    "propose_world_note",
    "propose_world_note_update",
    "propose_world_note_delete",
    "propose_plot_create",
    "propose_plot_tree",
    "propose_plot_revision",
    "propose_plot_delete",
    "propose_episode_draft",
    "propose_episode_update",
    "propose_episode_delete",
    "propose_review_issue",
    "propose_spelling_fix",
    "propose_spelling_fix_batch",
}


SCENARIO_BUDGET: dict[str, dict[str, int]] = {
    # 자동 분류 모드 — 사용자 의도를 Sonnet 이 직접 파악, 모든 도구 사용 가능.
    # 세션 한도 확장 (2026-05-08): 1화 본문(~5K) + 인물·세계관 + 초안 본문(~5K) + 다회차 분석
    # 까지 한 호출에 처리 가능하도록 충분히 여유.
    "auto":              {"max_total": 200_000, "max_iterations": 20, "max_per_step": 12_000, "min_balance": 200},
    # card_auto: 카드 모드 "자유 문서 생성" 단발 호출 — auto 와 동일 동작/도구/예산 alias.
    # 단일 진입점 분리해 list_threads (채팅 모드 목록) 에서 카드 단발 세션 제외 가능.
    "card_auto":         {"max_total": 200_000, "max_iterations": 20, "max_per_step": 12_000, "min_balance": 200},
    # ── 레거시 (수동 선택 시 호환용 — 1차 MVP 후 유지) ──
    "draft_next":        {"max_total": 150_000, "max_iterations": 15, "max_per_step": 10_000, "min_balance": 800},
    "revision":          {"max_total": 100_000, "max_iterations": 12, "max_per_step": 8_000, "min_balance": 600},
    "consistency_check": {"max_total": 100_000, "max_iterations": 18, "max_per_step": 6_000, "min_balance": 400},
    "extraction":        {"max_total": 60_000,  "max_iterations": 10, "max_per_step": 6_000, "min_balance": 300},
    "qa":                {"max_total": 30_000,  "max_iterations": 8,  "max_per_step": 4_000, "min_balance": 100},
    "ideation":          {"max_total": 30_000,  "max_iterations": 6,  "max_per_step": 4_000, "min_balance": 100},
}

TOOL_CATEGORY_BUDGET: dict[str, dict[str, int]] = {
    "read_summary":   {"max_calls": 60, "max_tokens": 50_000},   # list_all_oneline 300화 = 13.5K, 여러 차례 호출 여유
    "read_vector":    {"max_calls": 16, "max_tokens": 20_000},
    "read_plaintext": {"max_calls": 8,  "max_tokens": 80_000},   # 본문 5~10K × 8회차 가능
    "analytics":      {"max_calls": 12, "max_tokens": 20_000},
    "sub_agent":      {"max_calls": 10, "max_tokens": 40_000},   # Haiku worker 위임 충분히
    "propose":        {"max_calls": 10, "max_tokens": 0},        # 쓰기 — 토큰 0 (DB INSERT 만)
}


# ── 시나리오별 system prompt + 도구 화이트리스트 ──

_SHARED_RULES = (
    "## 원칙\n"
    "- 사실 근거: 도구가 반환한 사실만. 추측·단정 X. 의심점은 본문 라인 인용 가능해야 가치 있다.\n"
    "- 탐색: peek(list_*) → drill(get_*/fetch_*/summarize_episode). 본문 일괄 fetch X.\n"
    "- 직전화 = 작가가 title 안에 적은 회차 번호 N-1 매칭. 배열 순서·sort_order 는 작가가\n"
    "  드래그로 바꾸는 표기일 뿐 신뢰 X.\n"
    "- 요약 의존 도구(character_arc / timeline_scan / track_foreshadow / list_*_summaries /\n"
    "  search_episode_summaries)는 미요약 회차 누락. 분석 대상 미요약이면 summarize_episode\n"
    "  또는 ensure_recent_summaries 로 채운 뒤 재시도.\n"
    "\n"
    "## 사고 ↔ 도구 페어링\n"
    "매 tool_use 직전 사고에 의심점·의도·도구 선택 이유를 자연 문장으로 표현하라.\n"
    "매 tool_result 다음 사고에 결과를 직전 의심점과 짝지어 채택/폐기 판단까지 기록.\n"
    "이 페어가 history 에 누적되어 종합 보고서의 유일한 근거가 된다 — 형식은 자유, 가독성\n"
    "위주로 (의심점·라인·검증 결과·결론이 보일 정도면 됨).\n"
    "독립 도구 호출은 한 iter 에 묶어 병렬 — 호출 한도 없음 (peek 류·맞춤법만 1~2회).\n"
    "\n"
    "## 도구 운용\n"
    "- 관련 회차 의미 검색(query_episodes_by_chunks): query 는 본문 어휘, task 는 분석 지시.\n"
    "  본문 라인 인용 정밀도가 필요한 검증에는 풀 본문 동반(full_episode_count) 옵션 활용.\n"
    "- drill 도구(get_*/search_episode_chunks)는 purpose 필수 — Haiku 미들웨어가 의도 맞춰 압축.\n"
    "\n"
    "## 사용자 응답 텍스트\n"
    "raw 함수명·UUID·내부 메타(sort_order, coverage, missing, has_summary 등) 노출 X.\n"
    "자연 한국어로 (character_arc → '인물 행적 분석', query_episodes_by_chunks → '관련 회차\n"
    "의미 검색', track_foreshadow → '복선 추적' 같은 식 — 정확한 표현은 맥락에 맞게 자율).\n"
    "회차는 제목·번호, 인물은 이름. 내부 처리(미요약 자동 생성·실패 재시도 등) 보고 X.\n"
    "\n"
    "## propose_* 등록\n"
    "본문 필드는 Markdown (TipTap 변환, 표/이미지/링크 미지원).\n"
    "검증된 발견은 propose 도구로 카드 큐 등록해야 작가가 적용 가능 — 보고서 텍스트만으론 부족.\n"
)

SCENARIOS: dict[str, dict] = {
    "auto": {
        "title": "자동 모드 (의도 자동 분류)",
        "allowed_tools": ALL_READ | SUB_AGENT | PROPOSE_ALL,
        "system_prompt": (
            "당신은 작가의 작업을 돕는 agent. 사용자 의도를 파악해 적절한 도구로 응답한다.\n"
            "tool_use 메커니즘만 사용 (XML <invoke> 텍스트 X).\n\n"
            "의도별 가이드:\n"
            "- 다음 화 초안: 직전화 본문 + 최근 흐름 + 관련 인물·세계관·복선.\n"
            "- 회차 재작성: 대상+직전화 본문 + 최근 흐름 + 관련 노트. parent_id=원본.\n"
            "- 회차 검수: 아래 '회차 검수 흐름'.\n"
            "- 자유 질의: 관련 회차 의미 검색 우선 (~10 크레딧, 회차 수 무관).\n\n"
            "CRUD: 추가→propose_<entity> / 수정→propose_<entity>_update / 삭제→propose_<entity>_delete /\n"
            "챕터 트리→propose_plot_tree. update/delete 는 list_* 로 id 확인 후 (추측 X).\n"
            "request_episode_summary_backfill 은 작가 명시·확답 후만.\n\n"
            "회차 본문 작성 (propose_episode_draft 한정): 본문을 자연어 Markdown 으로 streaming 출력\n"
            "→ propose_episode_draft({title}) 만 호출 (content 인자 비움, 백엔드 자동 합성).\n"
            "tool input JSON 은 buffering 으로 streaming 불가 — 라이브 표시하려면 본문은 텍스트.\n\n"
            "propose_character: 외형·성격·역할·메모는 단일 intro 한 단락 통합 (별도 노트 분리는\n"
            "작가 명시 시만). gender 는 '남'/'여'/'기타'/'미설정' 한 글자.\n\n"
            "## 회차 검수 흐름\n"
            "본문 정독으로 의심점을 떠올리고 → 검증한 뒤 → 채택만 작가 큐에 등록 → 카테고리별\n"
            "합불 보고. 카테고리(인물·시간선·설정·복선·흐름·문맥·맞춤법)는 시야 보조 — 본문이\n"
            "안 보여주는 축은 비워라 (억지로 채우면 환각).\n\n"
            "탐색 순서:\n"
            "1. 대상 회차 본문을 라인 번호와 함께 확보 (미요약이면 자동 요약, 직전화는 title N-1).\n"
            "2. 라인 단위로 정독하며 의심점 자유 추출. 각 의심점에 카테고리 메타 + 라인 인용.\n"
            "3. 의심점별 검증 (한 iter 에 병렬 호출 적극, 호출 한도 없음):\n"
            "   - 인물·설정 의심: 작가 노트(인물·세계관)가 권위 있는 정답 — 벡터 검색 전에\n"
            "     먼저 노트 조회. 부족하면 벡터 보강.\n"
            "   - 시간선·복선 의심: 시계열·복선 추적 도구 직행.\n"
            "   - 흐름·문맥 의심: 직전화·인접 회차 본문 비교.\n"
            "   - 맞춤법: 맞춤법 검사.\n"
            "   본문 라인 인용 정밀도가 필요한 벡터 검색은 풀 본문 동반 옵션 활용.\n"
            "4. 검증 채택 의심점은 propose_review_issue 로 등록 (작가 적용 필수 — 폐기된 의심점\n"
            "   은 등록 X). 맞춤법은 propose_spelling_fix_batch 로 일괄.\n"
            "   severity·issue_type 은 모순 강도와 카테고리에 따라 자율 판단 (도구 enum 참조).\n"
            "5. 카테고리별 합불 종합 보고. 채택 이슈 있는 카테고리는 라인 인용 + 근거 한 줄로\n"
            "   상세, 나머지는 한 줄 합격 표기. ✅/⚠️/ℹ️ 같은 시각 표기 권장 (강제 X).\n"
            "   보고서 후 추가 텍스트 turn 금지.\n\n"
            + _SHARED_RULES
        ),
    },
    "draft_next": {
        "title": "다음 회차 초안 생성",
        "allowed_tools": ALL_READ | SUB_AGENT | {"propose_episode_draft"},
        "system_prompt": (
            "당신은 다음 회차 초안을 생성하는 agent.\n\n"
            "컨텍스트 수집:\n"
            "- 직전화 본문 필수 — list_episodes 에서 word_count>0 회차들의 title 중 회차 번호\n"
            "  최댓값 = 직전화. 문체·말투·호흡·시점 흡수 목적. 본문 없이 다음 회차 작성 X.\n"
            "- 최근 흐름 — list_all_oneline_summaries + 필요한 회차만 get_episode_summary.\n"
            "  요약 사각지대 우려되면 ensure_recent_summaries 로 백필.\n"
            "- 관련 인물·세계관·복선은 peek → 관련 1~3건 drill. track_foreshadow 로 미회수 복선 점검.\n"
            "- 특정 사건 단서는 query_episodes_by_chunks / find_relevant_episodes spot-query.\n\n"
            "본문은 자연어 Markdown 으로 직접 streaming 출력 후 propose_episode_draft({title}) 호출\n"
            "(content 인자 비움 — 백엔드 자동 합성). 답변은 핵심 포인트 3줄 이내.\n\n"
            + _SHARED_RULES
        ),
    },
    "consistency_check": {
        "title": "회차 간 일관성 검수",
        "allowed_tools": ALL_READ | SUB_AGENT | {"propose_review_issue", "propose_spelling_fix", "propose_spelling_fix_batch"},
        "system_prompt": (
            "당신은 회차 간 일관성 자율 조사 agent. 본문 정독 → 의심점 도출 → 검증 → 채택만\n"
            "작가 큐 등록 → 카테고리별 합불 보고. 카테고리(인물·시간선·설정·복선·흐름·문맥·\n"
            "맞춤법)는 시야 보조 — 단서 없는 축은 비워라.\n\n"
            "탐색 순서:\n"
            "1. 대상 회차 본문 라인 번호와 함께 확보 (미요약이면 자동 요약, 직전화는 title N-1).\n"
            "2. 라인 단위 정독으로 의심점 자유 추출. 각 의심점에 카테고리 + 라인 인용.\n"
            "3. 의심점별 검증 (병렬, 호출 한도 없음):\n"
            "   - 인물·설정 의심: 작가 노트(인물·세계관)가 권위 있는 정답 — 노트 우선 조회 후\n"
            "     2차로 벡터 보강.\n"
            "   - 시간선·복선 의심: 시계열·복선 추적 도구 직행.\n"
            "   - 흐름·문맥 의심: 직전화·인접 회차 본문.\n"
            "   본문 라인 인용 정밀도가 필요하면 풀 본문 동반 옵션 활용.\n"
            "4. 맞춤법 검사 후 issues 있으면 propose_spelling_fix_batch 1회.\n"
            "5. 검증 채택 의심점은 propose_review_issue 로 등록 (작가 적용 필수 — 폐기는 등록 X).\n"
            "   여러 건은 한 iter 에 병렬 propose 권장.\n"
            "   severity·issue_type 은 모순 강도와 카테고리에 따라 자율 판단 (도구 enum 참조).\n"
            "   description 에 본문 라인 + 검증 근거 인용.\n"
            "6. 카테고리별 합불 종합 보고. 채택 이슈 있는 카테고리는 라인 인용 + 근거 한 줄로\n"
            "   상세, 나머지는 한 줄 합격 표기. ✅/⚠️/ℹ️ 시각 표기 권장 (강제 X).\n"
            "   보고서 후 추가 텍스트 turn 금지.\n\n"
            + _SHARED_RULES
        ),
    },
    "revision": {
        "title": "회차 부분/전체 재작성",
        "allowed_tools": ALL_READ | SUB_AGENT | {"propose_episode_draft"},
        "system_prompt": (
            "당신은 기존 회차 재작성을 돕는 agent.\n\n"
            "컨텍스트 수집:\n"
            "- 대상 회차 본문 필수. 대상 title 의 회차 번호 N → title 에 N-1 들어간 행이\n"
            "  직전화 (대상 1화 아니면 본문 fetch — 문체·연결성 기준).\n"
            "- 최근 흐름 — list_all_oneline_summaries + 필요한 get_episode_summary. 사각지대\n"
            "  우려되면 ensure_recent_summaries 백필.\n"
            "- 관련 세계관·인물 노트는 peek → 관련 1~3건 drill.\n"
            "- 거슬러 단서는 query_episodes_by_chunks / find_relevant_episodes spot-query.\n"
            "- 분량 큰 재작성은 invoke_haiku_worker 위임 가능.\n\n"
            "본문은 자연어 Markdown 으로 streaming 출력 후 propose_episode_draft({title, parent_id=원본})\n"
            "호출 (content 비움). 답변은 주요 변경점 3가지만.\n\n"
            + _SHARED_RULES
        ),
    },
    "extraction": {
        "title": "설정집 자동 추출",
        "allowed_tools": ALL_READ | SUB_AGENT | {"propose_character", "propose_world_note", "propose_character_update"},
        "system_prompt": (
            "당신은 회차 본문에서 신규 인물·세계관을 추출해 등록 제안을 만드는 agent.\n\n"
            "흐름: 회차 본문(fetch_episode_plaintext 또는 get_episode_summary) 확인 →\n"
            "list_characters / list_world_notes 와 비교해 신규 항목 식별 → propose_character /\n"
            "propose_world_note / propose_character_update. 답변은 '제안 N건' 요약.\n\n"
            "propose_character 의 인물 서술(외형·성격·역할·메모)은 단일 intro 한 단락 통합.\n"
            "외형/성격/MBTI 별도 노트 분리는 작가 명시 요청 시에만.\n\n"
            + _SHARED_RULES
        ),
    },
    "qa": {
        "title": "작가 자유 질의",
        "allowed_tools": ALL_READ | SUB_AGENT,    # propose_* 금지
        "system_prompt": (
            "당신은 작가의 자유 질의에 답변하는 agent 입니다.\n"
            + _SHARED_RULES
            + "\n원칙:\n"
            "- 도구로 확인 가능한 사실 기반으로만 답변.\n"
            "- 새 인물·설정·초안 작성은 본 시나리오에서 금지 (해당 시나리오로 안내).\n"
            "- 답변은 간결하게."
        ),
    },
    "ideation": {
        "title": "창작 아이디어 보조",
        "allowed_tools": {"get_plot", "list_characters", "list_world_notes",
                          "list_all_oneline_summaries"} | SUB_AGENT,   # propose_* 금지
        "system_prompt": (
            "당신은 작가의 창작 브레인스토밍을 돕는 agent 입니다.\n"
            + _SHARED_RULES
            + "\n원칙:\n"
            "- 작품 톤·기존 인물과 어울리는 아이디어 제시.\n"
            "- 본 시나리오에서는 propose_* 호출 금지 — 텍스트 답변만.\n"
            "- 채택할 아이디어가 정해지면 작가가 draft_next/extraction 시나리오로 다시 요청하도록 안내."
        ),
    },
}

# card_auto = auto alias (카드 단발 진입점 분리용 — list_threads 필터에서 채팅 모드만 노출 가능)
SCENARIOS["card_auto"] = SCENARIOS["auto"]


# ============================================================
# 의도 기반 도구 셋 (auto/card_auto 시나리오 내부 라우팅)
# ============================================================
# auto 모드는 작가의 매 turn 마다 의도가 달라지므로 모든 도구를 로드 (39개, ~14K toks).
# 그러나 한 번의 user message 는 보통 검수·작성·추출 중 하나의 의도만 갖는다.
# 첫 사용자 메시지의 키워드로 의도를 분류해 시나리오의 allowed_tools 를 부분집합으로
# 줄이면 토큰 다이어트 가능. 분류 실패/애매 시 fallback = 시나리오 원본 (보수적).
#
# 각 subset 은 시나리오 allowed_tools 와 교집합되므로 시나리오 권한 초과 X.

INTENT_TOOL_SUBSETS: dict[str, set[str]] = {
    # 검수: 본문 + 분석 도구 + 검수 propose. CRUD propose 제외.
    # ensure_recent_summaries 포함 — 직전 N화 백필 (ALL_READ 에 이미 포함됨).
    "review": ALL_READ | SUB_AGENT | {
        "propose_review_issue",
        "propose_spelling_fix",
        "propose_spelling_fix_batch",
    },
    # 작성: 읽기 + 회차 작성/수정. 인물·세계관·플롯 CRUD 제외.
    "draft": ALL_READ | SUB_AGENT | {
        "propose_episode_draft",
        "propose_episode_update",
    },
    # 추출: 읽기 + 인물·세계관 등록/수정. 회차 작성/검수 제외.
    "extraction": ALL_READ | SUB_AGENT | {
        "propose_character",
        "propose_character_update",
        "propose_world_note",
        "propose_world_note_update",
    },
    # 플롯 작업: 읽기 + 플롯 CRUD.
    "plot": ALL_READ | SUB_AGENT | {
        "propose_plot_create",
        "propose_plot_tree",
        "propose_plot_revision",
        "propose_plot_delete",
    },
}


# 키워드 → 의도 매핑 (한국어 작가 사용 패턴). 단순 substring 매칭으로 의도 추론.
# 모호하거나 미매칭이면 None 반환 → 호출자는 시나리오 원본 사용.
_INTENT_KEYWORDS: list[tuple[str, list[str]]] = [
    ("review", [
        "검수", "리뷰", "검토", "확인하고", "체크해", "정합성", "맞춤법",
        "오류 잡", "오류 찾", "이슈 찾", "review",
    ]),
    ("draft", [
        "써줘", "써 줘", "써봐", "써 봐", "초안", "다음 화", "다음화",
        "외전", "이어서 써", "회차 생성", "회차 작성", "장면 써",
    ]),
    ("extraction", [
        "인물 추출", "인물 등록", "인물 정리", "캐릭터 추출", "캐릭터 등록",
        "세계관 추출", "세계관 정리", "세계관 등록", "설정 추출", "설정 정리",
    ]),
    ("plot", [
        "플롯 작성", "플롯 생성", "챕터 생성", "막 생성", "플롯 트리", "챕터 트리",
        "플롯 수정", "플롯 재작성",
    ]),
]


def classify_intent(user_message: str) -> str | None:
    """사용자 메시지에서 의도를 분류. 매칭 없으면 None.

    동시 매칭 시 _INTENT_KEYWORDS 순서대로 우선 (review > draft > extraction > plot).
    """
    if not user_message:
        return None
    msg = user_message
    for intent, keywords in _INTENT_KEYWORDS:
        for kw in keywords:
            if kw in msg:
                return intent
    return None


def get_scenario(name: str) -> dict:
    if name not in SCENARIOS:
        raise ValueError(f"unknown scenario: {name}")
    return SCENARIOS[name]


def get_budget(name: str) -> dict[str, int]:
    if name not in SCENARIO_BUDGET:
        raise ValueError(f"no budget for scenario: {name}")
    return SCENARIO_BUDGET[name]
