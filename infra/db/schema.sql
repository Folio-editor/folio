-- ============================================================
-- Folio DDL (PostgreSQL)
-- ============================================================
-- 동기화 대상: SQLite (로컬) + PostgreSQL (서버) via PowerSync
-- 서버 전용: PostgreSQL only
-- 생성일: 2026-04-14
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 서버 전용 (PostgreSQL only)
-- ────────────────────────────────────────────────────────────

CREATE TABLE writer (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               VARCHAR(255) NOT NULL UNIQUE,
    password_hash       VARCHAR(255),
    nickname            VARCHAR(100),
    profile_image_url   TEXT,
    role                VARCHAR(20) NOT NULL DEFAULT 'USER',
    oauth_provider      VARCHAR(50),
    oauth_id            VARCHAR(255),
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMP
);

-- Refresh Token은 Redis에 저장한다.
-- Key: RT:{writer_id}:{device_id}
-- TTL: Refresh Token 만료 시간

CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    writer_id       UUID REFERENCES writer(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,
    ip_address      VARCHAR(50),
    user_agent      VARCHAR(500),
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE payment (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    writer_id       UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    order_id        VARCHAR(100) NOT NULL UNIQUE,
    payment_key     VARCHAR(200),
    amount          INTEGER NOT NULL,
    token_qty       INTEGER NOT NULL,
    status          VARCHAR(20) NOT NULL,
    method          VARCHAR(20),
    approved_at     TIMESTAMP,
    failure_reason  TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE subscription (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    writer_id       UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    customer_key    VARCHAR(100) NOT NULL UNIQUE,
    billing_key     VARCHAR(200) NOT NULL,
    plan            VARCHAR(50) NOT NULL,
    monthly_tokens  INTEGER NOT NULL,
    monthly_amount  BIGINT NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL,
    next_billing_at TIMESTAMP NOT NULL,
    last_payment_at TIMESTAMP,
    retry_count     INTEGER NOT NULL DEFAULT 0,
    cancelled_at    TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE payment_event (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        VARCHAR(100) NOT NULL UNIQUE,
    event_type      VARCHAR(50) NOT NULL,
    payload         JSONB NOT NULL,
    consumed        BOOLEAN NOT NULL DEFAULT FALSE,
    processed_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE analytics_event_dedup (
    event_id        UUID PRIMARY KEY,
    writer_id       UUID REFERENCES writer(id) ON DELETE SET NULL,
    client_id       VARCHAR(120),
    event_name      VARCHAR(80) NOT NULL,
    received_at     TIMESTAMP NOT NULL DEFAULT now()
);

-- 3버킷 구조: 구독/보너스/종량제 크레딧을 출처별로 분리 관리.
-- 차감 우선순위: subscription → bonus → purchase (빨리 소멸하는 순).
CREATE TABLE token_wallet (
    writer_id             UUID PRIMARY KEY REFERENCES writer(id) ON DELETE CASCADE,
    subscription_balance  INTEGER NOT NULL DEFAULT 0,   -- 구독 월 지급분, 다음 갱신 시 소멸
    bonus_balance         INTEGER NOT NULL DEFAULT 0,   -- 신규 가입 보너스, 만료 시 소멸
    bonus_expires_at      TIMESTAMP,                    -- NULL = 보너스 미지급 또는 이미 소멸
    purchase_balance      INTEGER NOT NULL DEFAULT 0,   -- 종량제 구매분, 영구 유지
    total_charged         INTEGER NOT NULL DEFAULT 0,
    total_used            INTEGER NOT NULL DEFAULT 0,
    updated_at            TIMESTAMP NOT NULL DEFAULT now()
);

-- 원장(append-only). 혼합 차감은 bucket별로 분리된 레코드로 기록된다.
CREATE TABLE token_transaction (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    writer_id       UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    bucket          VARCHAR(20) NOT NULL,   -- SUBSCRIPTION | BONUS | PURCHASE
    amount          INTEGER NOT NULL,       -- 양수=충전, 음수=차감
    type            VARCHAR(20) NOT NULL,   -- CHARGE | SUBSCRIPTION | BONUS_GRANT | USAGE | EXPIRE | REFUND
    reason          VARCHAR(100),
    reference_id    UUID,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE notification (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    writer_id       UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL,
    title           VARCHAR(200) NOT NULL,
    message         TEXT,
    is_read         BOOLEAN NOT NULL DEFAULT false,
    expires_at      TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE ai_prompt_template (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL UNIQUE,
    description     VARCHAR(500),
    prompt_template TEXT NOT NULL,
    model           VARCHAR(50) NOT NULL,
    max_tokens      INTEGER NOT NULL,
    token_cost      INTEGER NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 동기화 대상 (SQLite + PostgreSQL via PowerSync)
-- ────────────────────────────────────────────────────────────

CREATE TABLE work (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    writer_id       UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    author_name     VARCHAR(100),
    description     TEXT,
    status          VARCHAR(20) NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    genres          JSONB DEFAULT '[]'::jsonb,
    moods           JSONB DEFAULT '[]'::jsonb,
    encrypted_dek   BYTEA,
    -- 작품 종류 식별 (NULL = 일반 사용자 작품, 'onboarding' = 신규 사용자 가이드).
    -- ciphertext 무관 평문 컬럼이라 SELECT WHERE 매칭 안전. 향후 'novel'/'short_story' 등
    -- 확장 여지. 기본 NULL → 기존 데이터 영향 0.
    kind            VARCHAR(20),
    -- Vault Transit envelope encryption: work_key 를 Vault 로 추가 wrap 한 결과.
    -- 작품 생성 시 클라이언트가 raw work_key 를 한 번 TLS 로 서버 전송 → VaultKmsService.encrypt()
    -- → 이 컬럼 채움. 오프라인 신규 작품은 NULL 허용 (온라인 복귀 시 발급).
    -- 서버는 이 컬럼 → Vault decrypt → work_key 평문 → AI 인덱싱·검수에 사용.
    server_encrypted_dek BYTEA,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- (구) plan 테이블은 ERD 정리(2026-05) 2단계로 폐기됨.
--   - 1단계: slogan/genres/moods/target_audience 컬럼이 work 로 이전·폐기되어 빈 껍데기가 됨
--   - 2단계: plan_note 가 work_id 를 직접 FK 로 참조하므로 plan 행 자체가 불필요 → DROP
-- 기획서 하위 자유 문서는 plan_note 가 단독으로 관리한다.
CREATE TABLE plan_note (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id         UUID NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    writer_id       UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    content         TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE world_note (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id         UUID NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    writer_id       UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES world_note(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    content         TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE character (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id         UUID NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    writer_id       UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    profile_image_url TEXT,
    gender          VARCHAR(20) NOT NULL,
    age             VARCHAR(100) NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- 인물 하위 문서 (1:N) — 외형/성격은 자동 생성, 사용자 추가 문서도 가능
CREATE TABLE character_note (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id    UUID NOT NULL REFERENCES character(id) ON DELETE CASCADE,
    writer_id       UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    kind            VARCHAR(20) NOT NULL DEFAULT 'custom',
    title           VARCHAR(200) NOT NULL,
    content         TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE character_custom_field (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id    UUID NOT NULL REFERENCES character(id) ON DELETE CASCADE,
    field_name      VARCHAR(100) NOT NULL,
    field_value     TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE character_tag (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id    UUID NOT NULL REFERENCES character(id) ON DELETE CASCADE,
    world_note_id   UUID NOT NULL REFERENCES world_note(id) ON DELETE CASCADE,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (character_id, world_note_id)
);

CREATE TABLE plot (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id         UUID NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    writer_id       UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES plot(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    status          VARCHAR(20),
    content         TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE episode (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id         UUID NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    writer_id       UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES episode(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    status          VARCHAR(20) NOT NULL,
    content         TEXT,
    word_count      INTEGER NOT NULL DEFAULT 0,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE plot_episode_link (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plot_id         UUID NOT NULL UNIQUE REFERENCES plot(id) ON DELETE CASCADE,
    episode_id      UUID NOT NULL UNIQUE REFERENCES episode(id) ON DELETE CASCADE,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE foreshadow (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id         UUID NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    writer_id       UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    status          VARCHAR(20) NOT NULL,
    importance      VARCHAR(10) NOT NULL,
    content         TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE foreshadow_link (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foreshadow_id   UUID NOT NULL REFERENCES foreshadow(id) ON DELETE CASCADE,
    link_type       VARCHAR(20) NOT NULL,
    episode_id      UUID REFERENCES episode(id) ON DELETE SET NULL,
    plot_id         UUID REFERENCES plot(id) ON DELETE SET NULL,
    context_memo    TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    CHECK (episode_id IS NOT NULL OR plot_id IS NOT NULL)
);

CREATE TABLE idea_archive (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id         UUID NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    writer_id       UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    tag             VARCHAR(20),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- AI 전용 (PostgreSQL only, PowerSync 제외)
-- ────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE episode_chunk (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id    UUID NOT NULL REFERENCES episode(id) ON DELETE CASCADE,
    work_id       UUID NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    writer_id     UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    chunk_index   INTEGER NOT NULL,
    content       TEXT NOT NULL,
    embedding     VECTOR(1536) NOT NULL,
    token_count   INTEGER NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (episode_id, chunk_index)
);

CREATE TABLE episode_summary (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id             UUID NOT NULL UNIQUE REFERENCES episode(id) ON DELETE CASCADE,
    work_id                UUID NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    writer_id              UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    -- 요약 본문
    oneline_summary        TEXT,                    -- 한 줄 요약 (15~30자). 알파 NULL 허용, Phase 2 NOT NULL.
    summary                TEXT NOT NULL,           -- 3~5 문장 줄거리
    -- 회차 메타 (AI 탐색·검수·초안용)
    pov_character          VARCHAR(100),
    present_characters     JSONB,                   -- ["앤","마릴라"]
    present_locations      JSONB,                   -- ["초록지붕집"]
    key_events             JSONB,                   -- [{order,event}]
    time_progression       VARCHAR(50),
    tone                   VARCHAR(50),
    cliffhanger            TEXT,
    referenced_world_notes JSONB,                   -- world_note id[]
    foreshadow_planted     JSONB,                   -- [{name,description}]
    foreshadow_paid_off    JSONB,                   -- foreshadow id[]
    keywords               JSONB,                   -- 검색 보조 키워드 5~10개
    word_count             INTEGER,
    -- 작가 승인
    is_confirmed           BOOLEAN NOT NULL DEFAULT false,
    -- 호출 메타 / 폭주 가드
    model_used             VARCHAR(50),
    raw_result             JSONB,                   -- LLM 원본 응답
    content_hash           CHAR(64),                -- episode.content SHA256 — 동일 본문 skip
    generation_count       INTEGER NOT NULL DEFAULT 0,
    last_generated_at      TIMESTAMP,
    created_at             TIMESTAMP NOT NULL DEFAULT now(),
    updated_at             TIMESTAMP NOT NULL DEFAULT now(),
    -- FTS — 'simple' 토크나이저 (한국어 정확도 한계는 keywords JSONB + JSONB 컨테인 검색으로 보완)
    summary_tsv            tsvector GENERATED ALWAYS AS (
        to_tsvector('simple',
            coalesce(oneline_summary,'') || ' ' ||
            coalesce(summary,'')         || ' ' ||
            coalesce(keywords::text,''))
    ) STORED
);

CREATE TABLE extraction_suggestion (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    writer_id           UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    work_id             UUID NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    episode_id          UUID REFERENCES episode(id) ON DELETE SET NULL,
    entity_type         VARCHAR(30) NOT NULL
        CHECK (entity_type IN ('character','world_note','term')),
    suggested_name      VARCHAR(200) NOT NULL,
    payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','confirmed','rejected')),
    confirmed_target_id UUID,
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    updated_at          TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (work_id, entity_type, suggested_name)
);

CREATE TABLE ai_job (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    writer_id     UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    work_id       UUID NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    episode_id    UUID REFERENCES episode(id) ON DELETE SET NULL,
    job_type      VARCHAR(30) NOT NULL
        CHECK (job_type IN ('indexing','summary','review','generation')),
    status        VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','running','done','failed')),
    error_message TEXT,
    created_at    TIMESTAMP NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_episode_summary_updated_at
    BEFORE UPDATE ON episode_summary
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_extraction_suggestion_updated_at
    BEFORE UPDATE ON extraction_suggestion
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ai_job_updated_at
    BEFORE UPDATE ON ai_job
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 서버 전용이지만 동기화 테이블 참조
-- ────────────────────────────────────────────────────────────

CREATE TABLE ai_analysis (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    writer_id           UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    work_id             UUID NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    episode_id          UUID NOT NULL REFERENCES episode(id) ON DELETE CASCADE,
    setting_conflicts   TEXT,
    tone_conflicts      TEXT,
    new_items           TEXT,
    tokens_used         INTEGER NOT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE export (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    writer_id       UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    work_id         UUID NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    format          VARCHAR(20) NOT NULL,
    status          VARCHAR(20) NOT NULL,
    file_url        VARCHAR(500),
    expires_at      TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 인덱스
-- ────────────────────────────────────────────────────────────

-- 동기화 필터링 (PowerSync RLS)
CREATE INDEX idx_work_writer ON work(writer_id);
-- (구) idx_plan_writer 는 plan 테이블 폐기로 함께 제거됨 (ERD 정리 2단계).
CREATE INDEX idx_plan_note_writer ON plan_note(writer_id);
CREATE INDEX idx_plan_note_work   ON plan_note(work_id);
CREATE INDEX idx_world_note_writer ON world_note(writer_id);
CREATE INDEX idx_world_note_work ON world_note(work_id);
CREATE INDEX idx_world_note_parent ON world_note(parent_id);
CREATE INDEX idx_character_writer ON character(writer_id);
CREATE INDEX idx_character_work ON character(work_id);
CREATE INDEX idx_character_note_character ON character_note(character_id);
CREATE INDEX idx_character_note_writer ON character_note(writer_id);
CREATE INDEX idx_character_custom_field_character ON character_custom_field(character_id);
CREATE INDEX idx_character_tag_character ON character_tag(character_id);
CREATE INDEX idx_character_tag_world_note ON character_tag(world_note_id);
CREATE INDEX idx_plot_writer ON plot(writer_id);
CREATE INDEX idx_plot_work ON plot(work_id);
CREATE INDEX idx_plot_parent ON plot(parent_id);
CREATE INDEX idx_episode_writer ON episode(writer_id);
CREATE INDEX idx_episode_work ON episode(work_id);
CREATE INDEX idx_episode_parent ON episode(parent_id);
CREATE INDEX idx_foreshadow_writer ON foreshadow(writer_id);
CREATE INDEX idx_foreshadow_work ON foreshadow(work_id);
CREATE INDEX idx_foreshadow_link_foreshadow ON foreshadow_link(foreshadow_id);
CREATE INDEX idx_idea_archive_writer ON idea_archive(writer_id);
CREATE INDEX idx_idea_archive_work ON idea_archive(work_id);

-- 서버 전용
CREATE INDEX idx_audit_log_writer ON audit_log(writer_id);
CREATE INDEX idx_payment_writer ON payment(writer_id);
CREATE INDEX idx_subscription_writer ON subscription(writer_id);
CREATE INDEX idx_subscription_status ON subscription(status, next_billing_at);
CREATE INDEX idx_payment_event_type ON payment_event(event_type, processed_at);
CREATE INDEX idx_analytics_event_dedup_received_at ON analytics_event_dedup(received_at);
CREATE INDEX idx_notification_writer ON notification(writer_id);
CREATE INDEX idx_notification_unread ON notification(writer_id, is_read) WHERE is_read = false;
CREATE INDEX idx_token_transaction_writer ON token_transaction(writer_id, created_at DESC);
CREATE INDEX idx_token_transaction_bucket ON token_transaction(writer_id, bucket);
CREATE INDEX idx_token_wallet_bonus_expires
    ON token_wallet(bonus_expires_at) WHERE bonus_balance > 0;
CREATE INDEX idx_ai_analysis_episode ON ai_analysis(episode_id);
CREATE INDEX idx_export_writer ON export(writer_id);

-- JSONB 인덱스 (genres/moods 는 ERD 정리 1단계로 plan → work 이전됨)
CREATE INDEX idx_work_genres ON work USING GIN (genres);
CREATE INDEX idx_work_moods ON work USING GIN (moods);

-- AI 전용
CREATE INDEX idx_episode_chunk_embedding
    ON episode_chunk USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
CREATE INDEX idx_episode_chunk_work     ON episode_chunk(work_id);
CREATE INDEX idx_episode_chunk_writer   ON episode_chunk(writer_id);
CREATE INDEX idx_episode_chunk_episode  ON episode_chunk(episode_id);
CREATE INDEX idx_episode_summary_work_confirmed
    ON episode_summary(work_id, is_confirmed);
CREATE INDEX idx_episode_summary_writer ON episode_summary(writer_id);
CREATE INDEX idx_episode_summary_tsv
    ON episode_summary USING GIN (summary_tsv);
CREATE INDEX idx_episode_summary_pov
    ON episode_summary (work_id, pov_character);
CREATE INDEX idx_episode_summary_episode_hash
    ON episode_summary (episode_id, content_hash);
CREATE INDEX idx_extraction_suggestion_work_status
    ON extraction_suggestion(work_id, status);
CREATE INDEX idx_extraction_suggestion_writer  ON extraction_suggestion(writer_id);
CREATE INDEX idx_extraction_suggestion_episode ON extraction_suggestion(episode_id);
CREATE INDEX idx_ai_job_work    ON ai_job(work_id);
CREATE INDEX idx_ai_job_episode ON ai_job(episode_id);
CREATE INDEX idx_ai_job_writer  ON ai_job(writer_id);
CREATE INDEX idx_ai_job_active_status
    ON ai_job(status) WHERE status IN ('pending','running');
