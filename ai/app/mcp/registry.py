"""MCP 도구 레지스트리.

Anthropic messages.create(tools=[...])에 넘길 JSONSchema 목록과
도구 이름 → 핸들러 매핑.
"""

from __future__ import annotations

from typing import Any, Callable, Coroutine

from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.condense import haiku_condense_tool_result
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
from app.mcp.tools.episode_spellcheck import check_spelling
from app.mcp.tools.episode_summary import (
    ensure_recent_summaries,
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
    propose_spelling_fix,
    propose_spelling_fix_batch,
    propose_world_note,
    propose_world_note_delete,
    propose_world_note_update,
)
from app.mcp.tools.sub_agent import invoke_haiku_worker
from app.mcp.tools.summary_backfill import request_episode_summary_backfill
from app.mcp.tools.world_note import get_world_note, list_world_notes

# (구) get_plan 도구는 ERD 정리 2단계로 plan 테이블이 폐기되어 함께 제거됨.
# 장르·분위기는 work 메타에서, 자유 기획 문서는 별도 plan_note 도구(향후 추가)에서 조회.

# ============================================================
# Haiku 압축 대상 도구 (의도 기반 미들웨어)
# ============================================================
# 아래 set 에 속한 도구는 execute_tool 이 raw 결과를 Haiku 로 한 번 더 압축한 후
# 오케스트레이터에 전달한다. 오케스트레이터는 input 에 'purpose' 인자를 명시해
# Haiku 에게 "이 호출로 어떤 정보를 얻으려는지" 알려야 한다.
#
# ★ 압축 대상 선정 원칙 (학습 결과) ★
# - 단일 객체를 풍부한 텍스트(notes/custom_fields/full body)로 반환하는 drill 도구만 대상.
# - list/peek/cross-episode 도구는 압축 X — Haiku 가 purpose 좁게 해석하면 essential
#   episode_id 들을 누락해 오케스트레이터의 직전화·관련 회차 추적이 망가짐 (실측 사례:
#   list_episodes(purpose="16화 id 확인") → 다른 모든 회차 id 누락 → 15화 못 찾음).
#
# 제외 기준:
#  - fetch_episode_plaintext : 검수 시 line 번호 정확성 필수, raw 유지 (사용자 명시)
#  - summarize_episode, analyze_episode, query_episodes_by_chunks, check_spelling,
#    invoke_haiku_worker : 이미 Haiku 출력 — 이중 압축 X
#  - propose_*             : 작은 suggestion_id 반환, 압축 의미 X
#  - request_episode_summary_backfill : Celery enqueue 상태만, 작음
#  - list_*, search_*, find_relevant_episodes : peek 결과 — 모든 ID 목록이 후속 drill 의
#    재료라 narrow 압축 시 정보 손실 치명적. raw 그대로 노출.
#  - track_foreshadow, character_arc, timeline_scan : 회차별 행 시계열 — 각 행의
#    episode_id 가 모순 후보 추적의 핵심 좌표. narrow 압축 시 누락 위험.
CONDENSE_TOOLS: set[str] = {
    "get_plot",
    "get_character",
    "get_world_note",
    "get_episode_summary",
    "search_episode_chunks",  # raw chunk text → 의미 요약 (chunk 자체는 검수에 직접 쓰임 X)
}


_PURPOSE_DESCRIPTION = (
    "★ 필수 — 이 도구를 호출해 어떤 정보를 얻으려는지 1~2문장으로 명시. "
    "Haiku 미들웨어가 이 목적을 기반으로 raw 도구 결과에서 부합하는 핵심만 추려 "
    "요약 보고서로 전달한다. 목적이 좁으면 결과도 좁게 압축됨. "
    "예: '194년 시점 등장 인물 나이 일관성 검토용', '미회수 복선 목록 확인용', "
    "'9화 사건과 의미상 가까운 회차 후보 식별용'."
)


