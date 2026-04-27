"""POST /v1/drafts - SSE 스트리밍으로 소설 초안 생성."""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import settings
from app.middleware.auth import require_internal_api_key
from app.services.providers import get_llm
from app.services.rag import assemble_context

logger = logging.getLogger(__name__)

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
    "- 스토리라인에 명시된 이 화의 역할(전환점, 호흡 화, 클라이맥스, 도입 등)을 존중하세요.\n"
    "- 최근 회차 본문에서 예고되거나 미해결 상태로 남은 사건이 있다면, "
    "이번 화에 적절히 반영할지 고려하세요.\n"
    "- 작품 메타데이터에 명시된 작가 커스텀 규칙이 있다면 반드시 따르세요.\n"
    "- 한국어로 작성하세요.\n\n"

    "## 설정 준수\n"
    "- 설정집에 있는 인물, 세계관, 용어만 사용하세요.\n"
    "- 설정집에 없는 새 개념, 새 용어, 새 시스템을 임의로 만들지 마세요.\n"
    "- 시대 배경에 맞지 않는 표현을 쓰지 마세요.\n"
    "- 이전 화에 등장한 인물의 기억, 과거, 사연은 그 화에서 확립된 내용을 정확히 유지하세요.\n"
    "- 인물의 과거를 서술해야 한다면, 이전 화에서 언급된 범위 내에서만 쓰세요.\n"
    "- 인물이 사용하는 구체적 사물의 위치는 설정집과 이전 본문에서 확립된 대로 유지하세요.\n"
    "- 설정집에서 확립된 규칙(시점 제약, 물리적 제약, 절차 규칙 등)은 "
    "반드시 지키세요. 이전 화에서 어긴 적 있는 규칙은 특히 주의하세요.\n"
    "- 본문에 등장하는 고유 식별자(번호, 날짜, 코드, ID 등)는 "
    "이전 화나 유사 청크의 값을 그대로 복사하지 마세요. 이번 화에 맞는 새 값을 생성하세요.\n"
    "- 작가가 지시하지 않은 서사적 무게의 설정을 임의로 추가하지 마세요. "
    "조연이나 단역의 배경 사연(가족사, 질병, 사고, 죽음, 갈등 등)은 "
    "스토리라인에 명시된 범위에서만 다루세요.\n\n"

    "## 서술 기법\n"
    "- 감정을 설명하지 말고 행동과 사물로 보여주세요.\n"
    "  나쁜 예: '주인공은 슬픔이 무엇인지 알 수 없었다.'\n"
    "  좋은 예: '주인공은 창틀에 놓인 손을 천천히 쥐었다.'\n"
    "- 대사는 짧고 무겁게 쓰세요. 한 마디로 감정을 압축하세요.\n"
    "- 시선, 동작, 사물 디테일로 감정을 전달하세요.\n"
    "- '모르겠다', '알 수 없었다' 같은 내면 독백을 반복하지 마세요.\n"
    "- 인물 간 또는 감정 상태의 대비를 작가 시점에서 설명하지 마세요. "
    "대비는 대화, 행동, 신체 반응의 디테일로 독자가 느끼게 하세요.\n\n"

    "## 금지 사항\n"
    "- 'N화의 ~처럼' 같은 회차 번호 참조를 쓰지 마세요. 메타 표현입니다.\n"
    "- 원고 본문에 회차 번호(예: '11화')를 표기하지 마세요.\n"
    "- 'N년 전 ~했던 이후' 형식으로 과거 사건을 직접 설명하지 마세요. "
    "과거는 이전 화들에서 쌓인 맥락으로 독자가 느끼게 하세요.\n"
    "- 핵심 사건 후 내면 독백을 길게 늘어놓지 마세요. 짧은 행동 묘사로 전환하세요.\n\n"

    "## 인물 관계\n"
    "- 인물 관계를 극적으로 발전시키지 말고, 조용히 보여주세요.\n"
    "- 과장 없는 일상적 장면으로 관계 변화를 암시하세요.\n\n"

    "## 중심 인물\n"
    "- 이 화의 중심 인물은 주인공입니다.\n"
    "- 부캐릭터의 사연이나 고민이 전체 분량의 1/3을 넘지 않도록 하세요.\n"
    "- 같은 부캐릭터와의 대화 장면을 연속 2회 이상 반복하지 마세요.\n"
    "- 작가가 유저 프롬프트에서 '등장 인물 제한'을 명시한 경우, "
    "그 목록 외의 인물은 등장시키지 마세요. 예외를 확장 해석하지 마세요.\n"
    "- 설정집에 명시된 인물의 말투, 대화 패턴, 행동 원칙을 엄격히 지키세요. "
    "특히 custom_fields에 '말하기 규칙', '대사 금지 규칙', '행동 규칙' 같은 항목이 있다면 "
    "반드시 준수하세요.\n"
    "- 인물을 설정보다 따뜻하거나 감정적으로 묘사하지 마세요. "
    "설정에 명시된 톤(차가움/절제됨/유머러스/거침 등)을 그대로 유지하세요.\n"
    "- 인물이 특정 행동을 하지 않는 성격으로 설정됐다면(개인적 약속, 미래 예측, "
    "감정 표현, 도덕적 판단 등), 그 규칙을 벗어나지 마세요.\n\n"

    "## 분량\n"
    "- 이번 화는 3,500~4,000자 이내로 작성하세요.\n"
    "- 반드시 장면을 완결짓고 끝내세요. 문장이 중간에 잘리면 안 됩니다.\n"
    "- 마지막 150자부터는 마무리에 들어가세요.\n"
    "- 대사 수를 세실 때 '네', '아니요' 같은 짧은 반응어는 제외하세요.\n"
)

