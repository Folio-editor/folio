-- ============================================================
-- Migration: Phase 4.6 — episode_chunk 에 content_hash 추가
-- Date: 2026-05-08
-- Owner: Phase 4.6 (chunk content 암호화 후속)
-- ============================================================
--
-- 배경:
--   chunk content 가 ciphertext 적재되면서 pipelines.py 의 idempotency 체크
--   (existing_chunks 의 hash vs request_signature 비교) 가 항상 mismatch.
--   같은 본문 재동기화 시마다 OpenAI 임베딩 + encrypt round-trip 비용 발생.
--
-- 변경:
--   episode_chunk 에 content_hash CHAR(64) 추가 — 평문 본문 SHA256 (1 episode = 1 hash).
--   chunk_and_embed_task 가 INSERT 시 동일 episode 의 모든 chunk 행에 같은 hash 적재.
--   pipelines.py 가 EXISTS 체크로 1 query µs 단위 skip 결정.
--
-- 인덱스: (episode_id, content_hash) 복합 — skip-check fast path
-- ============================================================

ALTER TABLE episode_chunk
    ADD COLUMN IF NOT EXISTS content_hash CHAR(64);

CREATE INDEX IF NOT EXISTS idx_episode_chunk_episode_hash
    ON episode_chunk(episode_id, content_hash);
