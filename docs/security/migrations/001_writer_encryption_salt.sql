-- Plan C 결정 14 — writer.encryption_salt 컬럼 추가
--
-- 적용 대상: prod (ddl-auto=validate)
-- 선행 조건: PepperProvider 배포 + Secrets Manager `folio/encryption/pepper` 시크릿 존재
-- 적용 방법: 운영자가 psql로 직접 실행 (자동 마이그레이션 도구 미사용)
--
-- 후처리:
--   - 기존 사용자(레거시)는 encryption_salt가 NULL인 채로 시작.
--   - 다음 로그인 시 AuthService가 32B 랜덤을 생성하여 백필.
--   - 따라서 컬럼은 NULL 허용 (NOT NULL은 백필 완료 후 별도 PR로 강제).

BEGIN;

ALTER TABLE writer
    ADD COLUMN IF NOT EXISTS encryption_salt BYTEA;

-- 검증: 컬럼이 추가되었고 NULL인 row 수 = 기존 row 수
SELECT
    COUNT(*) AS total_writers,
    COUNT(encryption_salt) AS with_salt,
    COUNT(*) FILTER (WHERE encryption_salt IS NULL) AS missing_salt
FROM writer;

COMMIT;