_BASE_MCP_TOOLS: list[dict[str, Any]] = [
    {
        "name": "list_plots",
        "description": (
            "peek — 플롯 제목 배열 + 매핑. 반환: "
            "{titles, id_map, status_map, parent_map}. 본문은 get_plot."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_plot",
        "description": "drill — 단건 플롯 본문. title 또는 plot_id 중 하나.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "plot_id": {"type": "string"},
            },
            "required": [],
        },
    },
    {
        "name": "list_characters",
        "description": (
            "peek — 인물 이름 배열 + drill 용 id_map. 반환: {names, id_map}. "
            "성별·나이·외형·성격 등 상세는 get_character drill."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_character",
        "description": "drill — 단건 인물 풀 프로필 (외모·성격·MBTI·custom_fields).",
        "input_schema": {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        },
    },
    {
        "name": "list_world_notes",
        "description": (
            "peek — 세계관 노트 이름 배열 + 매핑. 반환: {names, id_map, parent_map}. "
            "parent_map None = root. 본문은 get_world_note."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_world_note",
        "description": "drill — 단건 세계관 노트 본문.",
        "input_schema": {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        },
    },
    {
        "name": "query_episodes_by_chunks",
        "description": (
            "벡터 검색 top-k chunks → Haiku 합성. ★고정 ~10크레딧, 회차 수 무관★.\n"
            "★ query 와 task 는 분리된 역할 — 둘 다 작성:\n"
            "  - **query**: 임베딩 모델용. 본문 어휘 (인물·사건·묘사) 로 작성. sim 좌우.\n"
            "    좋음: '가후 어머니 표정 가르치다 어린 시절 웃음'\n"
            "    나쁨: '가후 감정 부재 일관성' (메타 추상 → sim 0.3 미만 약한 매칭)\n"
            "  - **task**: Haiku 분석 지시. 추상 단어 OK. chunks 받은 후 무엇을 할지.\n"
            "    예: '가후의 감정 부재 설정이 회차별 일관되게 유지되는지 평가, 모순 정황 인용'\n"
            "    예: '복선 X가 회수된 회차 추적, 본문 인용으로 근거 제시'\n"
            "  task 생략 시 query 가 합성 지시로 대체됨 (backward compat, 권장 X).\n"
            "★ full_episode_count=1~2 — chunk 잘림 보완. top sim 회차 풀 본문 포함."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "벡터 임베딩용 — 본문 어휘 기반 검색어",
                },
                "task": {
                    "type": "string",
                    "description": (
                        "Haiku 합성 지시 — chunks 에서 무엇을 추출/평가/판단할지. "
                        "추상 분석 단어 OK. 생략 시 query 로 fallback."
                    ),
                },
                "k": {"type": "integer", "description": "chunk 수 (기본 10, 상한 30)", "default": 10},
                "full_episode_count": {
                    "type": "integer",
                    "description": "top sim 회차 풀 본문 포함 (기본 0, 상한 3)",
                    "default": 0,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_episode_chunks",
        "description": (
            "(저수준) 벡터 top-k chunks raw — 보통은 query_episodes_by_chunks 우선."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "k": {"type": "integer", "description": "기본 5", "default": 5},
            },
            "required": ["query"],
        },
    },
    {
        "name": "list_all_oneline_summaries",
        "description": (
            "작품 전체 한 줄 요약 시간 순 + 커버리지 메타. 반환: "
            "{episodes:[...시간순], summarized_count, total_episode_count, "
            "missing_summary_episode_ids:[...], coverage_complete, note}. "
            "missing 이 있으면 그 회차들은 episodes 에 안 보임 — summarize_episode 백필 고려."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "list_episode_summaries",
        "description": (
            "회차 요약 페이지네이션 + 커버리지 메타. 반환 dict 구조는 list_all_oneline_summaries 와 동일."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "기본 20, 상한 100", "default": 20},
                "offset": {"type": "integer", "default": 0},
            },
            "required": [],
        },
    },
    {
        "name": "get_episode_summary",
        "description": "캐시 hit — 단건 12필드 요약 (없으면 null → summarize_episode).",
        "input_schema": {
            "type": "object",
            "properties": {"episode_id": {"type": "string"}},
            "required": ["episode_id"],
        },
    },
    {
        "name": "search_episode_summaries",
        "description": (
            "회차 요약 키워드 검색 (substring). 의미 유사는 query_episodes_by_chunks."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "keyword": {"type": "string"},
                "scope": {
                    "type": "string",
                    "description": "'all' / 'character:이름' / 'location:장소' / 'tone:톤'",
                    "default": "all",
                },
                "limit": {"type": "integer", "description": "기본 10, 상한 50", "default": 10},
            },
            "required": ["keyword"],
        },
    },
    {
        "name": "track_foreshadow",
        "description": (
            "복선 planted↔paid_off 짝. 반환: {foreshadows:[...]}. "
            "★ episode_summary 기반 — 미요약 회차의 복선은 검출 X. coverage 메타는 "
            "list_all_oneline_summaries 결과로 확인 (중복 제거)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"name": {"type": "string", "description": "(옵션) 특정 복선만"}},
            "required": [],
        },
    },
    {
        "name": "character_arc",
        "description": (
            "인물 회차별 시계열. 반환: {character_name, episodes:[{episode_id, title, tone, "
            "is_pov, key_events, cliffhanger}, ...]}. oneline_summary 는 중복 제거 — "
            "list_all_oneline_summaries 에서 episode_id 로 cross-ref. "
            "★ episode_summary 기반 — 미요약 회차 인물 등장은 검출 X. 사각지대 확인은 "
            "list_all_oneline_summaries.missing_summary_episode_ids 참조."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        },
    },
    {
        "name": "timeline_scan",
        "description": (
            "회차별 time_progression·cliffhanger 시간 순. 반환: {episodes:[{episode_id, title, "
            "time_progression, cliffhanger}, ...]}. oneline_summary 중복 제거 — "
            "list_all_oneline_summaries 로 cross-ref. 사각지대 확인은 list_all_oneline_summaries 참조."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "list_episodes",
        "description": (
            "peek — 회차 존재·has_summary 확인. 배열은 시간 순. "
            "has_summary=True→get_episode_summary, False→summarize_episode."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    # ───────── Phase 4.6: 회차-기준 관련성 탐색 ─────────
    {
        "name": "find_relevant_episodes",
        "description": (
            "기준 회차와 의미상 가까운 회차 top-k (벡터, DB-only ~1크레딧). "
            "본문 없으면 suggested_reference_episode_id 반환 — 그걸로 재호출."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "reference_episode_id": {"type": "string", "description": "기준 회차 UUID"},
                "k": {"type": "integer", "description": "기본 5, 상한 20", "default": 5},
                "exclude_self": {"type": "boolean", "default": True},
            },
            "required": ["reference_episode_id"],
        },
    },
    {
        "name": "summarize_episode",
        "description": (
            "drill — 12필드 양식 요약 (oneline/summary/POV/인물/장소/사건/tone/복선/키워드). "
            "episode_summary UPSERT (캐시). 양식 외 분석은 analyze_episode."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "episode_id": {"type": "string"},
                "force_regenerate": {"type": "boolean", "default": False},
            },
            "required": ["episode_id"],
        },
    },
    {
        "name": "analyze_episode",
        "description": (
            "drill (자유 task) — 본문에서 task 별 추출 (Haiku 1회성, 캐시 X). "
            "표준 12필드는 summarize_episode."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "episode_id": {"type": "string"},
                "task": {"type": "string", "description": "한국어 추출 지시"},
            },
            "required": ["episode_id", "task"],
        },
    },
    {
        "name": "fetch_episode_plaintext",
        "description": (
            "drill (raw) — 회차 평문. 재작성·인용·문장 분석용. "
            "정보 추출은 summarize_episode 가 저렴. 검수 시 with_line_numbers=true 필수."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "episode_id": {"type": "string"},
                "with_line_numbers": {
                    "type": "boolean",
                    "description": "true → '[1]...\\n[2]...' (propose_review_issue.lines 매칭)",
                    "default": False,
                },
            },
            "required": ["episode_id"],
        },
    },
    {
        "name": "request_episode_summary_backfill",
        "description": (
            "사용자 명시 요청 + 확답 후만 호출. 미요약/stale 회차 요약 task 를 Celery 적재 "
            "(회차당 Haiku 청구)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "기본 50, 상한 200", "default": 50},
            },
            "required": [],
        },
    },
    {
        "name": "ensure_recent_summaries",
        "description": (
            "대상 회차 직전 N화 요약을 inline 백필 (sync, 즉시 사용 가능). 검수·작성 [1.Plan]\n"
            "직후 호출 권장 — 직전 컨텍스트 미요약 시 character_arc/timeline_scan/track_foreshadow\n"
            "사각지대 발생. 이미 요약된 회차는 캐시 hit (Haiku 0회). 누락 회차만 Haiku 1회씩.\n"
            "max_count 기본 3, 상한 3 (비용 폭주 방지). 작가 비용 발생."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "target_episode_id": {"type": "string", "description": "검수/작성 대상 회차 UUID"},
                "max_count": {
                    "type": "integer",
                    "description": "직전 몇 화까지 백필 (기본 3, 상한 3)",
                    "default": 3,
                },
            },
            "required": ["target_episode_id"],
        },
    },
    {
        "name": "invoke_haiku_worker",
        "description": "Haiku 에 분류·요약·재작성 sub-task 위임. Sonnet 토큰 절감용.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task": {"type": "string"},
                "context": {"type": "object"},
                "max_tokens": {"type": "integer", "default": 1500},
            },
            "required": ["task"],
        },
    },
    # ───────── Phase 4: 작가 승인 큐 (extraction_suggestion 에 pending) ─────────
    {
        "name": "propose_character",
        "description": (
            "신규 인물 등록. 외형·성격·메모는 모두 intro 한 본문에 Markdown 합쳐 작성 (별도 노트 분리 X)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "role": {"type": "string"},
                "gender": {"type": "string", "enum": ["남", "여", "기타", "미설정"]},
                "age": {"type": "string"},
                "intro": {
                    "type": "string",
                    "description": "Markdown — '## 외형 / ## 성격 / ## 메모' 구조 권장",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "propose_world_note",
        "description": "신규 세계관 노트. content 는 Markdown (TipTap 자동 변환).",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "content": {"type": "string", "description": "Markdown"},
                "category": {"type": "string"},
            },
            "required": ["name", "content"],
        },
    },
    {
        "name": "propose_character_update",
        "description": (
            "인물 프로필 수정. field=name/gender/age 는 character 직속, "
            "appearance/personality/mbti 등은 character_note 신규 행 (작가 명시 요청 시만)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
                "field": {"type": "string"},
                "new_value": {
                    "type": "string",
                    "description": "gender 면 '남'/'여'/'기타'/'미설정' 한 글자만",
                },
                "reason": {"type": "string"},
            },
            "required": ["character_id", "field", "new_value", "reason"],
        },
    },
    {
        "name": "propose_plot_revision",
        "description": "플롯 줄거리 재작성. new_outline 은 Markdown.",
        "input_schema": {
            "type": "object",
            "properties": {
                "plot_id": {"type": "string"},
                "new_outline": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["plot_id", "new_outline", "reason"],
        },
    },
    {
        "name": "propose_episode_draft",
        "description": (
            "신규 회차 INSERT 제안. 본문은 채팅 텍스트로 직접 출력 후 content 인자는 비우고 호출 "
            "(streaming 표시용, 백엔드가 자동 합성). 기존 회차 수정은 propose_episode_update."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "content": {"type": "string", "description": "비워둘 것 (백엔드 자동 합성)"},
                "parent_id": {"type": "string", "description": "분기/외전 부모 episode id"},
                "reference_episodes": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "참조 episode_id 들",
                },
            },
            "required": ["title"],
        },
    },
    {
        "name": "propose_character_delete",
        "description": "인물 삭제 (character_note CASCADE). 되돌릴 수 없음.",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["character_id", "reason"],
        },
    },
    {
        "name": "propose_world_note_update",
        "description": "세계관 노트 이름/내용 수정. name/content 중 하나 이상.",
        "input_schema": {
            "type": "object",
            "properties": {
                "world_note_id": {"type": "string"},
                "name": {"type": "string"},
                "content": {"type": "string", "description": "Markdown"},
                "reason": {"type": "string"},
            },
            "required": ["world_note_id", "reason"],
        },
    },
    {
        "name": "propose_world_note_delete",
        "description": "세계관 노트 삭제 (자식 CASCADE).",
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
        "description": "기존 회차 제목/본문/status 수정. 신규는 propose_episode_draft.",
        "input_schema": {
            "type": "object",
            "properties": {
                "episode_id": {"type": "string"},
                "title": {"type": "string"},
                "content": {"type": "string", "description": "Markdown"},
                "status": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["episode_id", "reason"],
        },
    },
    {
        "name": "propose_plot_create",
        "description": "신규 플롯(막/챕터). 기존 수정은 propose_plot_revision.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "content": {"type": "string", "description": "Markdown"},
                "status": {"type": "string"},
                "parent_id": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["title", "content", "reason"],
        },
    },
    {
        "name": "propose_plot_tree",
        "description": (
            "부모 챕터 + 자식 N개 일괄 등록 (트랜잭션). '한꺼번에/묶어서/트리로' 류 요청 시 사용."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "root_title": {"type": "string"},
                "root_content": {"type": "string", "description": "Markdown"},
                "root_status": {"type": "string"},
                "parent_id": {"type": "string", "description": "상위 막 id (옵션)"},
                "children": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "content": {"type": "string"},
                            "status": {"type": "string"},
                        },
                        "required": ["title", "content"],
                    },
                },
                "reason": {"type": "string"},
            },
            "required": ["root_title", "root_content", "children", "reason"],
        },
    },
    {
        "name": "propose_plot_delete",
        "description": "플롯 삭제 (자식 CASCADE).",
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
        "description": "회차 삭제 (자식 회차 CASCADE).",
        "input_schema": {
            "type": "object",
            "properties": {
                "episode_id": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["episode_id", "reason"],
        },
    },
    # ───────── Phase 5: 한국어 맞춤법 검사 ─────────
    {
        "name": "check_spelling",
        "description": (
            "회차 본문 한국어 맞춤법·띄어쓰기·문장부호·오탈자 점검 (Haiku, 인물/세계관명 화이트리스트). "
            "표기만 평가 — 설정/문체 X. 결과 issues 는 propose_spelling_fix_batch 로 일괄 등록."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"episode_id": {"type": "string", "description": "회차 UUID"}},
            "required": ["episode_id"],
        },
    },
    {
        "name": "propose_spelling_fix",
        "description": (
            "표기 오류 1건 치환 제안 (승인 시 자동 적용). 같은 line 다건이면 각각 호출. "
            "다건은 propose_spelling_fix_batch 우선 사용."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "episode_id": {"type": "string", "description": "회차 UUID (36자)"},
                "line": {"type": "integer", "minimum": 1, "description": "1-based line"},
                "original": {"type": "string", "description": "본문 원문 그대로", "minLength": 1},
                "suggestion": {"type": "string", "description": "교정 문자열 (original과 달라야 함)", "minLength": 1},
                "fix_type": {"type": "string", "enum": ["typo", "spacing", "punctuation"]},
                "reason": {"type": "string", "description": "(옵션) 수정 사유"},
            },
            "required": ["episode_id", "line", "original", "suggestion", "fix_type"],
        },
    },
    {
        "name": "propose_spelling_fix_batch",
        "description": (
            "표기 오류 N건 묶음 제안 (체크리스트, 1회 적용). check_spelling.issues 그대로 매핑 가능. "
            "★ 다건일 때 항상 이 도구 사용 (개별 propose_spelling_fix 반복 X)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "episode_id": {"type": "string", "description": "회차 UUID (36자)"},
                "fixes": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "properties": {
                            "line": {"type": "integer", "minimum": 1},
                            "original": {"type": "string", "minLength": 1},
                            "suggestion": {"type": "string", "minLength": 1},
                            "fix_type": {"type": "string", "enum": ["typo", "spacing", "punctuation"]},
                            "reason": {"type": "string"},
                        },
                        "required": ["line", "original", "suggestion", "fix_type"],
                    },
                },
            },
            "required": ["episode_id", "fixes"],
        },
    },
    # ───────── Phase 5: 검수 발견 사항 (위치 매핑) ─────────
    {
        "name": "propose_review_issue",
        "description": (
            "검수 발견 이슈 1건을 작가 승인 큐에 적재. 호출 전 "
            "fetch_episode_plaintext(with_line_numbers=true) 로 라인 정확히 확인. 추측 금지."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "episode_id": {"type": "string", "description": "회차 UUID (36자, '9화' 등 title 금지)"},
                "lines": {
                    "type": "array",
                    "items": {"type": "integer", "minimum": 1},
                    "description": "본문 line 번호 (1-based). 1~3개 권장.",
                    "minItems": 1,
                },
                "severity": {
                    "type": "string",
                    "enum": ["critical", "warning", "info"],
                    "description": "critical: 모순/오류 / warning: 일관성 우려 / info: 제안",
                },
                "issue_type": {
                    "type": "string",
                    "enum": ["setting_conflict", "tone_conflict", "foreshadow_unresolved",
                             "character_arc", "timeline", "other"],
                },
                "description": {"type": "string", "description": "1~3문장. 본문 근거 인용 권장."},
                "suggestion": {"type": "string", "description": "(옵션) 권고 수정 방향"},
            },
            "required": ["episode_id", "lines", "severity", "issue_type", "description"],
        },
    },
]


