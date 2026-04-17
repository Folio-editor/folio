"""POST /v1/reviews — 설정/맥락 기반 검수 결과를 JSON으로 반환."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.mcp.context import WriterContext
from app.mcp.registry import MCP_TOOLS, execute_tool
from app.middleware.auth import require_internal_api_key
from app.services.providers import get_llm
from app.services.rag import assemble_context

router = APIRouter(
    prefix="/reviews",
    tags=["reviews"],
    dependencies=[Depends(require_internal_api_key)],
)

REVIEW_SYSTEM_PROMPT = """당신은 웹소설 전문 검수 AI입니다.
작가가 작성한 원고를 설정집, 이전 맥락과 대조하여 오류를 찾아냅니다.

검수 항목:
1. 설정 충돌: 인물의 외모, 성격, 관계, 능력 등이 설정집과 다른 경우
2. 서술 충돌: 같은 화 내에서 앞뒤 묘사가 모순되는 경우
3. 시대/톤 불일치: 작품의 시대 배경이나 톤에 맞지 않는 표현
4. 맥락 충돌: 이전 화의 사건/상태와 모순되는 경우

규칙:
- 반드시 근거를 제시하라. 원고의 어떤 부분이 설정의 어떤 부분과 충돌하는지 구체적으로 명시하라.
- 심각도를 반드시 표기하라: critical, warning, info
- 문제가 없으면 빈 배열을 반환하라. 억지로 문제를 만들어내지 마라.
- 설정집 정보가 필요하면 제공된 도구를 사용하여 조회하라. 추측하지 마라.

반드시 JSON으로만 응답하라. 마크다운 코드블록을 사용하지 마라. JSON만 출력하라."""

REVIEW_SCHEMA_HINT = """{
  "issues": [
    {
      "type": "setting_conflict | narration_conflict | tone_conflict | context_conflict",
      "severity": "critical | warning | info",
      "location": "문제가 있는 원고 부분 인용 (짧게)",
      "description": "무엇이 왜 문제인지 설명",
      "reference": "근거가 되는 설정/이전 화 내용",
      "suggestion": "수정 제안"
    }
  ],
  "summary": "전체 검수 결과 한 줄 요약",
  "score": 0-100
}"""


class ReviewRequest(BaseModel):
    work_id: str
    writer_id: str
    episode_id: str
    content: str
    episode_number: int


@router.post("")
async def review_episode(
    req: ReviewRequest,
    session: AsyncSession = Depends(get_session),
):
    context = await assemble_context(
        work_id=req.work_id,
        writer_id=req.writer_id,
        storyline="",
        current_episode_num=req.episode_number,
    )

    user_prompt = (
        f"{context}\n\n"
        f"---\n\n"
        f"[검수 대상 원고]\n"
        f"{req.episode_number}화\n\n"
        f"{req.content}\n\n"
        "위 원고를 검수하라. "
        "설정집 정보가 필요하면 도구를 사용하여 조회하라."
    )

    ctx = WriterContext(
        writer_id=uuid.UUID(req.writer_id),
        work_id=uuid.UUID(req.work_id),
    )

    async def tool_executor(name: str, inputs: dict):
        return await execute_tool(name, inputs, session, ctx)

    llm = get_llm()
    system_prompt = f"{REVIEW_SYSTEM_PROMPT}\n응답 형식: {REVIEW_SCHEMA_HINT}"
    result = await llm.generate_with_tools(
        system=system_prompt,
        user=user_prompt,
        tools=MCP_TOOLS,
        tool_executor=tool_executor,
    )

    return result
