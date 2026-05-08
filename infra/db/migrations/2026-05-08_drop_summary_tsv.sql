-- ============================================================
-- Migration: Phase 4.6 — episode_summary.summary_tsv 드롭
-- Date: 2026-05-08
-- Owner: Phase 4.6 (자유형 텍스트 암호화 후속)
-- ============================================================
--
-- 배경:
--   `oneline_summary` / `summary` 가 v1: AES-GCM ciphertext 로 적재되면서
--   GENERATED ALWAYS 인 `summary_tsv` (tsvector) 가 무의미한 base64 부스러기
--   토큰만 인덱싱하게 됨. GIN 인덱스 hit 해도 검색 결과 0 (false negative).
--
--   대안 채택:
--     - search_episode_summaries 가 Option A (평문 일괄 복호화 + Python substring) 로 동작
--     - summary_tsv 컬럼은 검색에서 사용 X → 디스크/INSERT 토큰화 비용만 발생
--
-- 변경:
--   1) idx_episode_summary_tsv 드롭 (CASCADE 로 자동 처리되지만 명시)
--   2) summary_tsv GENERATED 컬럼 드롭
--
-- 무데이터 손실: GENERATED 컬럼이라 source 컬럼 (oneline_summary/summary/keywords) 보존됨.
-- 롤백 시: schema.sql 의 GENERATED 정의 다시 추가하면 자동 재계산.
-- ============================================================

DROP INDEX IF EXISTS idx_episode_summary_tsv;

ALTER TABLE episode_summary
    DROP COLUMN IF EXISTS summary_tsv;
