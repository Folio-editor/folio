"""MCP 도구 레지스트리.

Anthropic messages.create(tools=[...])에 넘길 JSONSchema 목록과
도구 이름 → 핸들러 매핑.
"""

from __future__ import annotations

from typing import Any, Callable, Coroutine

from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.mcp.tools.character import get_character, list_characters
from app.mcp.tools.episode_analytics import character_arc, timeline_scan, track_foreshadow
from app.mcp.tools.episode_plaintext import (
    analyze_episode,
    fetch_episode_plaintext,
    list_episodes,
    summarize_episode,
)
from app.mcp.tools.episode_search import (
    find_relevant_episodes,
    query_episodes_by_chunks,
    search_episode_chunks,
)
from app.mcp.tools.episode_summary import (
    get_episode_summary,
    list_all_oneline_summaries,
    list_episode_summaries,
    search_episode_summaries,
)
from app.mcp.tools.plot import get_plot, list_plots
from app.mcp.tools.proposals import (
    propose_character,
    propose_character_delete,
    propose_character_update,
    propose_episode_delete,
    propose_episode_draft,
    propose_episode_update,
    propose_plot_create,
    propose_plot_delete,
    propose_plot_revision,
    propose_plot_tree,
    propose_review_issue,
    propose_world_note,
    propose_world_note_delete,
    propose_world_note_update,
)
from app.mcp.tools.sub_agent import invoke_haiku_worker
from app.mcp.tools.summary_backfill import request_episode_summary_backfill
from app.mcp.tools.world_note import get_world_note, list_world_notes

# (구) get_plan 도구는 ERD 정리 2단계로 plan 테이블이 폐기되어 함께 제거됨.
# 장르·분위기는 work 메타에서, 자유 기획 문서는 별도 plan_note 도구(향후 추가)에서 조회.

