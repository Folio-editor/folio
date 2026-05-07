#!/bin/bash
# ============================================================
# Folio PowerSync Postgres 초기화
# ============================================================
# - replication 전용 role 생성 (비밀번호는 환경변수에서 주입)
# - 동기화 대상 테이블에 SELECT 권한 부여
# - PowerSync가 구독할 publication 생성
#
# 실행 시점: docker-entrypoint-initdb.d/02-powersync.sh
#   (schema.sql 적용 이후 실행되도록 01-/02- 순번 지정)
#
# 주의: 이미 pgdata 볼륨이 있는 경우 이 스크립트는 실행되지 않는다.
#       기존 볼륨을 보유한 개발자는 docker compose down -v 후 재기동하거나
#       수동으로 실행해야 한다.
# ============================================================
set -e

REPL_PASSWORD="${PS_REPL_PASSWORD:-storyzip_repl_dev}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE folio_repl WITH LOGIN REPLICATION PASSWORD '${REPL_PASSWORD}';

    GRANT SELECT ON
        work,
        plan_note,
        world_note,
        "character",
        character_note,
        character_custom_field,
        character_tag,
        plot,
        episode,
        plot_episode_link,
        foreshadow,
        foreshadow_link,
        idea_archive
    TO folio_repl;

    CREATE PUBLICATION powersync FOR TABLE
        work,
        plan_note,
        world_note,
        "character",
        character_note,
        character_custom_field,
        character_tag,
        plot,
        episode,
        plot_episode_link,
        foreshadow,
        foreshadow_link,
        idea_archive;
EOSQL
