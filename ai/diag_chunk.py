"""실패한 에피소드 1건에 대해 chunk_and_embed 파이프라인을 직접 실행.

run:  cd ai && doppler run -- .venv/Scripts/python diag_chunk.py <episode_id>
"""
from __future__ import annotations
import asyncio, sys, json
from app.tasks.chunk_and_embed import _run
from app.services.work_key_resolver import resolve_episode_plaintext
from app.services.text_extractor import extract_plain_text
from app.services.chunker import chunk_text, count_tokens

EPISODE_ID = sys.argv[1] if len(sys.argv) > 1 else "83e69560-b646-43af-9a74-931808de747e"
WORK_ID    = sys.argv[2] if len(sys.argv) > 2 else "803525ae-e27e-4220-bbe6-0f1d78fe57ea"
WRITER_ID  = sys.argv[3] if len(sys.argv) > 3 else "00000000-0000-0000-0000-000000000000"


async def main() -> None:
    print(f"[diag] episode={EPISODE_ID} work={WORK_ID}")
    # 1) 평문 fetch
    try:
        plaintext = await resolve_episode_plaintext(EPISODE_ID, WORK_ID)
        print(f"[diag] plaintext_len={len(plaintext)}")
        head = plaintext[:120].replace("\n", " ")
        print(f"[diag] plaintext_head={head!r}")
        # JSON 파싱 시도
        try:
            doc = json.loads(plaintext)
            print(f"[diag] looks_like_tiptap={isinstance(doc, dict) and doc.get('type') == 'doc'}")
            if isinstance(doc, dict):
                blocks = doc.get("content", []) or []
                print(f"[diag] block_count={len(blocks)}")
        except Exception as e:
            print(f"[diag] json_parse_failed={e}")

        # 2) plain text 추출
        plain = extract_plain_text(plaintext)
        print(f"[diag] plain_after_extract_len={len(plain)}")
        plain_head = plain[:120].replace("\n", " ")
        print(f"[diag] plain_head={plain_head!r}")

        # 3) chunking
        chunks = chunk_text(plain)
        print(f"[diag] chunk_count={len(chunks)}")
        if chunks:
            print(f"[diag] first_chunk_tokens={count_tokens(chunks[0])} len={len(chunks[0])}")

    except Exception as e:
        print(f"[diag] resolve_failed type={type(e).__name__} msg={e}")
        return

    # 4) full pipeline (실제로 DB 적재까지 — writer_id 필요)
    if WRITER_ID == "00000000-0000-0000-0000-000000000000":
        print("[diag] skip full pipeline — writer_id missing; pass as 3rd arg to run end-to-end")
        return
    print("[diag] running full _run() ...")
    n = await _run(EPISODE_ID, WORK_ID, WRITER_ID, None)
    print(f"[diag] _run returned chunk_count={n}")


if __name__ == "__main__":
    asyncio.run(main())
