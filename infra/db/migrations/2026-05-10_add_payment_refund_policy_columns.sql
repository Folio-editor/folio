-- ============================================================
-- Migration: payment 테이블에 refund_policy_version / refund_policy_agreed_at 추가
-- Date: 2026-05-10
-- Owner: 결제 시스템 — 환불 약관 동의 추적 (전자상거래법 거래 기록 5년 보관)
-- ============================================================
--
-- 배경:
--   Payment.java 엔티티가 두 컬럼을 NOT NULL 로 선언 (refund_policy_version VARCHAR(20),
--   refund_policy_agreed_at TIMESTAMP) — 결제 화면에서 약관 동의 체크 후 결제 생성 시 채워진다.
--   dev 환경(ddl-auto=update)은 부팅 시 자동 컬럼 추가로 우연히 동작했지만, prod
--   (ddl-auto=validate)에서 본 SQL 적용 없이 부팅하면 SchemaManagementException 으로 실패.
--   장기간 schema.sql / migrations 누락 상태였던 것을 2026-05-10 schema 점검에서 발견·정리.
--
-- 멱등 보장: ADD COLUMN IF NOT EXISTS — 이미 dev에 자동 생성된 환경도 안전하게 재실행 가능.
--
-- backfill 정책:
--   기존 row 존재 시 NOT NULL 강제 적용 위해 default 값 임시 부여 후 NOT NULL 적용.
--     refund_policy_version  := 'v1' (현재 시행 중인 버전, RefundPolicy 약관 §1)
--     refund_policy_agreed_at := payment.created_at (결제 생성 시점 = 동의 시점)
--   적용 직후 NOT NULL 제약 강화. 신규 INSERT 는 항상 명시 값 (default 의존 X).
--
-- 참고: backend/src/main/java/com/storyzip/payment/domain/Payment.java:69-74
--       backend/src/main/java/com/storyzip/payment/dto/CreatePaymentRequest.java
--       docs/policies/refund-policy.md
-- ============================================================

BEGIN;

-- 1) 컬럼 추가 (NULL 허용 상태로 먼저 생성 — backfill 안전성)
ALTER TABLE payment
    ADD COLUMN IF NOT EXISTS refund_policy_version VARCHAR(20),
    ADD COLUMN IF NOT EXISTS refund_policy_agreed_at TIMESTAMP;

-- 2) 기존 row backfill — version='v1', agreed_at=created_at
UPDATE payment
   SET refund_policy_version = 'v1'
 WHERE refund_policy_version IS NULL;

UPDATE payment
   SET refund_policy_agreed_at = created_at
 WHERE refund_policy_agreed_at IS NULL;

-- 3) NOT NULL 제약 강화 (Payment.java 와 정합)
ALTER TABLE payment
    ALTER COLUMN refund_policy_version SET NOT NULL,
    ALTER COLUMN refund_policy_agreed_at SET NOT NULL;

COMMIT;

-- 검증:
--   SELECT column_name, is_nullable, data_type, character_maximum_length
--     FROM information_schema.columns
--    WHERE table_name='payment'
--      AND column_name IN ('refund_policy_version','refund_policy_agreed_at')
--    ORDER BY column_name;
--   → 두 행: is_nullable='NO', version=character varying(20), agreed_at=timestamp without time zone