MCP_TOOLS: list[dict[str, Any]] = [
    {
        "name": "list_plots",
        "description": (
            "**peek 용** — 작품의 모든 플롯 제목·상태·parent_id 만 (본문 X). "
            "여러 플롯 중 관련 있는 것만 추리는 첫 단계. 본문은 get_plot(title) 단건으로 drill."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_plot",
        "description": (
            "**drill 용** — 단건 플롯 본문 fetch. peek (list_plots) 후 관련 있는 제목만 호출. "
            "title 또는 plot_id 중 하나 지정. 인자 없이 호출 시 list_plots 와 동일 (호환)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "(옵션) 조회할 플롯 제목"},
                "plot_id": {"type": "string", "description": "(옵션) 조회할 플롯 id"},
            },
            "required": [],
        },
    },
    {
        "name": "list_characters",
        "description": (
            "**peek 용** — 등장 인물 이름·성별·나이만 (간략 목록). "
            "인물 중복·기존 페르소나 점검 시 첫 단계. 상세 프로필은 get_character(name) 단건."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_character",
        "description": (
            "**drill 용** — 단건 인물 풀 프로필 (외모·성격·MBTI·custom_fields 등). "
            "peek (list_characters) 후 관련 있는 인물만 호출."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "조회할 캐릭터 이름",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "list_world_notes",
        "description": (
            "**peek 용** — 세계관 노트 제목·parent_id 만 (본문 X). "
            "신규 세계관 자료 등록 전 중복 점검 / 관련 노트 식별의 첫 단계. "
            "본문은 get_world_note(name) 단건."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_world_note",
        "description": (
            "**drill 용** — 단건 세계관 노트 본문 fetch. peek (list_world_notes) 후 관련 있는 제목만 호출."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "조회할 세계관 노트 이름",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "query_episodes_by_chunks",
        "description": (
            "**자유 텍스트 질의** — 작품 전체에서 query 와 의미 가까운 chunk top-k → Haiku 합성 답변. "
            "고정 ~10 크레딧, 회차 수 무관. 예: '주인공의 트라우마 묘사', '한중 이주 장면'. "
            "기준 회차에서 출발하는 관련성 탐색은 find_relevant_episodes (~1 크레딧)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "검색 + 합성 질의 (한국어)"},
                "k": {"type": "integer", "description": "검색 chunk 수 (기본 10, 상한 30)", "default": 10},
                "sort_order_min": {"type": "integer", "description": "(옵션) 회차 범위 시작"},
                "sort_order_max": {"type": "integer", "description": "(옵션) 회차 범위 끝"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_episode_chunks",
        "description": (
            "(저수준) 벡터 유사도 top-k chunks 만 raw 반환 — Haiku 합성 안 함. "
            "보통은 query_episodes_by_chunks 가 더 효율적이며 이 도구는 chunk 자체를 보고 싶을 때만."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "검색 쿼리 (장면 설명, 키워드 등)",
                },
                "k": {
                    "type": "integer",
                    "description": "반환할 결과 수 (기본값 5)",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "list_all_oneline_summaries",
        "description": (
            "작품 전체 회차의 한 줄 요약·시점·톤만 sort_order 순서로 1회 호출 반환. "
            "agent 가 작품 흐름 / 일관성 검수 시작점에 활용 (300화 ≈ 13.5K tok). "
            "상세 필요 시 get_episode_summary(sort_order) 또는 list_episode_summaries 로 drill-down."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "list_episode_summaries",
        "description": (
            "회차 요약 목록을 sort_order 순서로 조회합니다. "
            "각 행은 한 줄 요약·시점 인물·톤·등장 인물·끝점만 담은 간략 정보. "
            "회차 흐름을 빠르게 스캔할 때 사용합니다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "start_sort": {"type": "integer", "description": "시작 sort_order (포함)"},
                "end_sort": {"type": "integer", "description": "끝 sort_order (포함)"},
                "limit": {"type": "integer", "description": "최대 결과 수 (기본 20, 상한 100)", "default": 20},
                "offset": {"type": "integer", "description": "오프셋 (기본 0)", "default": 0},
            },
            "required": [],
        },
    },
    {
        "name": "get_episode_summary",
        "description": (
            "**캐시 hit 용** — episode_summary 행 존재 시 (list_episodes 의 has_summary=True) "
            "단건 12-필드 메타 반환 (Haiku 0회). 행 없으면 null → summarize_episode 호출 필요."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sort_order": {"type": "integer", "description": "조회할 회차 sort_order"},
            },
            "required": ["sort_order"],
        },
    },
    {
        "name": "search_episode_summaries",
        "description": (
            "회차 요약 키워드 검색 (Option A — 평문 일괄 복호화 + Python substring). "
            "PostgreSQL FTS 대신 application-side 매칭이라 어형 변화 (예: '발견'으로 '발견하다' hit) 잡음. "
            "scope 차원 필터: 'all' (기본), 'character:<이름>', 'location:<장소>', 'tone:<톤>'. "
            "300화 기준 ~100~200ms. 의미적 유사 검색은 query_episodes_by_chunks (벡터)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "keyword": {"type": "string", "description": "검색 키워드"},
                "scope": {
                    "type": "string",
                    "description": "필터 범위 ('all' / 'character:앤' / 'location:초록지붕집' / 'tone:긴장감 고조')",
                    "default": "all",
                },
                "limit": {"type": "integer", "description": "최대 결과 수 (기본 10, 상한 50)", "default": 10},
            },
            "required": ["keyword"],
        },
    },
    # ───────── Phase 4: cross-episode 분석 ─────────
    {
        "name": "track_foreshadow",
        "description": (
            "심어진 복선과 회수된 회차를 짝지어 반환합니다. "
            "paid_off_sort 가 NULL 이면 미회수. 검수 시 1회 호출로 회수 누락 점검."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "특정 복선 이름 (생략 시 전체)"},
            },
            "required": [],
        },
    },
    {
        "name": "character_arc",
        "description": (
            "특정 인물의 회차별 변화 시계열 반환. "
            "sort_order, oneline_summary, tone, is_pov, key_events, cliffhanger."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "추적할 인물 이름"},
                "start_sort": {"type": "integer"},
                "end_sort": {"type": "integer"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "timeline_scan",
        "description": (
            "회차별 time_progression 과 cliffhanger 만 sort_order 순서로 반환. "
            "시간선 일관성 검수에 사용."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "start_sort": {"type": "integer"},
                "end_sort": {"type": "integer"},
            },
            "required": [],
        },
    },
    # ───────── Phase 4: episode 직접 조회 ─────────
    {
        "name": "list_episodes",
        "description": (
            "**peek 용** — 회차 존재·has_summary 확인. 모든 회차 작업의 첫 단계. "
            "각 행: {sort_order, title, status, word_count, has_summary}. "
            "drill: has_summary=True 면 get_episode_summary, False 면 summarize_episode."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    # ───────── Phase 4.6: 회차-기준 관련성 탐색 ─────────
    {
        "name": "find_relevant_episodes",
        "description": (
            "**peek 용** — 기준 회차의 chunk 임베딩과 의미상 가까운 다른 회차 top-k. "
            "DB-only ~1 크레딧 (Haiku·임베딩 호출 0회). 다음 화 초안 시 직전 화 기준으로 호출 → "
            "관련 있는 회차만 골라 summarize_episode/get_episode_summary 로 drill. "
            "**전제: reference_sort_order 회차는 본문이 작성되어 있어야 함 (word_count>0)**. "
            "list_episodes 결과의 word_count 또는 has_summary 로 사전 확인. "
            "본문 비어있는 회차를 reference 로 주면 결과 0 + suggested_reference 반환 — 그걸로 재호출."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "reference_sort_order": {"type": "integer", "description": "기준 회차 sort_order"},
                "k": {"type": "integer", "description": "top-k (기본 5, 상한 20)", "default": 5},
                "exclude_self": {"type": "boolean", "description": "기준 회차 자기 자신 제외 (기본 true)", "default": True},
            },
            "required": ["reference_sort_order"],
        },
    },
    # ───────── Phase 4: 평문 fetch ─────────
    {
        "name": "summarize_episode",
        "description": (
            "**drill 용** — 단건 회차 12-필드 양식 요약 (oneline·summary·POV·인물·장소·핵심 사건·tone·"
            "복선 planted/paid_off·키워드). 결과는 episode_summary 에 자동 UPSERT — "
            "다음 호출 시 캐시 hit (Haiku 0회). 표준 회차 흡수에 우선 사용. "
            "자유 task (양식 외 분석) 는 analyze_episode."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sort_order": {"type": "integer", "description": "조회할 회차 sort_order"},
                "force_regenerate": {
                    "type": "boolean",
                    "description": "캐시 무시하고 재생성 (기본 false)",
                    "default": False,
                },
            },
            "required": ["sort_order"],
        },
    },
    {
        "name": "analyze_episode",
        "description": (
            "**drill 용 (자유 task)** — 단건 회차 본문에서 task 별 추출. "
            "12-필드 표준 요약은 summarize_episode 사용. 본 도구는 양식 외 분석 (예: '복선 회차별 추적', "
            "'특정 인물 대사만 추출') 에 한정. Haiku 결과 1회성 — episode_summary 적재 X."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sort_order": {"type": "integer", "description": "조회할 회차 sort_order"},
                "task": {
                    "type": "string",
                    "description": "Haiku 가 본문에서 추출할 작업 지시 (한국어)",
                },
            },
            "required": ["sort_order", "task"],
        },
    },
    {
        "name": "fetch_episode_plaintext",
        "description": (
            "**drill 용 (raw)** — 회차 평문 그대로 fetch (Vault Transit). "
            "재작성·인용·정확한 문장 분석에만. 정보 추출이 목적이면 summarize_episode 또는 "
            "analyze_episode 가 ~70% 저렴. 토큰 비용 큼 — 호출 제한적. "
            "검수 (propose_review_issue) 시엔 with_line_numbers=true 로 호출 — [N] 라인 번호 prefix 형식 본문 반환."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sort_order": {"type": "integer", "description": "조회할 회차 sort_order"},
                "with_line_numbers": {
                    "type": "boolean",
                    "description": (
                        "true 면 본문을 '[1] ...\\n[2] ...' 형식으로 반환. propose_review_issue 의 "
                        "lines 필드와 1:1 매칭되는 인덱스. 검수 목적이면 반드시 true. "
                        "재작성·인용 등 평문 그대로 필요할 땐 false (기본값)."
                    ),
                    "default": False,
                },
            },
            "required": ["sort_order"],
        },
    },
    # ───────── Phase 4.5: 요약 일괄 백필 ─────────
    {
        "name": "request_episode_summary_backfill",
        "description": (
            "**사용자 명시 요청 + 확답 후만** — status='완성' + 미요약/stale 회차들의 요약 task 를 "
            "Celery 큐에 적재. 작가에게 회차당 Haiku 비용 청구되므로 임의 트리거 X. "
            "단발 회차 요약은 summarize_episode (agent run 내 처리) 가 더 가벼움. "
            "300화 일괄 백필처럼 명시적 요청에만 사용."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "start_sort": {"type": "integer", "description": "(옵션) 시작 sort_order (포함)"},
                "end_sort": {"type": "integer", "description": "(옵션) 끝 sort_order (포함)"},
                "limit": {
                    "type": "integer",
                    "description": "한 번에 적재 max (기본 50, 상한 200)",
                    "default": 50,
                },
            },
            "required": [],
        },
    },
    # ───────── Phase 4: sub-agent ─────────
    {
        "name": "invoke_haiku_worker",
        "description": (
            "Haiku 모델에 sub-task 위임. 무거운 분류·요약·재작성을 위임하여 "
            "Sonnet planner 의 토큰 사용을 절감. 결과는 {result, usage} 반환."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "task": {"type": "string", "description": "Haiku 가 수행할 작업 지시"},
                "context": {
                    "type": "object",
                    "description": "task 수행에 필요한 컨텍스트 객체",
                },
                "max_tokens": {
                    "type": "integer",
                    "description": "Haiku 응답 max_tokens (200~1500)",
                    "default": 1500,
                },
            },
            "required": ["task"],
        },
    },
    # ───────── Phase 4: 작가 승인 큐 (extraction_suggestion 에 pending) ─────────
    {
        "name": "propose_character",
        "description": (
            "신규 등장 인물 등록 제안 (작가 승인 후 character 테이블 INSERT). "
            "외형·성격을 포함한 모든 인물 서술은 단일 'intro' 한 단락으로 합쳐 작성한다 — "
            "외형/성격을 별도 노트로 분리하지 말 것. 작가가 '외형 노트 따로 만들어줘' 등 "
            "명시적으로 지시한 경우에 한해 propose_character_update(field='appearance' 등) 사용."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "role": {"type": "string"},
                "gender": {
                    "type": "string",
                    "enum": ["남", "여", "기타", "미설정"],
                    "description": (
                        "프론트 위지윅이 아이콘으로 매핑하는 정규 값만 허용. "
                        "'남성'/'여성'/'male'/'female' 등 변형 금지 — 반드시 '남'/'여'/'기타'/'미설정' 한 글자."
                    ),
                },
                "age": {"type": "string"},
                "intro": {
                    "type": "string",
                    "description": (
                        "인물 한 줄 소개 + 외형 + 성격 + 기타 메모를 한 본문에 Markdown 으로 합쳐 작성. "
                        "권장 구조: '## 외형\\n...\\n\\n## 성격\\n...\\n\\n## 메모\\n- 항목' 식으로 "
                        "h2 소제목 + 단락/목록 활용. 별도 외형/성격 노트로 분리하지 말 것."
                    ),
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "propose_world_note",
        "description": (
            "신규 세계관 노트 등록 제안 (작가 승인 후 world_note 테이블 INSERT). "
            "content 는 Markdown 으로 작성 — 백엔드가 위지윅(TipTap) doc 으로 자동 변환."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "content": {
                    "type": "string",
                    "description": (
                        "세계관 본문 (Markdown). 제목(##~###), **굵게**, *기울임*, 목록(-/1.), "
                        "인용(>), 코드블록 사용 가능. 표/이미지/링크 사용 금지."
                    ),
                },
                "category": {"type": "string"},
            },
            "required": ["name", "content"],
        },
    },
    {
        "name": "propose_character_update",
        "description": (
            "기존 인물 프로필 수정 제안 (작가 승인 후 character 테이블 UPDATE 또는 "
            "character_note 별도 행 INSERT). 'name'/'gender'/'age' 는 character 테이블 직속 "
            "컬럼 갱신, 그 외 (appearance/personality/mbti 등) 는 새 character_note 행 추가. "
            "★ 외형/성격/MBTI 등 별도 노트 추가는 작가가 명시적으로 요청한 경우에만 사용. "
            "그렇지 않으면 인물 서술은 intro 본문에 통합한다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
                "field": {
                    "type": "string",
                    "description": (
                        "name/gender/age (character 직속) 또는 appearance/personality/mbti 등 "
                        "(character_note 신규 행). 후자는 작가 명시 요청 시에만."
                    ),
                },
                "new_value": {
                    "type": "string",
                    "description": (
                        "field='gender' 일 때는 반드시 '남'/'여'/'기타'/'미설정' 중 하나 (한 글자). "
                        "'남성'/'male' 등 변형 입력 금지 — 프론트 아이콘 매핑 실패 원인."
                    ),
                },
                "reason": {"type": "string", "description": "수정 사유 (작가가 검토할 때 참고)"},
            },
            "required": ["character_id", "field", "new_value", "reason"],
        },
    },
    {
        "name": "propose_plot_revision",
        "description": (
            "플롯 줄거리 재작성 제안 (작가 승인 후 plot 테이블 UPDATE). "
            "new_outline 은 Markdown 으로 — 위지윅 자동 변환."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "plot_id": {"type": "string"},
                "new_outline": {
                    "type": "string",
                    "description": (
                        "새 플롯 본문 (Markdown). 막/장면 구조는 ##/### 소제목, 핵심 사건은 - 목록, "
                        "강조는 **굵게** 정도로 절제."
                    ),
                },
                "reason": {"type": "string"},
            },
            "required": ["plot_id", "new_outline", "reason"],
        },
    },
    {
        "name": "propose_episode_draft",
        "description": (
            "신규 회차 (다음 화 또는 외전) 초안 INSERT 제안. "
            "기존 회차 본문/제목 수정은 propose_episode_update 사용. "
            "작가 승인 시 episode 로 INSERT (status='작성중'). "
            "content 는 Markdown — 위지윅 자동 변환."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "content": {
                    "type": "string",
                    "description": (
                        "회차 본문 (Markdown). 작품 분위기 해치지 않게 강조 절제: 대화·서술 위주, "
                        "꼭 필요할 때만 **굵게** / *기울임*. 단락 구분은 빈 줄. "
                        "장면 전환 표현은 별도 마크업 없이 빈 줄 + ' * * * ' 같은 기호 단락."
                    ),
                },
                "parent_id": {"type": "string", "description": "분기/외전인 경우 부모 episode id"},
                "reference_episodes": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "참조한 회차 sort_order 들",
                },
            },
            "required": ["title", "content"],
        },
    },
    # ───────── Phase 4.5: CRUD 확장 ─────────
    {
        "name": "propose_character_delete",
        "description": (
            "기존 인물 삭제 제안. character_id 는 list_characters 결과의 id 사용. "
            "승인 시 character 행 + 모든 character_note CASCADE 삭제. 되돌릴 수 없음."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
                "reason": {"type": "string", "description": "삭제 사유 (작가 검토용)"},
            },
            "required": ["character_id", "reason"],
        },
    },
    {
        "name": "propose_world_note_update",
        "description": (
            "기존 세계관 노트의 이름·내용 수정 제안. name/content 중 하나 이상 필수. "
            "world_note_id 는 list_world_notes 결과의 id 사용."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "world_note_id": {"type": "string"},
                "name": {"type": "string", "description": "(옵션) 새 이름"},
                "content": {"type": "string", "description": "(옵션) 새 내용 (Markdown — 위지윅 TipTap 자동 변환)"},
                "reason": {"type": "string"},
            },
            "required": ["world_note_id", "reason"],
        },
    },
    {
        "name": "propose_world_note_delete",
        "description": "기존 세계관 노트 삭제 제안. 승인 시 영구 삭제 + 자식 노트 CASCADE.",
        "input_schema": {
            "type": "object",
            "properties": {
                "world_note_id": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["world_note_id", "reason"],
        },
    },
    {
        "name": "propose_episode_update",
        "description": (
            "기존 회차의 제목·본문·status 직접 수정 제안 (원본 갱신). "
            "신규 회차 작성은 propose_episode_draft 사용. "
            "title/content/status 중 하나 이상 필수."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "episode_id": {"type": "string"},
                "title": {"type": "string", "description": "(옵션) 새 제목"},
                "content": {"type": "string", "description": "(옵션) 새 본문 (Markdown — 위지윅 TipTap 자동 변환)"},
                "status": {
                    "type": "string",
                    "description": "(옵션) '작성중' / '완성' / '발행' 등 평문 상태",
                },
                "reason": {"type": "string"},
            },
            "required": ["episode_id", "reason"],
        },
    },
    {
        "name": "propose_plot_create",
        "description": (
            "신규 플롯(막/챕터) 생성 제안. title 과 content (줄거리·계획) 필수. "
            "status 는 '예정' / '작성중' / '완료' 등 평문. parent_id 로 하위 플롯 트리 구성."
            "기존 플롯 수정은 propose_plot_revision."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "플롯 제목 (예: '1막 만남')"},
                "content": {"type": "string", "description": "플롯 줄거리·계획 (Markdown — 위지윅 TipTap 자동 변환)"},
                "status": {"type": "string"},
                "parent_id": {"type": "string", "description": "(옵션) 상위 플롯 id"},
                "reason": {"type": "string"},
            },
            "required": ["title", "content", "reason"],
        },
    },
    {
        "name": "propose_plot_tree",
        "description": (
            "부모 챕터 + 자식 N개를 단일 제안으로 묶어서 등록. "
            "승인 1회 = 부모 + 자식 모두 트랜잭션 INSERT (parent_id 자동 연결). "
            "예: '챕터1 (1~4화 정리)' + 자식 ['1화 만남', '2화 갈등', '3화 위기', '4화 해결']. "
            "사용자가 '한꺼번에 / 묶어서 / 트리로' 같은 표현 쓰면 propose_plot_create 다중 호출 대신 본 도구 사용."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "root_title": {"type": "string", "description": "부모 챕터 제목 (예: '챕터1')"},
                "root_content": {"type": "string", "description": "부모 챕터 줄거리·요약 (Markdown — 위지윅 자동 변환)"},
                "root_status": {"type": "string", "description": "(옵션) 부모 status"},
                "parent_id": {"type": "string", "description": "(옵션) 더 상위 막의 id"},
                "children": {
                    "type": "array",
                    "description": "자식 플롯 배열 (각 자식 = 1화 분량 또는 sub-chapter)",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "content": {
                                "type": "string",
                                "description": "자식 플롯 본문 (Markdown — 위지윅 자동 변환)",
                            },
                            "status": {"type": "string"},
                        },
                        "required": ["title", "content"],
                    },
                    "minItems": 1,
                },
                "reason": {"type": "string"},
            },
            "required": ["root_title", "root_content", "children", "reason"],
        },
    },
    {
        "name": "propose_plot_delete",
        "description": "기존 플롯 삭제 제안. 자식 플롯 CASCADE 삭제. 되돌릴 수 없음.",
        "input_schema": {
            "type": "object",
            "properties": {
                "plot_id": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["plot_id", "reason"],
        },
    },
    {
        "name": "propose_episode_delete",
        "description": "기존 회차 삭제 제안. 승인 시 episode + 자식 회차 CASCADE 삭제. 되돌릴 수 없음.",
        "input_schema": {
            "type": "object",
            "properties": {
                "episode_id": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["episode_id", "reason"],
        },
    },
    # ───────── Phase 5: 검수 발견 사항 (위치 매핑) ─────────
    {
        "name": "propose_review_issue",
        "description": (
            "회차 검수 결과로 발견한 이슈 1건을 작가 승인 큐에 적재. 본 도구는 자동 수정 적용을 "
            "하지 않고, 프론트 채팅 응답에서 '본문에서 보기' 버튼으로 본문 위치 점프 + 흐릿한 "
            "하이라이트를 제공한다. 작가가 직접 본문을 고친 뒤 승인/거절로 닫음. "
            "★ 호출 전 fetch_episode_plaintext(sort_order=N, with_line_numbers=True) 로 라인 "
            "번호 형식 ([1] ...) 본문을 fetch 해야 lines 정확. 모호한 추측 금지 — 본문에 명시적 "
            "근거가 있는 발견만."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "episode_id": {
                    "type": "string",
                    "description": (
                        "검수 대상 회차의 id (uuid 36자). list_episodes / fetch_episode_plaintext / "
                        "get_episode_summary 응답의 id 필드를 그대로 사용. sort_order 숫자나 "
                        "'9화' 같은 title 절대 금지 — UUID 형식 검증 실패."
                    ),
                },
                "lines": {
                    "type": "array",
                    "items": {"type": "integer", "minimum": 1},
                    "description": "이슈가 위치한 본문 line 번호 (1-based, 위 fetch 의 [N] 인덱스). 1~3 개 권장.",
                    "minItems": 1,
                },
                "severity": {
                    "type": "string",
                    "enum": ["critical", "warning", "info"],
                    "description": "심각도 — critical: 명백한 모순/오류, warning: 일관성 우려, info: 개선 제안",
                },
                "issue_type": {
                    "type": "string",
                    "enum": [
                        "setting_conflict",
                        "tone_conflict",
                        "foreshadow_unresolved",
                        "character_arc",
                        "timeline",
                        "other",
                    ],
                    "description": "이슈 분류 — 설정 충돌 / 톤 충돌 / 미회수 복선 / 인물 행적 모순 / 시간선 모순 / 기타",
                },
                "description": {
                    "type": "string",
                    "description": "무엇이 문제인지 1~3 문장. 본문에 명시된 근거 인용 권장.",
                },
                "suggestion": {
                    "type": "string",
                    "description": "(옵션) 권고 수정 방향. 작가가 본문 고칠 때 참고용.",
                },
            },
            "required": ["episode_id", "lines", "severity", "issue_type", "description"],
        },
    },
]

