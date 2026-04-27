"""GMS 프록시 동시성 한도 측정 스크립트.

/v1/extract-settings 엔드포인트로 동시 N건을 동시에 던져
첫 429/529/타임아웃이 어디서 뜨는지 확인한다.

사용:
    cd ai
    doppler run -- python scripts/concurrency_test.py --concurrency 5
    doppler run -- python scripts/concurrency_test.py --concurrency 10
    doppler run -- python scripts/concurrency_test.py --concurrency 20

옵션:
    --concurrency N   동시 호출 수 (기본 5)
    --base URL        AI 서버 베이스 URL (기본 http://localhost:8000)
    --timeout SEC     각 요청 타임아웃 초 (기본 60)
"""

from __future__ import annotations

import argparse
import asyncio
import os
import statistics
import sys
import time
from dataclasses import dataclass

import httpx

DEFAULT_WORK_ID = "0bd4fc12-0845-4c7f-a14e-5744968b9d82"
DEFAULT_WRITER_ID = "84c10cc2-fe97-4057-b9b5-a4a0fd1f131f"

# 짧은 더미 원고 — 토큰 적게 써서 비용 절감
SAMPLE_CONTENT = (
    "리운은 사무실 의자에 앉아 창밖을 바라보았다. "
    "회색 하늘 아래 낯선 손님 한 명이 다가오고 있었다. "
    "이름은 모르지만, 어딘가 익숙한 분위기였다."
)


@dataclass
class Result:
    idx: int
    status: int | str
    elapsed: float
    rate_limit_headers: dict[str, str]
    error: str | None = None
    body_preview: str | None = None
    all_headers: dict[str, str] | None = None


async def fire_one(
    client: httpx.AsyncClient,
    idx: int,
    url: str,
    api_key: str,
    timeout: float,
) -> Result:
    payload = {
        "work_id": DEFAULT_WORK_ID,
        "writer_id": DEFAULT_WRITER_ID,
        "content": SAMPLE_CONTENT,
    }
    headers = {
        "X-Internal-Api-Key": api_key,
        "Content-Type": "application/json",
    }
    started = time.monotonic()
    try:
        resp = await client.post(url, json=payload, headers=headers, timeout=timeout)
        elapsed = time.monotonic() - started
        rl_headers = {
            k: v for k, v in resp.headers.items()
            if "ratelimit" in k.lower() or k.lower() == "retry-after"
        }
        # 5xx인 경우 본문/헤더 전체를 캡처하여 원인 분석에 사용
        body_preview = None
        all_headers = None
        if resp.status_code >= 500:
            body_preview = resp.text[:1500]
            all_headers = dict(resp.headers)
        return Result(
            idx=idx, status=resp.status_code, elapsed=elapsed,
            rate_limit_headers=rl_headers,
            body_preview=body_preview, all_headers=all_headers,
        )
    except httpx.TimeoutException:
        return Result(
            idx=idx, status="TIMEOUT",
            elapsed=time.monotonic() - started,
            rate_limit_headers={}, error="timeout",
        )
    except Exception as exc:
        return Result(
            idx=idx, status="ERROR",
            elapsed=time.monotonic() - started,
            rate_limit_headers={}, error=str(exc)[:200],
        )


async def main(args: argparse.Namespace) -> int:
    api_key = os.environ.get("INTERNAL_API_KEY")
    if not api_key:
        print("ERROR: INTERNAL_API_KEY env var not set. Run with `doppler run --`.", file=sys.stderr)
        return 2

    url = f"{args.base.rstrip('/')}/v1/extract-settings"
    print(f"Target:      {url}")
    print(f"Concurrency: {args.concurrency}")
    print(f"Timeout:     {args.timeout}s")
    print("-" * 60)

    async with httpx.AsyncClient() as client:
        wall_start = time.monotonic()
        tasks = [
            fire_one(client, i, url, api_key, args.timeout)
            for i in range(args.concurrency)
        ]
        results = await asyncio.gather(*tasks)
        wall = time.monotonic() - wall_start

    results.sort(key=lambda r: r.idx)
    for r in results:
        rl = ""
        if r.rate_limit_headers:
            rl = " | " + ", ".join(f"{k}={v}" for k, v in r.rate_limit_headers.items())
        err = f" err={r.error}" if r.error else ""
        print(f"[{r.idx:02d}] status={r.status} elapsed={r.elapsed:6.2f}s{rl}{err}")

    statuses = [str(r.status) for r in results]
    elapsed_ok = [r.elapsed for r in results if isinstance(r.status, int) and r.status == 200]
    counts: dict[str, int] = {}
    for s in statuses:
        counts[s] = counts.get(s, 0) + 1

    print("-" * 60)
    print(f"Wall time:   {wall:.2f}s")
    print(f"Status mix:  {counts}")
    if elapsed_ok:
        print(f"200 latency: min={min(elapsed_ok):.2f}s "
              f"p50={statistics.median(elapsed_ok):.2f}s "
              f"max={max(elapsed_ok):.2f}s")

    # 5xx 본문/헤더 덤프
    failures = [r for r in results if isinstance(r.status, int) and r.status >= 500]
    if failures:
        print()
        print("=" * 60)
        print(f"5xx DETAILS  ({len(failures)} failures)")
        print("=" * 60)
        for r in failures:
            print(f"\n--- [{r.idx:02d}] status={r.status} elapsed={r.elapsed:.2f}s ---")
            if r.all_headers:
                print("  Headers:")
                for k, v in r.all_headers.items():
                    print(f"    {k}: {v}")
            if r.body_preview:
                print("  Body:")
                for line in r.body_preview.splitlines():
                    print(f"    {line}")
    return 0


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--concurrency", "-c", type=int, default=5)
    p.add_argument("--base", default="http://localhost:8000")
    p.add_argument("--timeout", type=float, default=60.0)
    return p.parse_args()


if __name__ == "__main__":
    sys.exit(asyncio.run(main(parse_args())))
