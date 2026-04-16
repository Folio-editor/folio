"""Phase 5 (Day 6) 예정.

POST /v1/drafts — SSE 스트리밍
- RAG 사전 조립 (episode_chunk / episode_summary)
- Anthropic tool_use 루프 (MCP 툴: plan/plot/character/world_note)
- StreamingResponse(media_type="text/event-stream")
"""

from fastapi import APIRouter, Depends

from app.middleware.auth import require_internal_api_key

router = APIRouter(
    prefix="/drafts",
    tags=["drafts"],
    dependencies=[Depends(require_internal_api_key)],
)


# TODO(Phase 5): POST /v1/drafts 구현 (SSE)
