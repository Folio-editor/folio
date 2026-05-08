-- ============================================================
-- Migration: Phase 4 — Agent 서비스 + 토큰 영수증
-- Date: 2026-05-08
-- Owner: Phase 4 (curious-wiggling-thacker.md §B,C,L)
-- ============================================================
--
-- 변경 요약:
--   1) extraction_suggestion 확대
--      - entity_type CHECK 에 character_update / plot_revision / episode_draft 추가
--      - source_agent / source_thread_id / reviewer_note 컬럼 추가
--      - UNIQUE (work_id, entity_type, suggested_name) 제거 (agent 재제안 허용)
--   2) agent_session 신규 — Sonnet thread + 메시지 압축 보관
--   3) token_receipt + token_receipt_line 신규 — 호출 단위 영수증 (line items)
--   4) 인덱스 5개 추가
--
-- B-6 가드: schema.sql 도 동일하게 갱신 (신규 컨테이너 부팅 시 적용).
-- ============================================================

BEGIN;

-- ─────── 1. extraction_suggestion 확대 ───────

ALTER TABLE extraction_suggestion DROP CONSTRAINT IF EXISTS extraction_suggestion_entity_type_check;
ALTER TABLE extraction_suggestion
    ADD CONSTRAINT extraction_suggestion_entity_type_check
    CHECK (entity_type IN (
        'character','world_note','term',
        'character_update','plot_revision','episode_draft'
    ));

ALTER TABLE extraction_suggestion
    ADD COLUMN IF NOT EXISTS source_agent     VARCHAR(40),
    ADD COLUMN IF NOT EXISTS source_thread_id UUID,
    ADD COLUMN IF NOT EXISTS reviewer_note    TEXT;

-- agent 가 동일 이름으로 여러 번 제안 가능 (수정·재안 등) — UNIQUE 제거
ALTER TABLE extraction_suggestion
    DROP CONSTRAINT IF EXISTS extraction_suggestion_work_id_entity_type_suggested_name_key;

CREATE INDEX IF NOT EXISTS idx_extraction_suggestion_thread
    ON extraction_suggestion(source_thread_id) WHERE source_thread_id IS NOT NULL;

-- ─────── 2. agent_session ───────

CREATE TABLE IF NOT EXISTS agent_session (
    thread_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id          UUID NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    writer_id        UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    scenario         VARCHAR(40) NOT NULL
        CHECK (scenario IN (
            'draft_next','consistency_check','revision',
            'extraction','qa','ideation'
        )),
    title            VARCHAR(200),
    messages         JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary_so_far   TEXT,
    status           VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','closed')),
    last_activity_at TIMESTAMP NOT NULL DEFAULT now(),
    created_at       TIMESTAMP NOT NULL DEFAULT now()
);

-- agent_session 은 updated_at 컬럼이 없고 코드가 last_activity_at 을 명시 갱신.
-- 이전 버전의 마이그레이션이 set_updated_at() 트리거를 등록했을 수 있어 DROP.
-- (NEW.updated_at 참조 시 record "new" has no field "updated_at" 발생)
DROP TRIGGER IF EXISTS trg_agent_session_last_activity ON agent_session;

CREATE INDEX IF NOT EXISTS idx_agent_session_writer_active
    ON agent_session(writer_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_session_work
    ON agent_session(work_id, last_activity_at DESC);

-- agent_session.scenario CHECK 갱신: 'auto' 포함 (재실행 안전).
-- 신규 컨테이너 부팅 시 schema.sql 가 이미 'auto' 포함된 정의로 생성하므로 NOOP,
-- 기존 운영 DB 는 DROP + ADD 로 갱신.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_session_scenario_check') THEN
        ALTER TABLE agent_session DROP CONSTRAINT agent_session_scenario_check;
    END IF;
END $$;
ALTER TABLE agent_session
    ADD CONSTRAINT agent_session_scenario_check
    CHECK (scenario IN (
        'auto',
        'draft_next','consistency_check','revision',
        'extraction','qa','ideation'
    ));

-- ─────── 3. token_receipt + token_receipt_line ───────

CREATE TABLE IF NOT EXISTS token_receipt (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    writer_id           UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    work_id             UUID REFERENCES work(id) ON DELETE SET NULL,
    feature             VARCHAR(40) NOT NULL,
    scenario            VARCHAR(40) NOT NULL,
    reference_type      VARCHAR(40) NOT NULL,
    reference_id        UUID NOT NULL,
    total_user_tokens   INTEGER NOT NULL DEFAULT 0,
    total_input_raw     INTEGER NOT NULL DEFAULT 0,
    total_output_raw    INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens   INTEGER NOT NULL DEFAULT 0,
    cache_create_tokens INTEGER NOT NULL DEFAULT 0,
    status              VARCHAR(20) NOT NULL
        CHECK (status IN ('success','partial','failed')),
    abort_reason        VARCHAR(40),
    duration_ms         INTEGER,
    idempotency_key     VARCHAR(200) UNIQUE,
    created_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS token_receipt_line (
    id              BIGSERIAL PRIMARY KEY,
    receipt_id      UUID NOT NULL REFERENCES token_receipt(id) ON DELETE CASCADE,
    seq             INTEGER NOT NULL,
    step_type       VARCHAR(40) NOT NULL
        CHECK (step_type IN ('planner_call','tool_call','worker_call','compression')),
    actor           VARCHAR(40) NOT NULL,
    tool_name       VARCHAR(60),
    input_tokens    INTEGER NOT NULL DEFAULT 0,
    output_tokens   INTEGER NOT NULL DEFAULT 0,
    user_tokens     INTEGER NOT NULL DEFAULT 0,
    detail          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_receipt_writer_time
    ON token_receipt(writer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_receipt_ref
    ON token_receipt(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_token_receipt_feature
    ON token_receipt(writer_id, feature, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_receipt_line_seq
    ON token_receipt_line(receipt_id, seq);

COMMIT;

-- ============================================================
-- 검증
-- ============================================================
-- 1) entity_type CHECK 확장 확인:
--    INSERT INTO extraction_suggestion (... entity_type='episode_draft' ...) — 통과해야 함
-- 2) agent_session 신규:
--    SELECT to_regclass('public.agent_session');
-- 3) token_receipt 인덱스:
--    SELECT indexname FROM pg_indexes WHERE tablename='token_receipt';
