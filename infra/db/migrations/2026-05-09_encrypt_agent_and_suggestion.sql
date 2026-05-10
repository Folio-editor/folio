-- ============================================================
-- 2026-05-09: agent_session + extraction_suggestion 의 민감 텍스트 컬럼 암호화 전환
-- ============================================================
-- 배경:
--   - agent_session.messages JSONB 안에 episode 본문 평문 (tool_result) 가 박혀있음
--     → episode.content 의 work_key 암호화 backdoor.
--   - extraction_suggestion.payload 도 작가 승인 전 신규 인물·세계관·회차 본문이
--     평문으로 대기 → 작품 외부 노출 위험.
--
-- 정책:
--   - 모든 자유형 텍스트는 AES-GCM (work_key) 로 암호화 → 'v1:' 접두사 ASCII string.
--   - JSONB 컬럼 안 텍스트는 deep-walk 하여 string leaf 만 'v1:' 로 교체 (구조 키 보존).
--   - title / suggested_name / reviewer_note 도 같은 정책.
--
-- 컬럼 스키마 변경:
--   1. agent_session.title      VARCHAR(200) → TEXT  (v1: ciphertext 길이 초과)
--   2. agent_session.summary_so_far : 이미 TEXT — 변경 없음
--   3. agent_session.messages : JSONB 유지 (deep-walk 로 안의 string 만 교체)
--   4. extraction_suggestion.suggested_name VARCHAR(200) → TEXT
--   5. extraction_suggestion.reviewer_note : 이미 TEXT
--   6. extraction_suggestion.payload : JSONB 유지 (deep-walk)
--
-- 실 데이터 마이그레이션 (기존 평문 → ciphertext) 은 별도 어플리케이션 스크립트
-- (ai/scripts/migrate_encrypt_agent_suggestion.py) 가 work_key 보유 환경에서 1회 일괄 실행.
-- 알파 단계라 적은 양 — 본 SQL 은 컬럼 스키마만 손본다.
-- ============================================================

ALTER TABLE agent_session
    ALTER COLUMN title TYPE TEXT;

ALTER TABLE extraction_suggestion
    ALTER COLUMN suggested_name TYPE TEXT;

-- 검증:
--   SELECT column_name, data_type, character_maximum_length
--   FROM information_schema.columns
--   WHERE table_name IN ('agent_session','extraction_suggestion')
--     AND column_name IN ('title','suggested_name');
--   → 두 컬럼 모두 data_type='text' (VARCHAR 가 아닌) 이어야 함.
