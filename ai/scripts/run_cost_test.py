"""dummy-work-2 임베딩 + 초안 + 검수 오케스트레이션 (비용 테스트 1회용).

실행:
    python scripts/run_cost_test.py

결과 저장:
    test_reports/cost_raw_dummy_work_2.json
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import httpx

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

WORK_ID = "7ab0624e-63bd-408c-b16f-28d39d3e2fdc"
WRITER_ID = "1b5188e5-2caf-450a-a519-313402437941"
STORYLINE = (
    "서리운이 새로운 의뢰인을 만나 기억을 열어본다. "
    "그 기억 속에서 예상치 못한 것이 발견된다."
)
CURRENT_EPISODE_NUM = 11
BASE = "http://localhost:8000"
API_KEY = os.environ["INTERNAL_API_KEY"]
HEADERS = {"X-Internal-Api-Key": API_KEY, "Content-Type": "application/json"}
OUT_DIR = Path("test_reports")
OUT_DIR.mkdir(exist_ok=True)


def psql(sql: str) -> str:
    r = subprocess.run(
        [
            "docker", "exec", "-i", "storyzip-postgresql-dev",
            "psql", "-U", "storyzip", "-d", "storyzip",
            "-At", "-c", sql,
        ],
        capture_output=True, text=True, check=True, encoding="utf-8",
    )
    return r.stdout


def fetch_unique_episodes() -> list[dict[str, Any]]:
    sql = (
        "SELECT json_agg(row_to_json(t) ORDER BY sort_order) FROM ("
        "SELECT DISTINCT ON (sort_order) id::text AS id, title, sort_order, content "
        f"FROM episode WHERE work_id = '{WORK_ID}' "
        "ORDER BY sort_order, created_at"
        ") t;"
    )
    out = psql(sql).strip()
    if not out or out == "null":
        return []
    return json.loads(out)


def chunk_count() -> int:
    out = psql(
        f"SELECT count(*) FROM episode_chunk WHERE work_id = '{WORK_ID}';"
    )
    return int(out.strip() or "0")


async def trigger_pipeline(
    client: httpx.AsyncClient, ep: dict[str, Any]
) -> dict[str, Any]:
    resp = await client.post(
        f"{BASE}/v1/pipelines/episode",
        headers=HEADERS,
        json={
            "episode_id": ep["id"],
            "work_id": WORK_ID,
            "writer_id": WRITER_ID,
            "content": ep["content"],
        },
        timeout=30.0,
    )
    resp.raise_for_status()
    return resp.json()


async def run_embedding_phase() -> dict[str, Any]:
    eps = fetch_unique_episodes()
    print(f"[embed] unique episodes: {len(eps)}", flush=True)
    before = chunk_count()
    print(f"[embed] chunks before: {before}", flush=True)

    async with httpx.AsyncClient() as client:
        tasks = []
        for ep in eps:
            t = await trigger_pipeline(client, ep)
            tasks.append({"episode_id": ep["id"], "sort_order": ep["sort_order"], "task_id": t.get("task_id")})
            print(f"  queued sort={ep['sort_order']} task={t.get('task_id')}", flush=True)

    deadline = time.time() + 900
    last = before
    target_delta = len(eps)
    while time.time() < deadline:
        time.sleep(10)
        now = chunk_count()
        if now != last:
            print(f"[embed] chunks: {now}", flush=True)
            last = now
        if now - before >= target_delta:
            break

    total_after = chunk_count()
    per_work = psql(
        f"SELECT count(*) FROM episode_chunk WHERE work_id = '{WORK_ID}';"
    ).strip()
    return {
        "episodes_sent": len(eps),
        "chunks_before": before,
        "chunks_after": total_after,
        "per_work": int(per_work or "0"),
        "tasks": tasks,
    }


async def call_draft(model: str) -> dict[str, Any]:
    payload = {
        "work_id": WORK_ID,
        "writer_id": WRITER_ID,
        "episode_id": "00000000-0000-0000-0000-000000000000",
        "storyline": STORYLINE,
        "current_episode_num": CURRENT_EPISODE_NUM,
        "model": model,
    }
    full_text_parts: list[str] = []
    usage: dict[str, Any] = {}
    async with httpx.AsyncClient(timeout=600.0) as client:
        async with client.stream(
            "POST", f"{BASE}/v1/drafts",
            headers=HEADERS, json=payload,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue
                payload_json = line[6:]
                try:
                    evt = json.loads(payload_json)
                except json.JSONDecodeError:
                    continue
                if evt.get("type") == "chunk":
                    full_text_parts.append(evt.get("content", ""))
                elif evt.get("type") == "done":
                    usage = evt.get("usage", {})
    body = "".join(full_text_parts)
    return {"model_requested": model, "text": body, "length": len(body), "usage": usage}


async def call_review(content: str) -> dict[str, Any]:
    payload = {
        "work_id": WORK_ID,
        "writer_id": WRITER_ID,
        "episode_id": "00000000-0000-0000-0000-000000000000",
        "content": content,
        "episode_number": CURRENT_EPISODE_NUM,
    }
    async with httpx.AsyncClient(timeout=600.0) as client:
        resp = await client.post(
            f"{BASE}/v1/reviews", headers=HEADERS, json=payload,
        )
        resp.raise_for_status()
        return resp.json()


def token_stats_for_rag() -> dict[str, Any]:
    """RAG 컨텍스트 섹션별 토큰 추정을 위한 원시 길이 수집."""
    # recent_raw (4화): 에피소드 원문 상위 4개
    out = psql(
        "SELECT sort_order, length(content) FROM ("
        f"  SELECT DISTINCT ON (sort_order) sort_order, content, created_at "
        f"  FROM episode WHERE work_id = '{WORK_ID}' "
        f"  ORDER BY sort_order, created_at"
        ") sub ORDER BY sort_order DESC LIMIT 4;"
    )
    recent_raw = [line.split("\t") for line in out.strip().split("\n") if line]
    return {"recent_raw_char_lengths": recent_raw}


async def main() -> int:
    results: dict[str, Any] = {"started_at": time.time()}

    print("=== PHASE 1: embedding ===", flush=True)
    existing = chunk_count()
    if existing >= 10 and os.environ.get("SKIP_EMBED") == "1":
        print(f"[embed] skipping - {existing} chunks already exist", flush=True)
        results["embedding"] = {"skipped": True, "existing_chunks": existing}
    else:
        results["embedding"] = await run_embedding_phase()

    print("=== PHASE 2: draft sonnet ===", flush=True)
    results["draft_sonnet"] = await call_draft("sonnet")

    print("=== PHASE 3: draft opus ===", flush=True)
    results["draft_opus"] = await call_draft("opus")

    print("=== PHASE 4: review (opus draft) ===", flush=True)
    results["review"] = await call_review(results["draft_opus"]["text"])

    print("=== PHASE 5: raw stats ===", flush=True)
    results["rag_raw_stats"] = token_stats_for_rag()

    results["finished_at"] = time.time()
    out = OUT_DIR / "cost_raw_dummy_work_2.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[done] wrote {out}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