def _inject_purpose_schema(
    tools: list[dict[str, Any]],
    condense_tools: set[str],
) -> list[dict[str, Any]]:
    """압축 대상 도구의 input_schema 에 'purpose' 필수 필드를 자동 주입.

    각 도구 정의를 직접 편집하지 않고 후처리 — 새 도구 추가 시에도 CONDENSE_TOOLS
    set 에만 등록하면 자동으로 schema 가 일관된다.
    """
    out: list[dict[str, Any]] = []
    for t in tools:
        if t.get("name") not in condense_tools:
            out.append(t)
            continue
        # 얕은 복사 — 원본 사전 mutate 방지
        new_t = dict(t)
        new_schema = dict(new_t.get("input_schema") or {})
        props = dict(new_schema.get("properties") or {})
        props["purpose"] = {"type": "string", "description": _PURPOSE_DESCRIPTION}
        new_schema["properties"] = props
        required = list(new_schema.get("required") or [])
        if "purpose" not in required:
            required.append("purpose")
        new_schema["required"] = required
        new_t["input_schema"] = new_schema
        out.append(new_t)
    return out


# Anthropic messages.create(tools=[...]) 에 그대로 넘기는 최종 도구 목록.
# _BASE_MCP_TOOLS 정의 후 CONDENSE_TOOLS 에 따라 purpose 필드를 자동 주입한다.
MCP_TOOLS: list[dict[str, Any]] = _inject_purpose_schema(_BASE_MCP_TOOLS, CONDENSE_TOOLS)

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
    "ensure_recent_summaries": ensure_recent_summaries,
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
    "propose_spelling_fix": propose_spelling_fix,
    "propose_spelling_fix_batch": propose_spelling_fix_batch,
    "check_spelling": check_spelling,
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
    "ensure_recent_summaries": "sub_agent",   # inline summarize_episode N회 — Haiku 비용 발생
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
    "propose_spelling_fix": "propose",
    "propose_spelling_fix_batch": "propose",
    "check_spelling": "sub_agent",       # Haiku 호출 — sub_agent 카테고리 (analyze_episode 와 동급)
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

    CONDENSE_TOOLS 에 속한 도구는 raw 결과를 Haiku 미들웨어로 한 번 더 압축한 후
    오케스트레이터에 전달한다. input 의 'purpose' 인자는 핸들러에 넘기지 않고
    Haiku 압축 시 의도 컨텍스트로만 사용 (핸들러 시그니처에 불필요한 인자 차단).
    """
    handler = _HANDLER_MAP.get(name)
    if handler is None:
        return {"error": f"Unknown tool: {name}"}

    # purpose 는 압축 전용 메타 — 실 핸들러 인자가 아니므로 분리.
    purpose: str | None = None
    handler_inputs: dict[str, Any] = inputs if isinstance(inputs, dict) else {}
    if "purpose" in handler_inputs:
        handler_inputs = dict(handler_inputs)
        raw_purpose = handler_inputs.pop("purpose", None)
        if isinstance(raw_purpose, str):
            purpose = raw_purpose

    try:
        async with session.begin_nested():       # SAVEPOINT
            raw_result = await handler(session, ctx, **handler_inputs)
    except Exception as e:
        # 부모 트랜잭션은 savepoint rollback 으로 살아남음 — LLM 에게 에러만 알린다.
        return {"error": "tool_failed", "tool": name, "message": str(e)[:300]}

    if name in CONDENSE_TOOLS:
        return await haiku_condense_tool_result(name, raw_result, purpose, ctx)
    return raw_result