ToolHandler = Callable[..., Coroutine[Any, Any, Any]]

_HANDLER_MAP: dict[str, ToolHandler] = {
    "get_character": get_character,
    "get_plot": get_plot,
    "list_plots": list_plots,
    "list_characters": list_characters,
    "list_world_notes": list_world_notes,
    "get_world_note": get_world_note,
    "search_episode_chunks": search_episode_chunks,
    "query_episodes_by_chunks": query_episodes_by_chunks,
    "find_relevant_episodes": find_relevant_episodes,
    "list_all_oneline_summaries": list_all_oneline_summaries,
    "list_episode_summaries": list_episode_summaries,
    "get_episode_summary": get_episode_summary,
    "search_episode_summaries": search_episode_summaries,
    # Phase 4
    "track_foreshadow": track_foreshadow,
    "character_arc": character_arc,
    "timeline_scan": timeline_scan,
    "list_episodes": list_episodes,
    "fetch_episode_plaintext": fetch_episode_plaintext,
    "analyze_episode": analyze_episode,
    "summarize_episode": summarize_episode,
    "request_episode_summary_backfill": request_episode_summary_backfill,
    "invoke_haiku_worker": invoke_haiku_worker,
    "propose_character": propose_character,
    "propose_world_note": propose_world_note,
    "propose_character_update": propose_character_update,
    "propose_plot_revision": propose_plot_revision,
    "propose_episode_draft": propose_episode_draft,
    # Phase 4.5
    "propose_character_delete": propose_character_delete,
    "propose_world_note_update": propose_world_note_update,
    "propose_world_note_delete": propose_world_note_delete,
    "propose_episode_update": propose_episode_update,
    "propose_episode_delete": propose_episode_delete,
    "propose_plot_create": propose_plot_create,
    "propose_plot_tree": propose_plot_tree,
    "propose_plot_delete": propose_plot_delete,
    "propose_review_issue": propose_review_issue,
}

