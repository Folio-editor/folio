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
)
from app.mcp.tools.episode_search import query_episodes_by_chunks, search_episode_chunks
from app.mcp.tools.episode_summary import (
    get_episode_summary,
    list_all_oneline_summaries,
    list_episode_summaries,
    search_episode_summaries,
)
from app.mcp.tools.plot import get_plot
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
        "name": "get_plot",
        "description": "작품의 전체 플롯(줄거리) 목록을 조회합니다.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "list_characters",
        "description": "등장인물 목록을 조회합니다. 이름, 성별, 나이, 성격만 포함된 간략 목록입니다.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_character",
        "description": "특정 등장인물의 상세 프로필을 조회합니다. 외모, MBTI, 커스텀 필드 등 전체 정보를 포함합니다.",
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
        "description": "세계관 설정 노트 목록을 조회합니다.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_world_note",
        "description": "특정 세계관 노트의 전체 내용을 조회합니다.",
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
            "벡터 검색 + Haiku 합성으로 회차별 fetch 없이 query 답변. "
            "300화 같은 대량 작품에서 회차마다 fetch_episode_plaintext / analyze_episode 반복 대신 사용. "
            "chunk_and_embed_task 가 자동 임베딩한 청크에서 query 와 유사한 top-k 추출 → Haiku 합성. "
            "비용 ~10 크레딧/호출 (회차 수와 무관). "
            "예시 query: '서진우의 가족 관계 묘사', '한중 이주 결정 장면', '복선 — 편지의 비밀'."
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
            "특정 회차(sort_order) 의 상세 요약을 조회합니다. "
            "줄거리·시점·등장 인물/장소·핵심 사건·톤·복선·키워드 등 모든 메타 필드를 반환."
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
            "회차 요약 텍스트를 키워드로 검색합니다. "
            "scope 로 인물/장소/톤 차원 필터링 가능: "
            "'all' (기본), 'character:<이름>', 'location:<장소>', 'tone:<톤>'."
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
            "작품의 모든 회차 메타 목록을 episode 테이블에서 직접 조회 (요약 유무 무관). "
            "각 행: {sort_order, title, status, word_count, has_summary}. "
            "회차 존재 여부 확인 / status='완성' 필터링 / 요약 미생성 회차 식별에 사용."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    # ───────── Phase 4: 평문 fetch ─────────
    {
        "name": "analyze_episode",
        "description": (
            "회차 본문 fetch + Haiku 가 task 별 핵심 추출. Sonnet 비용 ~70% 절감 "
            "(Sonnet 은 raw 본문 대신 Haiku 압축본만 받음). "
            "task 예시: '등장 인물별 페르소나 추출' / '핵심 사건 시간순' / '복선 추출'. "
            "재작성·인용처럼 본문 그대로 필요한 경우는 fetch_episode_plaintext 사용."
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
            "특정 회차(sort_order) 의 평문 본문을 Vault Transit 경유로 fetch. "
            "본문 그대로 필요한 경우 (재작성·인용·정확한 문장 분석) 만 사용. "
            "정보 추출 / 분석이 목적이면 analyze_episode 가 ~70% 저렴. "
            "토큰 비용 큼 — 호출 횟수 제한적."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sort_order": {"type": "integer", "description": "조회할 회차 sort_order"},
            },
            "required": ["sort_order"],
        },
    },
    # ───────── Phase 4.5: 요약 일괄 백필 ─────────
    {
        "name": "request_episode_summary_backfill",
        "description": (
            "미요약 회차들의 요약 task 를 background Celery 큐에 적재. "
            "agent 자신의 토큰 안 씀 — backend worker 가 회차당 Haiku 1회씩 비동기 처리. "
            "300화 같은 대량 미요약 작품의 입구 비용 0. "
            "완료 후 list_all_oneline_summaries 로 결과 확인 (회차당 30~60초). "
            "기존 요약 행은 건너뜀 (idempotent)."
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
        "description": "신규 등장 인물 등록 제안 (작가 승인 후 character 테이블 INSERT).",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "role": {"type": "string"},
                "gender": {"type": "string"},
                "age": {"type": "string"},
                "appearance": {"type": "string"},
                "personality": {"type": "string"},
                "notes": {"type": "string"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "propose_world_note",
        "description": "신규 세계관 노트 등록 제안 (작가 승인 후 world_note 테이블 INSERT).",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "content": {"type": "string"},
                "category": {"type": "string"},
            },
            "required": ["name", "content"],
        },
    },
    {
        "name": "propose_character_update",
        "description": "기존 인물 프로필 수정 제안 (작가 승인 후 character 테이블 UPDATE).",
        "input_schema": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string"},
                "field": {"type": "string", "description": "수정할 컬럼 (예: appearance, personality)"},
                "new_value": {"type": "string"},
                "reason": {"type": "string", "description": "수정 사유 (작가가 검토할 때 참고)"},
            },
            "required": ["character_id", "field", "new_value", "reason"],
        },
    },
    {
        "name": "propose_plot_revision",
        "description": "플롯 줄거리 재작성 제안 (작가 승인 후 plot 테이블 UPDATE).",
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
            "신규 회차 (다음 화 또는 외전) 초안 INSERT 제안. "
            "기존 회차 본문/제목 수정은 propose_episode_update 사용. "
            "작가 승인 시 episode 로 INSERT (status='작성중')."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "content": {"type": "string"},
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
                "content": {"type": "string", "description": "(옵션) 새 내용 (평문, 자동 tiptap 래핑)"},
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
                "content": {"type": "string", "description": "(옵션) 새 본문 (평문, 자동 tiptap 래핑)"},
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
                "content": {"type": "string", "description": "플롯 줄거리·계획 (평문, tiptap 자동 래핑)"},
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
                "root_content": {"type": "string", "description": "부모 챕터 줄거리·요약"},
                "root_status": {"type": "string", "description": "(옵션) 부모 status"},
                "parent_id": {"type": "string", "description": "(옵션) 더 상위 막의 id"},
                "children": {
                    "type": "array",
                    "description": "자식 플롯 배열 (각 자식 = 1화 분량 또는 sub-chapter)",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "content": {"type": "string"},
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
]

ToolHandler = Callable[..., Coroutine[Any, Any, Any]]

_HANDLER_MAP: dict[str, ToolHandler] = {
    "get_character": get_character,
    "get_plot": get_plot,
    "list_characters": list_characters,
    "list_world_notes": list_world_notes,
    "get_world_note": get_world_note,
    "search_episode_chunks": search_episode_chunks,
    "query_episodes_by_chunks": query_episodes_by_chunks,
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
}

# 도구 카테고리 (BudgetTracker Tier 2 키 분류)
TOOL_CATEGORY: dict[str, str] = {
    "get_plot": "read_summary",
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
    "list_episodes": "read_summary",
    "fetch_episode_plaintext": "read_plaintext",
    "analyze_episode": "sub_agent",      # Haiku 호출 — sub_agent 카테고리로 분류
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
