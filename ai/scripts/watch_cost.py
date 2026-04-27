"""uvicorn 로그를 tail하면서 요청별 API 원가 / 크레딧을 실시간 산출.

사용:
    python scripts/watch_cost.py test_reports/uvicorn.log
"""

from __future__ import annotations

import re
import sys
import time
from pathlib import Path

# === 크레딧 정책 파라미터 (docs/ai-credit-policy.md 기준) ===
USD_TO_KRW = 1450
MARGIN_RATIO = 1.3
CREDIT_VALUE = 8  # 1크레딧 = 8원

# Anthropic 공개 가격 (USD per 1M tokens)
PRICING = {
    "haiku":  {"input": 1,  "output": 5},
    "sonnet": {"input": 3,  "output": 15},
    "opus":   {"input": 5,  "output": 25},
}

# 엔드포인트별 기본 사용 모델 (요청 payload를 보지 않고 로그로만 추정)
ENDPOINT_MODEL = {
    "/v1/drafts": "sonnet",            # opus 요청 시 별도 표시 어려움 — 기본은 sonnet
    "/v1/reviews": "sonnet",
    "/v1/extract-settings": "haiku",
}

ACCESS_RE = re.compile(
    r'"(?P<method>POST) (?P<path>/v1/[a-z\-]+) HTTP/1\.\d" (?P<status>\d+)'
)
USAGE_RE = re.compile(r"LLM usage:\s*input=(?P<i>\d+),\s*output=(?P<o>\d+)")


def calc(model: str, input_tokens: int, output_tokens: int) -> dict:
    p = PRICING[model]
    i_usd = input_tokens * p["input"] / 1_000_000
    o_usd = output_tokens * p["output"] / 1_000_000
    i_krw = i_usd * USD_TO_KRW
    o_krw = o_usd * USD_TO_KRW
    api_cost = i_krw + o_krw
    charged = api_cost * MARGIN_RATIO
    credits = round(charged / CREDIT_VALUE)
    credit_value_krw = credits * CREDIT_VALUE
    margin = credit_value_krw - api_cost
    margin_pct = (margin / credit_value_krw * 100) if credit_value_krw else 0
    return {
        "model": model,
        "input": input_tokens,
        "output": output_tokens,
        "input_krw": i_krw,
        "output_krw": o_krw,
        "api_cost_krw": api_cost,
        "credits": credits,
        "credit_value_krw": credit_value_krw,
        "margin_krw": margin,
        "margin_pct": margin_pct,
    }


def fmt(path: str, c: dict) -> str:
    return (
        f"[{path}] model={c['model']} "
        f"tokens(in/out)={c['input']}/{c['output']} | "
        f"API원가={c['api_cost_krw']:.1f}원 "
        f"(입력 {c['input_krw']:.1f} + 출력 {c['output_krw']:.1f}) | "
        f"차감={c['credits']}크레딧 ({c['credit_value_krw']}원) | "
        f"수익={c['margin_krw']:+.1f}원 ({c['margin_pct']:.1f}%)"
    )


def tail_f(path: Path):
    with path.open("r", encoding="utf-8", errors="replace") as f:
        f.seek(0, 2)  # 끝으로
        while True:
            line = f.readline()
            if not line:
                time.sleep(0.3)
                continue
            yield line.rstrip("\n")


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: watch_cost.py <uvicorn.log>", file=sys.stderr)
        sys.exit(1)
    log_path = Path(sys.argv[1])
    if not log_path.exists():
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.touch()

    pending_path: str | None = None
    for line in tail_f(log_path):
        m_access = ACCESS_RE.search(line)
        if m_access:
            path = m_access.group("path")
            if path in ENDPOINT_MODEL:
                pending_path = path
            continue
        m_usage = USAGE_RE.search(line)
        if m_usage and pending_path is not None:
            it = int(m_usage.group("i"))
            ot = int(m_usage.group("o"))
            model = ENDPOINT_MODEL[pending_path]
            # Opus 초안 휴리스틱: output ≥ 6000이면 보통 max=4000이라 Sonnet/Opus 구분 불가.
            # 정확한 구분은 /v1/drafts?model=opus 플래그 필요. 여기서는 input 단가가 모델별로 크게 다르므로
            # input_tokens 대비 expected Sonnet 원가/토큰 = 3$/1M. 일단 기본 모델 추정으로 출력.
            c = calc(model, it, ot)
            print(fmt(pending_path, c), flush=True)
            pending_path = None


if __name__ == "__main__":
    main()