# 도구 카테고리 (BudgetTracker Tier 2 키 분류)
TOOL_CATEGORY: dict[str, str] = {
    "get_plot": "read_summary",
    "list_plots": "read_summary",
    "list_characters": "read_summary",
    "get_character": "read_summary",
    "list_world_notes": "read_summary",
    "get_world_note": "read_summary",
    "list_all_oneline_summaries": "read_summary",
    "list_episode_summaries": "read_summary",
    "get_episode_summary": "read_summary",
    "search_episode_summaries": "read_summary",
    "search_episode_chunks": "read_vector",
    "query_episodes_by_chunks": "sub_agent",      # Haiku 호출 — sub_agent budget
    "find_relevant_episodes": "read_vector",      # DB-only 벡터 SQL, Haiku 0회
    "list_episodes": "read_summary",
    "fetch_episode_plaintext": "read_plaintext",
    "analyze_episode": "sub_agent",      # Haiku 호출 — sub_agent 카테고리로 분류
    "summarize_episode": "sub_agent",    # Haiku 호출 + episode_summary UPSERT
    "request_episode_summary_backfill": "read_summary",   # Celery enqueue 만, 토큰 0
    "track_foreshadow": "analytics",
    "character_arc": "analytics",
    "timeline_scan": "analytics",
    "invoke_haiku_worker": "sub_agent",
    "propose_character": "propose",
    "propose_world_note": "propose",
    "propose_character_update": "propose",
    "propose_plot_revision": "propose",
    "propose_episode_draft": "propose",
    "propose_character_delete": "propose",
    "propose_world_note_update": "propose",
    "propose_world_note_delete": "propose",
    "propose_episode_update": "propose",
    "propose_episode_delete": "propose",
    "propose_plot_create": "propose",
    "propose_plot_tree": "propose",
    "propose_plot_delete": "propose",
    "propose_review_issue": "propose",
}


def filter_tools(allowed_names: set[str] | None = None) -> list[dict[str, Any]]:
    """시나리오별 화이트리스트 필터링 (qa/ideation 은 propose_* 제외 등)."""
    if allowed_names is None:
        return MCP_TOOLS
    return [t for t in MCP_TOOLS if t["name"] in allowed_names]


async def execute_tool(
    name: str,
    inputs: dict[str, Any],
    session: AsyncSession,
    ctx: WriterContext,
) -> Any:
    """tool 실행 격리 — SAVEPOINT 로 감싸 실패 시 부모 트랜잭션 보호.

    어느 한 tool 의 SQL 실패가 InFailedSQLTransactionError 로 cascade 되어
    이후 tool / session 저장이 모두 망가지는 것을 방지.
    """
    handler = _HANDLER_MAP.get(name)
    if handler is None:
        return {"error": f"Unknown tool: {name}"}
    try:
        async with session.begin_nested():       # SAVEPOINT
            return await handler(session, ctx, **inputs)
    except Exception as e:
        # 부모 트랜잭션은 savepoint rollback 으로 살아남음 — LLM 에게 에러만 알린다.
        return {"error": "tool_failed", "tool": name, "message": str(e)[:300]}
