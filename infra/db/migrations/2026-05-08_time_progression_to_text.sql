-- ============================================================
-- Migration: episode_summary.time_progression VARCHAR(50) → TEXT
-- Date: 2026-05-08
-- Owner: Phase 4.6 (자유형 텍스트 암호화 후속)
-- ============================================================
--
-- 배경:
--   episode_summary.time_progression 이 평문 시점엔 짧은 메타 ("한 시간", "노을 무렵 30분") 라
--   VARCHAR(50) 로 충분했음. Phase 4.6 에서 자유형 서사 텍스트 일괄 암호화 대상에 포함되며
--   "v1:" + Base64(IV12 + ciphertext + TAG16) 포맷이 50자를 항상 초과 (평문 1자도 ~33자).
--
--   증상: summarize_episode UPSERT 시
--     asyncpg.exceptions.StringDataRightTruncation
--     "(sqlalchemy.dialects.postgresql.asyncpg.Error) value too long for type character varying(50)"
--
-- 해결:
--   TEXT 로 변경 — 다른 자유형 텍스트 (oneline_summary / summary / cliffhanger) 와 동일.
--   기존 평문 데이터는 자동 호환 (TEXT 가 모든 VARCHAR 값 수용).
-- ============================================================

ALTER TABLE episode_summary
    ALTER COLUMN time_progression TYPE TEXT;
