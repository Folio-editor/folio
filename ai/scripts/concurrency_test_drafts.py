"""GMS 스트리밍(`/v1/drafts`) 동시성 테스트.

extract-settings(JSON, Haiku)와 달리 drafts는 SSE 스트리밍 + Sonnet이라
완전히 다른 부하 프로파일이다.

지표:
  - TTFB (time to first byte/event)
  - 전체 스트리밍 완료 시간
  - 첫 에러(non-200, 또는 스트림 중간 끊김)

비용 주의:
  Sonnet은 Haiku보다 약 5~10배 비싸고, 매 호출마다 max_tokens 4000까지 받는다.
  N=10이면 단일 비용 × 10 ≈ 즉시 수천 원 단위 비용 발생 가능.

사용:
    cd ai
    doppler run -- python scripts/concurrency_test_drafts.py --concurrency 1
    doppler run -- python scripts/concurrency_test_drafts.py --concurrency 5
"""

from __future__ import annotations

import argparse
import asyncio
import os
import statistics
import sys
import time
from dataclasses import dataclass, field

import httpx

DEFAULT_WORK_ID = "0bd4fc12-0845-4c7f-a14e-5744968b9d82"
DEFAULT_WRITER_ID = "84c10cc2-fe97-4057-b9b5-a4a0fd1f131f"
DEFAULT_EPISODE_ID = "47251957-7e98-4861-aea3-9a5925a98250"
DEFAULT_EPISODE_NUM = 2

# 짧은 줄거리 — 토큰 절약
SAMPLE_STORYLINE = (
    "리운이 의뢰인의 정체에 의문을 품기 시작한다. "
    "낯선 손님은 사실 과거 사건과 연결돼 있다."
)


@dataclass
class StreamResult:
    idx: int
    status: int | str
    ttfb: float | None
    total: float
    bytes_recv: int = 0
    error: str | None = None
    rate_limit_headers: dict[str, str] = field(default_factory=dict)


async def fire_one_stream(
    client: httpx.AsyncClient,
    idx: int,
    url: str,
    api_key: str,
    timeout: float,
) -> StreamResult:
    payload = {
        "work_id": DEFAULT_WORK_ID,
        "writer_id": DEFAULT_WRITER_ID,
        "episode_id": DEFAULT_EPISODE_ID,
        "storyline": SAMPLE_STORYLINE,
        "current_episode_num": DEFAULT_EPISODE_NUM,
        "model": "sonnet",
    }
    headers = {
        "X-Internal-Api-Key": api_key,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    started = time.monotonic()
    ttfb: float | None = None
    bytes_recv = 0
    try:
        async with client.stream("POST", url, json=payload, headers=headers, timeout=timeout) as resp:
            rl_headers = {
                k: v for k, v in resp.headers.items()
                if "ratelimit" in k.lower() or k.lower() == "retry-after"
            }
            if resp.status_code != 200:
                body = await resp.aread()
                return StreamResult(
                    idx=idx, status=resp.status_code, ttfb=None,
                    total=time.monotonic() - started,
                    bytes_recv=len(body),
                    rate_limit_headers=rl_headers,
                    error=body.decode("utf-8", errors="replace")[:200],
                )
            async for chunk in resp.aiter_bytes():
                if ttfb is None:
                    ttfb = time.monotonic() - started
                bytes_recv += len(chunk)
            total = time.monotonic() - started
            return StreamResult(
                idx=idx, status=200, ttfb=ttfb, total=total,
                bytes_recv=bytes_recv, rate_limit_headers=rl_headers,
            )
    except httpx.TimeoutException:
        return StreamResult(
            idx=idx, status="TIMEOUT", ttfb=ttfb,
            total=time.monotonic() - started,
            bytes_recv=bytes_recv, error="timeout",
        )
    except Exception as exc:
        return StreamResult(
            idx=idx, status="ERROR", ttfb=ttfb,
            total=time.monotonic() - started,
            bytes_recv=bytes_recv, error=str(exc)[:200],
        )


async def main(args: argparse.Namespace) -> int:
    api_key = os.environ.get("INTERNAL_API_KEY")
    if not api_key:
        print("ERROR: INTERNAL_API_KEY not set. Run with `doppler run --`.", file=sys.stderr)
        return 2

    url = f"{args.base.rstrip('/')}/v1/drafts"
    print(f"Target:      {url}  (Sonnet streaming)")
    print(f"Concurrency: {args.concurrency}")
    print(f"Timeout:     {args.timeout}s")
    print("-" * 70)

    async with httpx.AsyncClient() as client:
        wall_start = time.monotonic()
        tasks = [
            fire_one_stream(client, i, url, api_key, args.timeout)
            for i in range(args.concurrency)
        ]
        results = await asyncio.gather(*tasks)
        wall = time.monotonic() - wall_start

    results.sort(key=lambda r: r.idx)
    for r in results:
        ttfb_str = f"ttfb={r.ttfb:5.2f}s" if r.ttfb is not None else "ttfb=  N/A"
        rl = ""
        if r.rate_limit_headers:
            rl = " | " + ", ".join(f"{k}={v}" for k, v in r.rate_limit_headers.items())
        err = f" err={r.error}" if r.error else ""
        print(f"[{r.idx:02d}] status={r.status} {ttfb_str} total={r.total:6.2f}s "
              f"bytes={r.bytes_recv}{rl}{err}")

    statuses = [str(r.status) for r in results]
    counts: dict[str, int] = {}
    for s in statuses:
        counts[s] = counts.get(s, 0) + 1

    ttfbs = [r.ttfb for r in results if r.ttfb is not None]
    totals_ok = [r.total for r in results if isinstance(r.status, int) and r.status == 200]

    print("-" * 70)
    print(f"Wall time:   {wall:.2f}s")
    print(f"Status mix:  {counts}")
    if ttfbs:
        print(f"TTFB:        min={min(ttfbs):.2f}s p50={statistics.median(ttfbs):.2f}s max={max(ttfbs):.2f}s")
    if totals_ok:
        print(f"200 total:   min={min(totals_ok):.2f}s p50={statistics.median(totals_ok):.2f}s max={max(totals_ok):.2f}s")
    return 0


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--concurrency", "-c", type=int, default=1)
    p.add_argument("--base", default="http://localhost:8001")
    p.add_argument("--timeout", type=float, default=180.0)
    return p.parse_args()


if __name__ == "__main__":
    sys.exit(asyncio.run(main(parse_args())))
