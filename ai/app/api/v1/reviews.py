"""POST /v1/reviews - 설정/맥락 기반 검수 결과를 JSON으로 반환."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_session
from app.middleware.auth import require_internal_api_key
from app.services.providers import get_llm
from app.services.rag import assemble_context
from app.services.settings_loader import load_settings
from app.services.text_extractor import extract_plain_text

# 기존 MCP 기반 검수 경로는 비용 절감 작업 때문에 비활성화했다.
# 나중에 설정집 크기 분기 시 다시 사용할 수 있으므로 삭제하지 않고 남겨둔다.
#
# from app.mcp.context import WriterContext
# from app.mcp.registry import MCP_TOOLS, execute_tool

router = APIRouter(
    prefix="/reviews",
    tags=["reviews"],
    dependencies=[Depends(require_internal_api_key)],
)

REVIEW_SYSTEM_PROMPT = (
    """당신은 웹소설 전문 검수 AI입니다.
작가가 작성한 원고를 설정집, 이전 맥락과 대조하여 오류를 찾아냅니다.

## 검수 항목

### 1. 설정 충돌 (setting_conflict)
- 인물의 외모, 성격, 관계, 능력 등이 설정집과 다른 경우
- 세계관의 규칙, 시스템, 용어가 설정과 다른 경우
- 장소, 사물의 위치나 상태가 설정과 다른 경우

### 2. 서술 충돌 (narration_conflict)
- 같은 화 내에서 앞뒤 묘사가 모순되는 경우
- "~하지 않는다"고 서술한 직후 그 행동을 하는 경우
- 한 장면 안에서 시간, 날씨, 위치가 바뀌는 경우

### 3. 시간 논리 충돌 (time_conflict)
- 설정상 소요 시간과 본문에 서술된 시간이 맞지 않는 경우
- 설정상 단계적 과정(예: 24시간에 걸친 변화)을 즉시 완료로 서술한 경우
- 작품 내 시간 흐름이 논리적으로 맞지 않는 경우

### 4. 시대/톤 불일치 (tone_conflict)
- 작품의 시대 배경에 맞지 않는 표현이나 용어
- 작품의 전체 톤과 맞지 않는 문체 전환
- 특정 표현이나 단어가 과도하게 반복되는 경우

### 5. 맥락 충돌 (context_conflict)
- 이전 화의 사건, 상태, 결과와 모순되는 경우
- 이전 화에서 확립된 인물 관계나 감정선과 다른 경우

## 규칙
- 반드시 근거를 제시하라. 원고의 어떤 부분이 설정의 어떤 부분과 충돌하는지 구체적으로 명시하라.
- 심각도를 반드시 표기하라: critical(반드시 수정), warning(수정 권장), info(참고)
- 이번 화가 아닌 이전 화의 오류를 발견하면 info로 표기하고, description에 "이전 화(N화) 오류"를 명시하라.
- 설정 문서에 명시되지 않았지만 이전 본문에서 확립된 사실도 근거로 사용할 수 있다.
- 문제가 없으면 빈 배열을 반환하라. 억지로 문제를 만들어내지 마라.
- 제공된 설정집과 이전 회차 정보만 근거로 사용하라. 추측하지 마라.
- 각 issue에 수정 제안(suggestion)을 반드시 포함하라.

반드시 JSON으로만 응답하라. 마크다운 코드블록을 사용하지 마라."""
)

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


def _format_character_settings(rows: list[tuple[Any, ...]]) -> str:
    if not rows:
        return "(없음)"

    lines: list[str] = []
    for name, gender, age, personality, content in rows:
        parts = [f"- 이름: {name}"]
        if gender:
            parts.append(f"성별: {gender}")
        if age:
            parts.append(f"나이: {age}")
        if personality:
            parts.append(f"성격: {personality}")
        if content:
            parts.append(f"상세: {extract_plain_text(content)}")
        lines.append("\n".join(parts))
    return "\n\n".join(lines)


def _format_world_note_settings(rows: list[tuple[Any, ...]]) -> str:
    if not rows:
        return "(없음)"

    lines: list[str] = []
    for name, content in rows:
        description = extract_plain_text(content) if content else ""
        if description:
            lines.append(f"- 이름: {name}\n상세: {description}")
        else:
            lines.append(f"- 이름: {name}")
    return "\n\n".join(lines)


def _normalize_review_result(result: dict[str, Any]) -> dict[str, Any]:
    if "issues" not in result and "score" not in result:
        return {
            "issues": [],
            "summary": "검수 결과 없음 (fake)",
            "score": 100,
        }

    issues = result.get("issues", [])
    summary = result.get("summary", "검수 결과 없음")
    score = result.get("score", 100)

    return {
        "issues": issues if isinstance(issues, list) else [],
        "summary": summary if isinstance(summary, str) else "검수 결과 없음",
        "score": score if isinstance(score, int | float) else 100,
    }


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
        mode="review",
    )
    settings_bundle = await load_settings(session, req.work_id)
    if settings_bundle["mode"] == "full":
        character_settings = _format_character_settings(settings_bundle["characters"])
        world_note_settings = _format_world_note_settings(settings_bundle["world_notes"])
    else:
        character_settings = settings_bundle["characters_text"]
        world_note_settings = settings_bundle["world_notes_text"]
    cleaned_content = extract_plain_text(req.content)

    user_prompt = (
        f"## 작품 정보\n{context}\n\n"
        f"## 등장인물 설정\n{character_settings}\n\n"
        f"## 세계관 설정\n{world_note_settings}\n\n"
        f"## 검수할 원고\n{cleaned_content}\n\n"
        f"## 응답 형식\n{REVIEW_SCHEMA_HINT}"
    )

    llm = get_llm()
    system_prompt = f"{REVIEW_SYSTEM_PROMPT}\n응답 형식: {REVIEW_SCHEMA_HINT}"
    result = await llm.generate_json(
        system=system_prompt,
        user=user_prompt,
        schema_hint=REVIEW_SCHEMA_HINT,
        model_override=settings.claude_sonnet_model,
        max_tokens=8000,
    )
    normalized = _normalize_review_result(result)
    normalized["usage"] = llm.last_usage

    # 기존 MCP 기반 검수 경로. 설정집 크기 분기 시 되살릴 수 있다.
    #
    # ctx = WriterContext(
    #     writer_id=uuid.UUID(req.writer_id),
    #     work_id=uuid.UUID(req.work_id),
    # )
    #
    # async def tool_executor(name: str, inputs: dict):
    #     return await execute_tool(name, inputs, session, ctx)
    #
    # result = await llm.generate_with_tools(
    #     system=system_prompt,
    #     user=user_prompt,
    #     tools=MCP_TOOLS,
    #     tool_executor=tool_executor,
    # )

    return normalized
