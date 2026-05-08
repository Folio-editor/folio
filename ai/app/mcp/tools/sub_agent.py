"""MCP 도구: Haiku worker 위임 (Phase 4 §A-3).

Sonnet planner 가 무거운 분류·요약·재작성 작업을 Haiku 에 위임할 때 호출.
generate_json 으로 JSON 응답을 받고 token usage 를 반환한다.

호출자(planner runner)는 결과뿐 아니라 `usage` 필드도 영수증 line 으로 적재한다.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import WriterContext
from app.services.providers import get_llm

_SCHEMA_HINT = '{ "result": "string | object" }'

_SYSTEM_PROMPT = (
    "당신은 메인 agent 가 위임한 sub-task 를 수행하는 worker 입니다. "
    "주어진 task 와 context 를 분석해 핵심 결과만 JSON 의 result 필드에 담아 반환합니다. "
    "장황한 설명·해설 없이 결과만 출력합니다."
)


async def invoke_haiku_worker(
    session: AsyncSession,
    ctx: WriterContext,
    *,
    task: str,
    context: dict[str, Any] | None = None,
    max_tokens: int = 1500,
) -> dict[str, Any]:
    llm = get_llm()
    try:
        ctx_json = json.dumps(context or {}, ensure_ascii=False, indent=2)
    except (TypeError, ValueError):
        ctx_json = str(context or {})
    user = f"[task]\n{task}\n\n[context]\n{ctx_json}"
    capped = min(max(int(max_tokens), 200), 1500)
    # Anthropic provider 의 _haiku_model 강제 (sonnet 우회 방지)
    haiku_model = getattr(llm, "_haiku_model", None)
    result = await llm.generate_json(
        _SYSTEM_PROMPT,
        user,
        _SCHEMA_HINT,
        model_override=haiku_model,
        max_tokens=capped,
    )
    usage = getattr(llm, "last_usage", {"input_tokens": 0, "output_tokens": 0})
    return {
        "result": result.get("result") if isinstance(result, dict) else result,
        "usage": usage or {"input_tokens": 0, "output_tokens": 0},
    }
