-- ============================================================
-- Migration: episode_summary v2 — AI 원고 탐색 도구 메타 확장
-- Date: 2026-05-06
-- Owner: 프리미엄 요약 (Haiku 기반) — MCP search/list/get 도구 지원
-- ============================================================
--
-- 배경:
--   - 기존 episode_summary 는 summary TEXT + raw_result TEXT 만 보유.
--   - MCP 에이전트가 인물·장소·시점·복선·톤 등 차원별 탐색 시 본문 평문 fetch 필요.
--   - 회차당 풍부한 메타 12 + 폭주 가드 4 컬럼 추가 + FTS GIN 인덱스 도입.
--
-- B-1 가드:
--   raw_result TEXT → JSONB 캐스팅 시 비정상 JSON 1건이라도 있으면 마이그 전체 실패.
--   캐스팅 직전 sanity UPDATE 로 NULL 정리 후 USING NULLIF(...,'')::jsonb.
--
-- B-6 동기화:
--   동일 변경이 infra/db/schema.sql 의 episode_summary 정의에도 반영되어야 함.
--   (신규 컨테이너 첫 부팅은 schema.sql 만 적용. 두 파일 diverge 시 dev/prod 불일치)
-- ============================================================

BEGIN;

-- B-1 sanity: malformed JSON 사전 정리 (캐스팅 실패 방지)
UPDATE episode_summary
   SET raw_result = NULL
 WHERE raw_result IS NOT NULL
   AND (raw_result NOT LIKE '{%' OR raw_result NOT LIKE '%}');

ALTER TABLE episode_summary
    ADD COLUMN IF NOT EXISTS oneline_summary        TEXT,
    ADD COLUMN IF NOT EXISTS pov_character          VARCHAR(100),
    ADD COLUMN IF NOT EXISTS present_characters     JSONB,
    ADD COLUMN IF NOT EXISTS present_locations      JSONB,
    ADD COLUMN IF NOT EXISTS key_events             JSONB,
    ADD COLUMN IF NOT EXISTS time_progression       VARCHAR(50),
    ADD COLUMN IF NOT EXISTS tone                   VARCHAR(50),
    ADD COLUMN IF NOT EXISTS cliffhanger            TEXT,
    ADD COLUMN IF NOT EXISTS referenced_world_notes JSONB,
    ADD COLUMN IF NOT EXISTS foreshadow_planted     JSONB,
    ADD COLUMN IF NOT EXISTS foreshadow_paid_off    JSONB,
    ADD COLUMN IF NOT EXISTS keywords               JSONB,
    ADD COLUMN IF NOT EXISTS word_count             INTEGER,
    ADD COLUMN IF NOT EXISTS content_hash           CHAR(64),
    ADD COLUMN IF NOT EXISTS generation_count       INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_generated_at      TIMESTAMP;

-- raw_result TEXT → JSONB
ALTER TABLE episode_summary
    ALTER COLUMN raw_result TYPE JSONB USING NULLIF(raw_result,'')::jsonb;

-- FTS GENERATED tsvector
ALTER TABLE episode_summary
    ADD COLUMN IF NOT EXISTS summary_tsv tsvector
        GENERATED ALWAYS AS (
            to_tsvector('simple',
                coalesce(oneline_summary,'') || ' ' ||
                coalesce(summary,'')         || ' ' ||
                coalesce(keywords::text,''))
        ) STORED;

CREATE INDEX IF NOT EXISTS idx_episode_summary_tsv
    ON episode_summary USING GIN (summary_tsv);
CREATE INDEX IF NOT EXISTS idx_episode_summary_pov
    ON episode_summary (work_id, pov_character);
CREATE INDEX IF NOT EXISTS idx_episode_summary_episode_hash
    ON episode_summary (episode_id, content_hash);

COMMENT ON COLUMN episode_summary.oneline_summary IS '한 줄 요약 (15~30자). MCP list 도구 / 작가 검색 표시용.';
COMMENT ON COLUMN episode_summary.pov_character IS '회차 시점 인물 — 시점 일관성 검수 / 시점별 필터.';
COMMENT ON COLUMN episode_summary.present_characters IS '회차 등장 인물명 배열. JSONB containment(@>) 로 인물 검색.';
COMMENT ON COLUMN episode_summary.present_locations IS '회차 등장 장소 배열.';
COMMENT ON COLUMN episode_summary.key_events IS '시간순 핵심 사건 [{order,event}]. 다음 화 초안 컨텍스트.';
COMMENT ON COLUMN episode_summary.time_progression IS '회차 내 시간 흐름 (예: "한 시간","하루","3년").';
COMMENT ON COLUMN episode_summary.tone IS '회차 톤 (예: "잔잔한 일상","긴장감 고조"). 톤 일관성 검수.';
COMMENT ON COLUMN episode_summary.cliffhanger IS '회차 끝점 / 다음 화 hook. 초안 입력에 활용.';
COMMENT ON COLUMN episode_summary.referenced_world_notes IS '회차에서 참조된 world_note id 배열.';
COMMENT ON COLUMN episode_summary.foreshadow_planted IS '회차에서 새로 심은 복선 candidates [{name,description}].';
COMMENT ON COLUMN episode_summary.foreshadow_paid_off IS '회차에서 회수된 기존 foreshadow id 배열.';
COMMENT ON COLUMN episode_summary.keywords IS '검색 보조 키워드 5~10개. tsvector 보완.';
COMMENT ON COLUMN episode_summary.content_hash IS 'episode.content SHA256. 동일 본문 재 호출 skip.';
COMMENT ON COLUMN episode_summary.generation_count IS '누적 재생성 횟수 — 일 limit 적용.';
COMMENT ON COLUMN episode_summary.last_generated_at IS '마지막 호출 시각 — 30분 cooldown 적용.';

COMMIT;

-- ============================================================
-- 운영 적용 후 절차
-- ============================================================
-- 1. AI 서버 재기동 — Celery include 에 app.tasks.generate_summary 추가됨 (B-2)
--    docker compose restart ai-worker ai-api
-- 2. Backend 재기동 — SyncService.triggerEpisodeSummaryAfterCommit hook 적용
-- 3. PowerSync 재기동 불필요 — episode_summary 는 sync 대상 아님 (서버 전용)
-- 4. 검증: SELECT pg_typeof(raw_result) FROM episode_summary LIMIT 1; → jsonb 확인
