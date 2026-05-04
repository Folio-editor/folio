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
]

ToolHandler = Callable[..., Coroutine[Any, Any, Any]]

_HANDLER_MAP: dict[str, ToolHandler] = {
    "get_character": get_character,
    "get_plot": get_plot,
    "list_characters": list_characters,
    "list_world_notes": list_world_notes,
    "get_world_note": get_world_note,
    "search_episode_chunks": search_episode_chunks,
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
