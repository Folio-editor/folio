-- ============================================================
-- Migration: plan.{slogan,genres,moods,target_audience} 정리
-- Date: 2026-05-04
-- Owner: ERD 정리 작업 (사용자 요청)
-- ============================================================
--
-- 목적:
--   1) work 테이블에 genres·moods 컬럼 추가 (JSONB 배열)
--   2) plan 의 genres·moods 데이터를 work 로 이전 (work_id 기준 1:1)
--   3) plan 에서 slogan, genres, moods, target_audience 4개 컬럼 제거
--      (slogan, target_audience 는 사용처 없어 폐기. 데이터 손실 의도됨)
--
-- 사전 작업 (필수):
--   $ pg_dump -h <host> -U <user> -t plan -t work <db> > backup_plan_work_2026-05-04.sql
--
-- 운영 적용 시점:
--   트래픽 적은 시간대 (ALTER TABLE 은 ACCESS EXCLUSIVE LOCK 을 잡으므로
--   해당 테이블 R/W 가 수 초간 대기). 대형 작품 데이터셋이면 수 분 소요 가능.
--
-- 적용 후 필수 후속 조치:
--   1) PowerSync 재기동: docker compose restart powersync
--      (sync-rules.yaml 의 work SELECT 절에 genres, moods 명시되어 있어야 함)
--   2) Backend 재배포 (Work.java/Plan.java 변경 반영)
--   3) Frontend 재배포 (schema.ts + SCHEMA_VERSION bump 포함)
--
-- 롤백:
--   slogan/target_audience 의 평문 값은 영구 손실. genres/moods 만 백업에서 복원 가능.
--   백업 파일을 즉시 보존할 것.
-- ============================================================

BEGIN;

-- 1. work 테이블에 컬럼 추가 (DEFAULT '[]'::jsonb 로 NULL 회피)
ALTER TABLE work
  ADD COLUMN genres JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN moods  JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. plan → work 데이터 이전 (work_id 1:1 관계 가정)
UPDATE work w
SET genres = COALESCE(p.genres, '[]'::jsonb),
    moods  = COALESCE(p.moods,  '[]'::jsonb)
FROM plan p
WHERE p.work_id = w.id;

-- 3. 검증 — plan 에 의미있는 데이터가 있던 행이 모두 work 로 이전됐는지
--    예상: 0 행 (이전 누락 0)
DO $$
DECLARE
  missing_count INT;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM plan p
  JOIN work w ON w.id = p.work_id
  WHERE (p.genres IS NOT NULL AND p.genres::text != '[]' AND w.genres != p.genres)
     OR (p.moods  IS NOT NULL AND p.moods::text  != '[]' AND w.moods  != p.moods);
  IF missing_count > 0 THEN
    RAISE EXCEPTION '데이터 이전 검증 실패: % 개 행에서 genres/moods 미일치', missing_count;
  END IF;
END $$;

-- 4. plan 에서 4개 컬럼 제거 (slogan, target_audience 는 데이터 손실 의도)
ALTER TABLE plan
  DROP COLUMN IF EXISTS slogan,
  DROP COLUMN IF EXISTS genres,
  DROP COLUMN IF EXISTS moods,
  DROP COLUMN IF EXISTS target_audience;

-- 5. work 의 genres/moods 컬럼 검증 — 정상 SELECT 가능한지 (sanity)
SELECT id, genres, moods
FROM work
LIMIT 1;

COMMIT;

-- ============================================================
-- 롤백 SQL (필요 시 별도 실행)
-- ============================================================
-- BEGIN;
-- ALTER TABLE work DROP COLUMN IF EXISTS genres, DROP COLUMN IF EXISTS moods;
-- ALTER TABLE plan
--   ADD COLUMN slogan TEXT,
--   ADD COLUMN genres JSONB,
--   ADD COLUMN moods JSONB,
--   ADD COLUMN target_audience VARCHAR(200);
-- -- 백업에서 plan 데이터 복원: psql < backup_plan_work_2026-05-04.sql
-- COMMIT;
