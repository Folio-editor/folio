-- ============================================================
-- Migration: work.server_encrypted_dek 추가 (Vault Transit envelope encryption)
-- Date: 2026-05-05
-- Owner: curious-wiggling-thacker plan V-3
-- ============================================================
--
-- 배경:
--   Plan C 옵션 1 → Vault Transit 전환. 작품 생성 시 클라이언트가 raw work_key 를
--   한 번 TLS 로 서버에 전송 → VaultKmsService.encrypt() → 결과를 이 컬럼에 저장.
--   서버는 AI 인덱싱·검수 시 이 컬럼 → Vault decrypt → work_key 평문 메모리 획득.
--
-- NULL 허용 이유:
--   오프라인에서 신규 작품 생성 시 server_encrypted_dek 발급 불가 →
--   온라인 복귀 시 클라이언트가 raw work_key 재전송하여 발급. 그 동안엔 NULL.
--   AI 인덱싱은 이 컬럼이 NOT NULL 인 작품만 트리거.
--
-- 알파 단계 정책:
--   기존 작품 데이터는 wipe (server_encrypted_dek 백필 불가능 — 서버는 KEK·work_key 모름).
--   PowerSync replication slot 도 함께 리셋해야 신규 sync 시작.
-- ============================================================

BEGIN;

-- 1) 컬럼 추가 (NULL 허용 — 오프라인 신규 작품 케이스)
ALTER TABLE work
  ADD COLUMN IF NOT EXISTS server_encrypted_dek BYTEA;

COMMENT ON COLUMN work.server_encrypted_dek IS
  'Vault Transit 으로 wrap 된 work_key. 작품 생성 시 발급. NULL 이면 AI 기능 불가.';

-- 2) 알파 데이터 wipe (운영 적용 시 사용자 사전 공지 필수)
-- 주석 처리: 운영자가 의도적으로 활성화하여 실행
--
-- TRUNCATE TABLE
--   work, episode, character, character_note, character_custom_field,
--   world_note, plot, plan_note, foreshadow, foreshadow_link,
--   idea_archive, episode_chunk
-- CASCADE;

-- 3) PowerSync replication slot 리셋
-- 주석 처리: 별도 운영 명령으로 실행 (psql 외부에서)
--   docker exec storyzip-postgresql-dev psql -U <user> -d <db> -c \
--     "SELECT pg_drop_replication_slot('powersync');"
-- 이후 PowerSync 컨테이너 재기동 시 slot 자동 재생성.

COMMIT;
