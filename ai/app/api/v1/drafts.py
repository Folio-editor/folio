"""POST /v1/drafts — SSE 스트리밍으로 소설 초안 생성.

흐름: RAG 컨텍스트 조립 -> LLM 스트리밍 -> SSE 응답
"""

import asyncio
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import settings
from app.middleware.auth import require_internal_api_key
from app.services.providers import get_llm
from app.services.rag import assemble_context

router = APIRouter(
    prefix="/drafts",
    tags=["drafts"],
    dependencies=[Depends(require_internal_api_key)],
)


class DraftRequest(BaseModel):
    work_id: str
    writer_id: str
    episode_id: str
    storyline: str
    current_episode_num: int
    model: str = "sonnet"


SYSTEM_PROMPT = (
    "당신은 웹소설 작가의 AI 집필 보조입니다. "
    "아래 작품 컨텍스트를 참고하여 이번 회차의 초안을 작성하세요.\n"
    "- 기존 문체와 톤을 유지하세요.\n"
    "- 등장인물의 성격과 말투를 일관되게 유지하세요.\n"
    "- 복선과 스토리라인을 자연스럽게 반영하세요.\n"
    "- 한국어로 작성하세요."
)


async def _generate_sse(req: DraftRequest):
    context = await assemble_context(
        work_id=req.work_id,
        writer_id=req.writer_id,
        storyline=req.storyline,
        current_episode_num=req.current_episode_num,
    )

    user_prompt = (
        f"{context}\n\n---\n이번 회차 방향: {req.storyline}\n\n"
        "위 컨텍스트를 바탕으로 이번 회차 초안을 작성해주세요."
    )

    llm = get_llm()
    full_text = []
    requested_model = req.model.strip().lower()
    model_override = settings.claude_opus_model if requested_model == "opus" else None

    async for chunk in llm.generate_stream(
        SYSTEM_PROMPT,
        user_prompt,
        model_override=model_override,
    ):
        full_text.append(chunk)
        event = json.dumps({"type": "chunk", "content": chunk}, ensure_ascii=False)
        yield f"data: {event}\n\n"
        await asyncio.sleep(0.05)

    done_event = json.dumps(
        {"type": "done", "episode_id": req.episode_id, "total_length": len("".join(full_text))},
        ensure_ascii=False,
    )
    yield f"data: {done_event}\n\n"


@router.post("")
async def generate_draft(req: DraftRequest):
    return StreamingResponse(
        _generate_sse(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
