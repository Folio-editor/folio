-- ============================================================
-- StoryZip DDL (PostgreSQL)
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
    processed_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE token_wallet (
    writer_id       UUID PRIMARY KEY REFERENCES writer(id) ON DELETE CASCADE,
    balance         INTEGER NOT NULL DEFAULT 0,
    total_charged   INTEGER NOT NULL DEFAULT 0,
    total_used      INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE token_transaction (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    writer_id       UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    amount          INTEGER NOT NULL,
    type            VARCHAR(20) NOT NULL,
    reason          VARCHAR(100),
    reference_id    UUID,
    expires_at      TIMESTAMP,
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
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE plan (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id         UUID NOT NULL UNIQUE REFERENCES work(id) ON DELETE CASCADE,
    writer_id       UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    slogan          TEXT,
    genres          JSONB,
    moods           JSONB,
    target_audience VARCHAR(200),
    content         TEXT,
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
    appearance      TEXT NOT NULL,
    mbti            VARCHAR(10),
    personality     TEXT,
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
CREATE INDEX idx_plan_writer ON plan(writer_id);
CREATE INDEX idx_world_note_writer ON world_note(writer_id);
CREATE INDEX idx_world_note_work ON world_note(work_id);
CREATE INDEX idx_world_note_parent ON world_note(parent_id);
CREATE INDEX idx_character_writer ON character(writer_id);
CREATE INDEX idx_character_work ON character(work_id);
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
CREATE INDEX idx_notification_writer ON notification(writer_id);
CREATE INDEX idx_notification_unread ON notification(writer_id, is_read) WHERE is_read = false;
CREATE INDEX idx_token_transaction_writer ON token_transaction(writer_id);
CREATE INDEX idx_token_transaction_expires ON token_transaction(writer_id, expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_ai_analysis_episode ON ai_analysis(episode_id);
CREATE INDEX idx_export_writer ON export(writer_id);

-- JSONB 인덱스
CREATE INDEX idx_plan_genres ON plan USING GIN (genres);
CREATE INDEX idx_plan_moods ON plan USING GIN (moods);
