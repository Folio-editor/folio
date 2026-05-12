"""MCP 도구 결과 의도 기반 압축 (Haiku 미들웨어).

오케스트레이터(Sonnet)가 raw 도구 결과를 직접 받으면 컨텍스트가 빠르게 부풀어 200화+
규모에서 비용·캐시 효율이 모두 무너진다. 대신 Haiku 가 raw 결과 + 오케스트레이터가
명시한 목적(purpose) 을 함께 받아 목적에 부합하는 핵심 정보만 추려 짧은 한국어 보고서
형태로 반환한다.

원칙:
- raw 에 명시된 사실만 인용 (추측·창작 금지)
- episode_id 같은 UUID 식별자는 보존 — 후속 도구 호출에 필요
- 디버그 메타(빈 필드, 부동소수 유사도, 카운트) 생략
- 목적이 좁으면 결과도 좁게

실패 시(Haiku 미설정 / 모델 오류 / 너무 작은 raw): 원본 그대로 반환 — graceful degradation.

호출자(registry.execute_tool)는 결과의 'usage' 필드를 planner billing 에 흘려보낸다.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.mcp.context import WriterContext
from app.services.providers import get_llm

logger = logging.getLogger(__name__)


# 압축 시도 임계 — 이보다 작은 raw 는 그대로 통과 (Haiku 호출 오버헤드 절감).
# 작품 초반 (회차 적음) 에는 raw 가 작아 자연스럽게 통과되고, 누적되면 압축 발동.
_CONDENSE_MIN_CHARS = 800


_CONDENSE_SYSTEM = (
    "당신은 작가 에이전트 오케스트레이터에게 도구 결과를 압축해 전달하는 리포터다. "
    "raw 데이터에서 오케스트레이터가 명시한 목적에 부합하는 핵심 사실만 한국어 보고서로 정리한다.\n\n"
    "원칙:\n"
    "(1) raw 에 명시된 사실만 인용 — 추측·추론·창작 금지.\n"
    "(2) ★ ID 필드는 **반드시 빠짐없이** 보존 — episode_id, character_id, planted_episode_id,\n"
    "    paid_off_episode_id, suggested_reference_episode_id 등 UUID 형식의 모든 ID 필드는\n"
    "    raw 에 등장한 모두를 결과에 포함. 오케스트레이터가 후속 drill 호출에서 사용하므로\n"
    "    purpose 가 좁다고 누락하지 말 것. ID 가 많으면 표/리스트로 묶어 압축 출력.\n"
    "(3) 핵심 외 디버그 메타(빈 필드, 카운트, 부동소수 유사도) 생략.\n"
    "(4) 목적과 무관한 텍스트(설명·서술 본문)는 과감히 생략. 단 (2) 의 ID 보존 원칙은 우선.\n"
    "(5) 보고서 구조는 자유 — 항목 나열·표·짧은 단락 등 명시한 목적에 가장 잘 답하는 형태로.\n"
    "(6) 빈 결과/오류 raw 면 그 사실을 명시 (오케스트레이터가 재호출 여부 판단).\n"
    "(7) raw 에 v1: 로 시작하는 base64 암호문이 있으면 그 필드는 '(암호화 미해제)' 로 표시."
)


async def haiku_condense_tool_result(
    tool_name: str,
    raw_result: Any,
    purpose: str | None,
    ctx: WriterContext,  # noqa: ARG001 — 시그니처 일관성 위해 유지 (향후 작품 컨텍스트 활용 여지)
) -> Any:
    """Haiku 로 도구 결과를 목적 기반 압축.

    실패/소량/에러 raw 시 raw_result 그대로 반환 (graceful degradation).
    성공 시 dict { tool, purpose, report, raw_size_chars, condensed=True, usage } 반환.
    """
    # 1) raw 직렬화 — 크기 측정과 Haiku 입력 모두에 필요
    try:
        raw_json = json.dumps(raw_result, ensure_ascii=False, default=str)
    except Exception:
        return raw_result

    # 2) 너무 작으면 압축 의미 없음 — Haiku 호출 오버헤드만 발생
    if len(raw_json) < _CONDENSE_MIN_CHARS:
        return raw_result

    # 3) 에러 객체는 그대로 — 오케스트레이터가 에러 종류로 분기 판단해야 함
    if isinstance(raw_result, dict) and "error" in raw_result:
        return raw_result

    # 4) Haiku 모델 미설정 (fake provider 등 테스트 환경) 에서는 raw 통과
    llm = get_llm()
    haiku_model = getattr(llm, "_haiku_model", None)
    if not haiku_model:
        return raw_result

    user_prompt = (
        f"[도구]\n{tool_name}\n\n"
        f"[오케스트레이터가 명시한 목적]\n{(purpose or '(미지정)').strip()}\n\n"
        f"[raw 결과 (JSON)]\n{raw_json}"
    )
    try:
        result = await llm.generate_json(
            system=_CONDENSE_SYSTEM,
            user=user_prompt,
            schema_hint='{"report": "string — 목적에 부합하는 핵심을 정리한 한국어 보고서"}',
            model_override=haiku_model,
            max_tokens=1500,
        )
    except Exception as e:
        logger.warning(
            "haiku_condense_failed tool=%s raw_size=%d err=%s",
            tool_name, len(raw_json), str(e)[:200],
        )
        return raw_result

    report = ""
    if isinstance(result, dict):
        r = result.get("report")
        if isinstance(r, str):
            report = r.strip()
    if not report:
        # Haiku 가 형식 어긋난 응답 — fallback to raw
        return raw_result

    usage = getattr(llm, "last_usage", {"input_tokens": 0, "output_tokens": 0})
    return {
        "tool": tool_name,
        "purpose": purpose,
        "report": report,
        "raw_size_chars": len(raw_json),
        "condensed": True,
        "usage": usage,
    }
