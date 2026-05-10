"""3-tier 토큰 예산 관리 + 영수증 라인 버퍼 (Phase 4 §M).

Tier 1: 시나리오 누적 (max_total / max_iterations)
Tier 2: 도구 카테고리 (max_calls / max_tokens)
Tier 3: 단일 step (Anthropic max_tokens 파라미터로 별도 제어)
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.agent.scenarios import TOOL_CATEGORY_BUDGET
from app.mcp.registry import TOOL_CATEGORY


# Anthropic 가격 (per 1M tokens, USD) — 2026-05 기준.
# 프로젝트 표준 정책 = backend/.../payment/pricing/CreditCalculator.java (단일 진실 출처).
#   1 credit = 0.8원 (10000원 / 13000 credits)
#   차감 = round(USD * USD_TO_KRW * MARGIN_RATIO / CREDIT_VALUE_KRW)
# prompt caching: cache_read = 0.1× input, cache_create = 1.25× input.
_PRICE_USD_PER_M = {
    "sonnet": {"in": 3.0,  "out": 15.0, "cache_read": 0.3,  "cache_create": 3.75},
    "haiku":  {"in": 0.8,  "out":  4.0, "cache_read": 0.08, "cache_create": 1.0},
}
USD_TO_KRW = 1450.0
MARGIN_RATIO = 1.1     # 2026-05-09: 1.3 → 1.1 인하 (backend CreditCalculator 와 동기 필수)
# Phase: 결제 단위 재구성 (10000원 = 1300 → 13000 credits).
# backend CreditCalculator.CREDIT_VALUE_KRW 와 항상 동일 유지 — 한쪽만 바꾸면 청구 mismatch.
CREDIT_VALUE_KRW = 0.8


class BudgetExceeded(Exception):
    def __init__(self, reason: str, message: str = "") -> None:
        super().__init__(message or reason)
        self.reason = reason


def _convert(model: str, usage: dict[str, int]) -> int:
    """LLM raw 토큰 → 사용자 크레딧 (KRW 환산 + 마진).

    CreditCalculator (backend) 와 동일 공식:
        cost_krw = USD * 1450      # 환율
        charged  = cost_krw * 1.1   # 마진 (2026-05-09 인하)
        credits  = round(charged / 0.8)   # 1 크레딧 = 0.8 원 (10000원 = 13000 credits)
    """
    p = _PRICE_USD_PER_M.get(model, _PRICE_USD_PER_M["sonnet"])
    in_tok = int(usage.get("input_tokens", 0) or 0)
    out_tok = int(usage.get("output_tokens", 0) or 0)
    cache_read = int(usage.get("cache_read_input_tokens", 0) or 0)
    cache_create = int(usage.get("cache_creation_input_tokens", 0) or 0)
    miss = max(0, in_tok - cache_read - cache_create)

    # USD per token = price_per_M / 1_000_000
    cost_usd = (
        miss * p["in"]
        + cache_read * p["cache_read"]
        + cache_create * p["cache_create"]
        + out_tok * p["out"]
    ) / 1_000_000.0

    charged_krw = cost_usd * USD_TO_KRW * MARGIN_RATIO
    credits = round(charged_krw / CREDIT_VALUE_KRW)
    return max(credits, 0)


class BudgetTracker:
    """시나리오 단위 누적 예산 + 라인 아이템 수집."""

    def __init__(
        self,
        scenario_cfg: dict[str, int],
        progress_callback: "Any | None" = None,
    ) -> None:
        self.cfg = scenario_cfg
        self.iterations = 0
        self.total_input_raw = 0
        self.total_output_raw = 0
        self.cache_read_tokens = 0
        self.cache_create_tokens = 0
        self.cum_user_tokens = 0
        self.tool_calls: dict[str, int] = defaultdict(int)
        self.tool_tokens: dict[str, int] = defaultdict(int)
        self.lines: list[dict[str, Any]] = []
        self._seq = 0
        self.aborted: str | None = None
        # 매 line 추가 후 호출 — Celery task 의 update_state 위임 (없으면 noop)
        self._progress_callback = progress_callback

    def _emit_progress(self) -> None:
        if not self._progress_callback:
            return
        try:
            recent = self.lines[-3:] if self.lines else []
            self._progress_callback({
                "iterations": self.iterations,
                "input_raw": self.total_input_raw,
                "output_raw": self.total_output_raw,
                "user_tokens": self.cum_user_tokens,
                "tool_calls": dict(self.tool_calls),
                "recent_lines": recent,
            })
        except Exception:
            pass     # 진행 업데이트 실패는 본 작업 막지 않음

    # ─── 누적 기록 ───

    def record_planner(self, usage: dict[str, int], detail: dict | None = None) -> int:
        ut = self._record_llm("sonnet", "planner_call", usage, detail)
        self.iterations += 1
        self._emit_progress()
        self._guard_total()
        if self.iterations >= self.cfg["max_iterations"]:
            raise BudgetExceeded("max_iterations")
        return ut

    def record_worker(self, usage: dict[str, int], detail: dict | None = None) -> int:
        ut = self._record_llm("haiku", "worker_call", usage, detail)
        self.tool_tokens["sub_agent"] += ut
        self._emit_progress()
        self._guard_total()
        return ut

    def record_compression(self, usage: dict[str, int]) -> int:
        ut = self._record_llm("haiku", "compression", usage, {"note": "auto_compress"})
        self._emit_progress()
        self._guard_total()
        return ut

    def record_tool(self, name: str, args: dict | None = None, result_size: int = 0) -> None:
        cat = TOOL_CATEGORY.get(name, "read_summary")
        self.tool_calls[cat] += 1
        self._seq += 1
        self.lines.append(
            {
                "seq": self._seq,
                "step_type": "tool_call",
                "actor": f"tool:{name}",
                "tool_name": name,
                "input_tokens": 0,
                "output_tokens": 0,
                "user_tokens": 0,
                "detail": {"args": args or {}, "result_size": result_size, "category": cat},
            }
        )
        self._emit_progress()
        self._guard_category(cat)

    # ─── 예산 검사 ───

    def _record_llm(
        self,
        model: str,
        step_type: str,
        usage: dict[str, int],
        detail: dict | None,
    ) -> int:
        ut = _convert(model, usage)
        in_tok = int(usage.get("input_tokens", 0) or 0)
        out_tok = int(usage.get("output_tokens", 0) or 0)
        cache_read = int(usage.get("cache_read_input_tokens", 0) or 0)
        cache_create = int(usage.get("cache_creation_input_tokens", 0) or 0)

        self.total_input_raw += in_tok
        self.total_output_raw += out_tok
        self.cache_read_tokens += cache_read
        self.cache_create_tokens += cache_create
        self.cum_user_tokens += ut

        self._seq += 1
        self.lines.append(
            {
                "seq": self._seq,
                "step_type": step_type,
                "actor": model,
                "tool_name": None,
                "input_tokens": in_tok,
                "output_tokens": out_tok,
                "user_tokens": ut,
                "detail": {
                    **(detail or {}),
                    "cache_read_tokens": cache_read,
                    "cache_create_tokens": cache_create,
                    "miss_tokens": max(0, in_tok - cache_read - cache_create),
                },
            }
        )
        return ut

    def _guard_total(self) -> None:
        if self.total_input_raw + self.total_output_raw > self.cfg["max_total"]:
            raise BudgetExceeded("scenario_budget")

    def _guard_category(self, cat: str) -> None:
        cfg = TOOL_CATEGORY_BUDGET.get(cat)
        if not cfg:
            return
        if self.tool_calls[cat] > cfg["max_calls"]:
            raise BudgetExceeded(f"tool_category:{cat}")
        if cfg["max_tokens"] and self.tool_tokens[cat] > cfg["max_tokens"]:
            raise BudgetExceeded(f"tool_category_tokens:{cat}")

    # ─── 영수증 변환 ───

    def to_receipt_payload(
        self,
        *,
        scenario: str,
        feature: str,
        reference_type: str,
        reference_id: str,
        status: str,
        duration_ms: int,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return {
            "scenario": scenario,
            "feature": feature,
            "reference_type": reference_type,
            "reference_id": reference_id,
            "total_user_tokens": self.cum_user_tokens,
            "total_input_raw": self.total_input_raw,
            "total_output_raw": self.total_output_raw,
            "cache_read_tokens": self.cache_read_tokens,
            "cache_create_tokens": self.cache_create_tokens,
            "status": status,
            "abort_reason": self.aborted,
            "duration_ms": duration_ms,
            "idempotency_key": idempotency_key,
            "lines": self.lines,
        }
