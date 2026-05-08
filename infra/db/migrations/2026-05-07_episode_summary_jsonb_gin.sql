-- ============================================================
-- Migration: episode_summary JSONB GIN 인덱스 3개 추가
-- Date: 2026-05-07
-- Owner: Phase 3 R-I — 운영 검색 성능 (300화+ 시 수십 배 가속)
-- ============================================================
--
-- 배경:
--   MCP search_episode_summaries(scope='character:앤') 같은 JSONB containment
--   쿼리가 인덱스 부재로 시퀀셜 스캔. 알파엔 무영향, 1,000편 동시 운영 (=
--   episode_summary 30만 행) 진입 시 응답 시간 누적 악화.
--
--   지금 추가하면 테이블이 비어있거나 작아 LOCK 부담 0. 운영 시 후행 추가는
--   `CREATE INDEX CONCURRENTLY` 필요 + 락·재빌드 부담 큼.
--
-- 영향:
--   - INSERT/UPDATE: GIN 갱신 비용 ~수ms (사용자 영향 0)
--   - 디스크: 컬럼 크기 0.5~1.5배 추가 (300화 ≈ 2MB / 30만 행 ≈ 2GB)
--   - SELECT: present_characters @> '["앤"]' 같은 쿼리 50~수백 배 가속
--
-- B-6 가드: 동일 변경을 infra/db/schema.sql 의 episode_summary 인덱스 블록에도
-- 동시 반영 (신규 컨테이너 첫 부팅 schema.sql 적용 시 이 인덱스도 생성됨).
-- ============================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_episode_summary_present_chars
    ON episode_summary USING GIN (present_characters);

CREATE INDEX IF NOT EXISTS idx_episode_summary_keywords
    ON episode_summary USING GIN (keywords);

CREATE INDEX IF NOT EXISTS idx_episode_summary_present_locs
    ON episode_summary USING GIN (present_locations);

COMMIT;

-- ============================================================
-- 운영 적용 후 검증
-- ============================================================
-- 1. 인덱스 등록 확인:
--    SELECT indexname FROM pg_indexes
--      WHERE tablename = 'episode_summary'
--      AND indexname LIKE 'idx_episode_summary_%';
--
-- 2. 쿼리 플랜 확인 (시퀀셜 스캔 → bitmap heap scan 으로 변경되는지):
--    EXPLAIN ANALYZE
--    SELECT * FROM episode_summary
--    WHERE work_id = '<some-uuid>'
--      AND present_characters @> '["앤"]'::jsonb;
--    -- 기대: "Bitmap Index Scan on idx_episode_summary_present_chars"
