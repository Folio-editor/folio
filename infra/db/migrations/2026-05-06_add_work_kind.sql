-- ============================================================
-- Migration: work.kind VARCHAR(20) 추가
-- Date: 2026-05-06
-- Owner: 온보딩 가이드 식별자 도입 (ONBOARDING_MARKER + title 매칭 의존성 제거)
-- ============================================================
--
-- 배경:
--   기존: AuthenticatedApp / AboutSettings 가 work.title = '[가이드] 초록지붕 집의 앤'
--         + description 의 [folio_onboarding_v1] 마커 매칭으로 가이드 작품 식별.
--   문제: title/description 이 KEK 으로 ciphertext 저장되어 평문 매칭 영구 실패.
--   해결: work.kind 평문 컬럼 추가. 가이드 작품 = kind='onboarding'.
--
-- 영향:
--   - 신규 작품 생성: kind 컬럼 NULL 허용 → 기존 createWork 흐름 영향 0
--   - 가이드 작품 생성: useOnboardingSeed 가 kind='onboarding' 명시
--   - 기존 사용자 데이터: 기존 가이드 작품은 kind=NULL 상태 → '재시작' 선택 시 새 가이드 1회 생성
--     (필요 시 backfill UPDATE 로 기존 가이드 식별 시도 가능, 본 알파 단계엔 생략)
-- ============================================================

BEGIN;

ALTER TABLE work
  ADD COLUMN IF NOT EXISTS kind VARCHAR(20);

COMMENT ON COLUMN work.kind IS
  '작품 종류 식별 (NULL=일반, ''onboarding''=신규 사용자 가이드). 평문 컬럼.';

-- 옵션: 기존 가이드 작품을 kind='onboarding' 으로 backfill (title 평문일 때만 가능, 알파 wipe 정책으로 생략)
-- UPDATE work SET kind = 'onboarding'
--   WHERE title = '[가이드] 초록지붕 집의 앤' AND kind IS NULL;

COMMIT;

-- ============================================================
-- 운영 적용 후 절차
-- ============================================================
-- 1. PowerSync 재기동 (sync-rules.yaml 의 SELECT 가 kind 컬럼 포함하도록 변경됨)
--    docker compose restart powersync
-- 2. Backend 재기동 (JPA Entity Work.kind 필드 추가)
-- 3. Frontend SCHEMA_VERSION='v5_work_kind' 로 bump 됨 → 클라이언트 부팅 시 자동 disconnectAndClear
