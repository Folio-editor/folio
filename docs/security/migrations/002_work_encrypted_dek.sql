-- Plan C 결정 21 — work.encrypted_dek 컬럼 추가
--
-- 적용 대상: prod (ddl-auto=validate)
-- 선행 조건: 001_writer_encryption_salt.sql 적용 + PepperProvider 활성화
-- 적용 방법: 운영자가 psql로 직접 실행
--
-- 의미:
--   - work_key (32B AES-GCM DEK)를 KEK으로 wrap한 결과를 저장하는 컬럼.
--   - 형식: IV(12B) || ciphertext(32B) || tag(16B) = 60B 원본을 BYTEA로 보관.
--   - 클라이언트는 PowerSync 동기화 제약상 Base64 문자열로 전송한다 (SyncService.applyBytea가 디코드).
--
-- 후처리:
--   - 기존 work(레거시) + 게스트 모드로 만든 work는 encrypted_dek가 NULL.
--   - 클라이언트는 NULL인 work에 대해서는 본문도 평문으로 가정한다 (prefix `v1:` 없음).
--   - 로그인 사용자가 그 work에서 새 episode를 작성하는 시점에 lazy로 work_key 생성 + wrap.

BEGIN;

ALTER TABLE work
    ADD COLUMN IF NOT EXISTS encrypted_dek BYTEA;

-- 검증: 컬럼이 추가되었고 NULL인 row 수 = 기존 work 수
SELECT
    COUNT(*) AS total_works,
    COUNT(encrypted_dek) AS with_dek,
    COUNT(*) FILTER (WHERE encrypted_dek IS NULL) AS missing_dek
FROM work;

COMMIT;
