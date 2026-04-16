-- ============================================================
-- StoryZip PowerSync Postgres 초기화
-- ============================================================
-- - replication 전용 role 생성
-- - 동기화 대상 테이블에 SELECT 권한 부여
-- - PowerSync가 구독할 publication 생성
--
-- 실행 시점: docker-entrypoint-initdb.d/02-powersync.sql
--   (schema.sql 적용 이후 실행되도록 01-/02- 순번 지정)
--
-- 주의: 이미 pgdata 볼륨이 있는 경우 이 스크립트는 실행되지 않는다.
--       기존 볼륨을 보유한 개발자는 docker compose down -v 후 재기동하거나
--       수동으로 이 파일을 psql로 실행해야 한다.
-- ============================================================

-- replication 전용 role (dev 한정 하드코딩 비밀번호)
CREATE ROLE powersync_repl WITH LOGIN REPLICATION PASSWORD 'storyzip_repl_dev';

-- 동기화 대상 테이블에 SELECT 권한 부여
GRANT SELECT ON
    work,
    plan,
    plan_note,
    world_note,
    "character",
    character_custom_field,
    character_tag,
    plot,
    episode,
    plot_episode_link,
    foreshadow,
    foreshadow_link,
    idea_archive
TO powersync_repl;

-- PowerSync가 구독할 publication
-- (writer, audit_log, payment 등 서버 전용 테이블은 제외)
CREATE PUBLICATION powersync FOR TABLE
    work,
    plan,
    plan_note,
    world_note,
    "character",
    character_custom_field,
    character_tag,
    plot,
    episode,
    plot_episode_link,
    foreshadow,
    foreshadow_link,
    idea_archive;
