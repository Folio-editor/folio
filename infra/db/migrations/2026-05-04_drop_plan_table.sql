-- ============================================================
-- Migration: plan 테이블 완전 폐기 (ERD 정리 2단계)
-- Date: 2026-05-04
-- Owner: ERD 정리 2단계 (사용자 요청)
-- 선행: 2026-05-04_plan_to_work_genres_moods.sql 적용 완료 후 실행할 것
-- ============================================================
--
-- 배경:
--   1단계(plan_to_work_genres_moods.sql)로 plan 의 모든 메타 컬럼이
--   work 로 이전·폐기되어 plan 테이블이 빈 껍데기가 됨.
--   plan_note 는 work_id 를 직접 FK 로 가지므로 plan 행 자체가 불필요.
--
-- 영향:
--   - DROP TABLE plan
--   - PowerSync publication 에서 plan 제거
--   - GRANT 정리는 자동 (테이블이 사라지면 GRANT 도 무효)
--
-- 사전 작업 (필수):
--   $ pg_dump -h <host> -U <user> -t plan <db> > backup_plan_2026-05-04_step2.sql
--   (1단계 백업과 별도. plan 행에는 의미있는 컬럼이 없지만 감사·복구 용도)
--
-- 운영 적용 시점:
--   1단계 적용 후 충분한 모니터링 기간(예: 1주) 경과 + 신규 Backend·Frontend
--   배포 완료 후 실행. 기존 코드가 plan 을 참조하지 않는 것을 먼저 확인.
--
-- 적용 후 필수 후속 조치:
--   1) PowerSync 재기동: docker compose restart powersync
--   2) Backend 재배포 (Plan.java/PlanRepository 삭제 + processPlan 제거 반영)
--   3) Frontend 재배포 (schema.ts 의 plan 제거 + SCHEMA_VERSION='v3_drop_plan_table')
--      → 기존 사용자 SQLite 자동 disconnectAndClear
--
-- 롤백:
--   plan 행에는 이미 의미있는 데이터 없음. 백업으로 테이블 복원은 가능하지만
--   대응 코드(Plan.java 등) 도 함께 복원 필요. 실질적 롤백 비용이 매우 큼.
--   따라서 1단계 + 신규 코드 충분히 안정화 후에만 본 마이그레이션 실행 권장.
-- ============================================================

BEGIN;

-- 1. PowerSync publication 에서 plan 제거 (publication 이 존재하는 경우만)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'plan'
  ) THEN
    ALTER PUBLICATION powersync DROP TABLE plan;
  END IF;
END $$;

-- 2. 검증 — plan 을 참조하는 외래키가 정말 없는지 확인
DO $$
DECLARE
  fk_count INT;
BEGIN
  SELECT COUNT(*) INTO fk_count
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'plan'
    AND tc.table_name != 'plan';
  IF fk_count > 0 THEN
    RAISE EXCEPTION 'plan 테이블을 참조하는 외래키가 % 개 남아있음. 먼저 제거하세요.', fk_count;
  END IF;
END $$;

-- 3. plan 테이블 DROP
DROP TABLE IF EXISTS plan;

-- 4. sanity — plan 테이블이 정말 사라졌는지
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'plan'
  ) THEN
    RAISE EXCEPTION 'plan 테이블 DROP 실패';
  END IF;
END $$;

COMMIT;

-- ============================================================
-- 롤백 SQL (필요 시 별도 실행)
-- ============================================================
-- BEGIN;
-- CREATE TABLE plan (
--     id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     work_id         UUID NOT NULL UNIQUE REFERENCES work(id) ON DELETE CASCADE,
--     writer_id       UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
--     created_at      TIMESTAMP NOT NULL DEFAULT now(),
--     updated_at      TIMESTAMP NOT NULL DEFAULT now()
-- );
-- GRANT SELECT ON plan TO folio_repl;
-- ALTER PUBLICATION powersync ADD TABLE plan;
-- -- 백업에서 plan 데이터 복원: psql < backup_plan_2026-05-04_step2.sql
-- -- + Backend Plan.java, PlanRepository, processPlan 복원
-- -- + Frontend schema.ts, entities.ts, ensurePlan 등 복원
-- -- + AI MCP plan.py, registry.py get_plan 복원
-- COMMIT;