DRAFT_MAX_TOKENS = 4200


async def _generate_sse(req: DraftRequest):
    requested_model = req.model.strip().lower()
    is_opus = requested_model == "opus"
    rag_mode = "draft_opus" if is_opus else "draft_sonnet"

    context = await assemble_context(
        work_id=req.work_id,
        writer_id=req.writer_id,
        storyline=req.storyline,
        current_episode_num=req.current_episode_num,
        mode=rag_mode,
    )

    # 안정적인 레퍼런스(작품 메타·설정·최근 원문·유사 청크)는 system role에 넣어
    # "지시(작가 요구)"와 "참조 자료"의 경계를 명확히 한다. user role에는
    # 이번 회차 방향과 작가의 임의 지시만 둔다.
    system_prompt = f"{SYSTEM_PROMPT}\n\n# 참조 자료\n{context}"

    extra_instructions = ""
    if req.user_prompt:
        extra_instructions = (
            "\n\n## 작가의 추가 지시사항\n"
            f"{req.user_prompt}"
        )

    user_prompt = (
        f"이번 회차 방향: {req.storyline}"
        f"{extra_instructions}\n\n"
        "위 참조 자료를 바탕으로 이번 회차 초안을 작성해주세요."
    )

    llm = get_llm()
    full_text = []
    model_override = settings.claude_opus_model if is_opus else None

    async for chunk in llm.generate_stream(
        system_prompt,
        user_prompt,
        model_override=model_override,
        max_tokens=DRAFT_MAX_TOKENS,
    ):
        full_text.append(chunk)
        event = json.dumps({"type": "chunk", "content": chunk}, ensure_ascii=False)
        yield f"data: {event}\n\n"
        await asyncio.sleep(0.05)

    final_usage = llm.last_usage
    logger.info("Draft stream finished: usage=%s, length=%s", final_usage, len("".join(full_text)))
    done_event = json.dumps(
        {
            "type": "done",
            "episode_id": req.episode_id,
            "total_length": len("".join(full_text)),
            "usage": final_usage,
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
