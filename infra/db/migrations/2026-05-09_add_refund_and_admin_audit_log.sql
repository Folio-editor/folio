-- ============================================================
-- Migration: 환불 + 관리자 감사 로그 테이블 신설
-- Date: 2026-05-09
-- Owner: 결제 시스템 PortOne 환불 기능 (약관 제5조)
-- ============================================================
--
-- 신설 테이블 2개:
--   1. refund            : 환불 신청 1건 = 1 row. 운영자 승인/거절 후 PortOne 취소 호출.
--   2. admin_audit_log   : 관리자 API 호출 전수 감사 (IP / UA / action / result).
--
-- prod 환경은 spring.jpa.hibernate.ddl-auto=validate 라 본 SQL 적용 없이는 부팅 실패.
-- dev 환경은 ddl-auto=update 라 부팅 시 자동 생성되지만 prod 호환 위해 마이그레이션 명시.
--
-- 참고: backend/src/main/java/com/storyzip/payment/domain/Refund.java
--       backend/src/main/java/com/storyzip/admin/domain/AdminAuditLog.java
-- ============================================================

BEGIN;

-- ─────── 1. refund ───────
CREATE TABLE IF NOT EXISTS refund (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id      UUID NOT NULL REFERENCES payment(id) ON DELETE RESTRICT,
    status          VARCHAR(20) NOT NULL,           -- REQUESTED / APPROVED / REJECTED / CANCELED
    reason          VARCHAR(30) NOT NULL,           -- 약관 RefundReason enum
    detail          VARCHAR(500),                   -- 사용자 자유 입력
    refund_type     VARCHAR(20) NOT NULL,           -- RefundType enum (FULL / PARTIAL / COMPENSATION 등)
    refund_amount   INTEGER NOT NULL,               -- 신청 시점 계산된 환불액 (원)
    token_deducted  INTEGER NOT NULL,               -- 회수 토큰 양 (회사 귀책 시 보상 양)
    requested_at    TIMESTAMP NOT NULL,             -- 사용자 신청 시각 (UTC)
    processed_at    TIMESTAMP,                      -- 운영자 승인/거절 시각 (REQUESTED 동안 NULL)
    admin_note      VARCHAR(500),                   -- 운영자 메모 / 거절 사유
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_payment_id   ON refund(payment_id);
CREATE INDEX IF NOT EXISTS idx_refund_status       ON refund(status);
CREATE INDEX IF NOT EXISTS idx_refund_requested_at ON refund(requested_at);

-- updated_at 자동 갱신 트리거 (다른 테이블과 동일 패턴)
DROP TRIGGER IF EXISTS trg_refund_updated_at ON refund;
CREATE TRIGGER trg_refund_updated_at
    BEFORE UPDATE ON refund
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────── 2. admin_audit_log ───────
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action          VARCHAR(50) NOT NULL,           -- REFUND_LIST / REFUND_APPROVE / REFUND_REJECT 등
    result          VARCHAR(20) NOT NULL,           -- SUCCESS / DENIED / ERROR
    resource_type   VARCHAR(30),                    -- refund / payment / writer (NULL 허용 — 목록 조회)
    resource_id     UUID,                           -- 대상 리소스 (NULL 허용)
    admin_note      VARCHAR(500),
    request_ip      VARCHAR(45),                    -- IPv6 길이 수용
    user_agent      VARCHAR(500),
    request_path    VARCHAR(200),                   -- HTTP method + path
    error_message   VARCHAR(500),                   -- result=ERROR/DENIED 시
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_action      ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_resource    ON admin_audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at  ON admin_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_request_ip  ON admin_audit_log(request_ip);

COMMIT;

-- 검증:
--   SELECT to_regclass('public.refund'), to_regclass('public.admin_audit_log');
--   → 둘 다 존재해야 함 (NULL 아님).
--   SELECT count(*) FROM pg_indexes
--     WHERE tablename IN ('refund','admin_audit_log');
--   → 7 (refund 3 + admin_audit_log 4)
