"""POST /v1/drafts - SSE 스트리밍으로 소설 초안 생성."""

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
    user_prompt: str | None = None


SYSTEM_PROMPT = (
    "당신은 웹소설 전문 작가입니다. "
    "아래 작품 컨텍스트를 참고하여 이번 회차의 초안을 작성하세요.\n\n"

    "## 필수 원칙\n"
    "- 직전 화의 마지막 장면에서 자연스럽게 이어지세요. 새 에피소드처럼 시작하지 마세요.\n"
    "- 기존 문체, 톤, 시점을 정확히 유지하세요.\n"
    "- 등장인물의 성격, 말투, 행동 패턴을 일관되게 유지하세요.\n"
    "- 한국어로 작성하세요.\n\n"

    "## 설정 준수\n"
    "- 설정집에 있는 인물, 세계관, 용어만 사용하세요.\n"
    "- 설정집에 없는 새 개념, 새 용어, 새 시스템을 임의로 만들지 마세요.\n"
    "- 새 인물이 필요하면 이름과 간단한 묘사만 넣고, 기존 인물의 가족/과거와 직접 연결하지 마세요.\n"
    "- 시대 배경에 맞지 않는 표현을 쓰지 마세요.\n\n"

    "## 서술 기법\n"
    "- 감정을 설명하지 말고 행동과 사물로 보여주세요.\n"
    "  나쁜 예: '리운은 슬픔이 무엇인지 알 수 없었다.'\n"
    "  좋은 예: '리운은 창틀에 놓인 손을 천천히 쥐었다.'\n"
    "- 대사는 짧고 무겁게 쓰세요. 한 마디로 감정을 압축하세요.\n"
    "- 시선, 동작, 사물 디테일로 감정을 전달하세요.\n"
    "- '모르겠다', '알 수 없었다', '무엇인지 정확히 몰랐다' 같은 내면 독백을 반복하지 마세요.\n\n"

    "## 금지 사항\n"
    "- 'N화의 ~처럼', 'N화에서 ~했던 것처럼' 같은 회차 번호 참조를 절대 쓰지 마세요. "
    "독자에게 특정 화를 기억하라고 요구하는 메타 표현입니다.\n"
    "- 주인공의 핵심 과거(가족 사고 등)와 직접 연결되는 반전을 만들지 마세요. "
    "의뢰인/사건의 사연은 독립적으로 완결시키세요.\n"
    "- 40년 전 인물을 외모만으로 알아보는 등 작위적 장치를 쓰지 마세요.\n"
    "- 무거운 장면 직후 가벼운 일상 장면으로 바로 전환하지 마세요. "
    "최소 한 문단의 호흡을 두세요.\n"
    "- 핵심 사건 후 내면 독백을 길게 늘어놓지 마세요. "
    "짧은 행동 묘사로 전환하세요.\n\n"

    "## 인물 관계\n"
    "- 인물 관계를 극적으로 발전시키지 말고, 조용히 보여주세요.\n"
    "- 과장 없는 일상적 장면으로 관계 변화를 암시하세요.\n"

    "## 분량\n"
    "- 이번 화는 6,000자 이내로 작성하세요.\n"
    "- 반드시 장면을 완결짓고 끝내세요. 문장이 중간에 잘리면 안 됩니다.\n"
    "- 마지막 200자부터는 마무리에 들어가세요.\n"
)


async def _generate_sse(req: DraftRequest):
    context = await assemble_context(
        work_id=req.work_id,
        writer_id=req.writer_id,
        storyline=req.storyline,
        current_episode_num=req.current_episode_num,
    )

    extra_instructions = ""
    if req.user_prompt:
        extra_instructions = (
            "\n\n## 작가의 추가 지시사항\n"
            f"{req.user_prompt}"
        )

    user_prompt = (
        f"{context}\n\n---\n이번 회차 방향: {req.storyline}"
        f"{extra_instructions}\n\n"
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
        {
            "type": "done",
            "episode_id": req.episode_id,
            "total_length": len("".join(full_text)),
            "usage": llm.last_usage,
        },
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
