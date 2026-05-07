"""MCP 도구 레지스트리.

Anthropic messages.create(tools=[...])에 넘길 JSONSchema 목록과
도구 이름 → 핸들러 매핑.
"""

from __future__ import annotations

from typing import Any, Callable, Coroutine

from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.mcp.tools.character import get_character, list_characters
from app.mcp.tools.episode_search import search_episode_chunks
from app.mcp.tools.episode_summary import (
    get_episode_summary,
    list_episode_summaries,
    search_episode_summaries,
)
from app.mcp.tools.plot import get_plot
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
        "name": "search_episode_chunks",
        "description": "과거 에피소드에서 의미적으로 유사한 장면을 벡터 검색합니다.",
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
]

ToolHandler = Callable[..., Coroutine[Any, Any, Any]]

_HANDLER_MAP: dict[str, ToolHandler] = {
    "get_character": get_character,
    "get_plot": get_plot,
    "list_characters": list_characters,
    "list_world_notes": list_world_notes,
    "get_world_note": get_world_note,
    "search_episode_chunks": search_episode_chunks,
    "list_episode_summaries": list_episode_summaries,
    "get_episode_summary": get_episode_summary,
    "search_episode_summaries": search_episode_summaries,
}


async def execute_tool(
    name: str,
    inputs: dict[str, Any],
    session: AsyncSession,
    ctx: WriterContext,
) -> Any:
    handler = _HANDLER_MAP.get(name)
    if handler is None:
        return {"error": f"Unknown tool: {name}"}
    return await handler(session, ctx, **inputs)
