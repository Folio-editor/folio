#!/bin/bash
# ============================================================
# Folio — 일일 DB 백업 스크립트 (PostgreSQL + MongoDB → 로컬 디스크)
#
# 정책:
#   - daily/   매일 새벽 3시, 7일 보존
#   - weekly/  일요일에 daily 에서 hardlink 카피, 4주 보존
#   - monthly/ 매월 1일에 daily 에서 hardlink 카피, 3개월 보존
#
# 알람:
#   실패 시 backend /internal/ops/notify 로 운영자 메일 발송.
#   (백엔드가 죽어있으면 메일 못 보냄 — Grafana/Prometheus 가 별도로 백엔드 down 감지)
#
# crontab (ubuntu user):
#   0 3 * * * DOPPLER_TOKEN=<dt.st...> /opt/folio/infra/scripts/backup.sh \
#               >> /opt/folio/data/backups/backup.log 2>&1
#
# 전제:
#   - Docker 컨테이너 folio-postgresql-prod / folio-mongo-prod 실행 중
#   - 디스크 /opt/folio/data 여유 (1회 ~20MB, 14개 보존 시 ~300MB)
#   - Doppler CLI 설치 + 토큰 (INTERNAL_API_KEY 조회용. 미설정 시 알람 메일만 skip)
# ============================================================
set -euo pipefail

# ─── 설정 ────────────────────────────────────────────────────
BACKUP_ROOT="/opt/folio/data/backups"
DAILY_DIR="${BACKUP_ROOT}/daily"
WEEKLY_DIR="${BACKUP_ROOT}/weekly"
MONTHLY_DIR="${BACKUP_ROOT}/monthly"
DATE=$(date +%Y-%m-%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)   # 1=Mon, 7=Sun
DAY_OF_MONTH=$(date +%d)

DAILY_KEEP_DAYS=7
WEEKLY_KEEP_DAYS=28
MONTHLY_KEEP_DAYS=90

PG_CONTAINER="${PG_CONTAINER:-folio-postgresql-prod}"
MONGO_CONTAINER="${MONGO_CONTAINER:-folio-mongo-prod}"
DB_USERNAME="${DB_USERNAME:-folio}"
DB_NAME="${DB_NAME:-folio}"
MONGO_DB="${MONGO_DB:-powersync}"

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8080}"

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR" "$MONTHLY_DIR"

PG_FILE="${DAILY_DIR}/pg-${DATE}.sql.gz"
MONGO_FILE="${DAILY_DIR}/mongo-${DATE}.archive.gz"

# ─── 알람 헬퍼 ───────────────────────────────────────────────
# 백엔드 /internal/ops/notify 로 운영자 메일 발송 트리거.
# INTERNAL_API_KEY 를 Doppler 에서 가져오지 못하면 메일은 skip, stderr 만 남김.
notify_failure() {
    local subject="$1"
    local body="$2"
    local key=""
    if command -v doppler >/dev/null 2>&1 && [ -n "${DOPPLER_TOKEN:-}" ]; then
        key=$(doppler secrets get INTERNAL_API_KEY --plain 2>/dev/null || echo "")
    fi
    if [ -z "$key" ]; then
        echo "[notify] INTERNAL_API_KEY unavailable — mail skipped. subject=${subject}" >&2
        return 0
    fi
    # body 가 줄바꿈/특수문자 포함 가능 → jq 가 있으면 사용, 없으면 raw escape.
    local payload
    if command -v jq >/dev/null 2>&1; then
        payload=$(jq -n --arg s "$subject" --arg b "$body" '{subject:$s, body:$b}')
    else
        # fallback: 줄바꿈을 literal \n 으로 치환하고 따옴표 escape
        local esc_body
        esc_body=$(printf '%s' "$body" | sed ':a;N;$!ba;s/\n/\\n/g' | sed 's/"/\\"/g')
        payload="{\"subject\":\"${subject}\",\"body\":\"${esc_body}\"}"
    fi
    curl -sS -m 10 -X POST \
        -H "Content-Type: application/json" \
        -H "X-Internal-Api-Key: ${key}" \
        --data "$payload" \
        "${BACKEND_URL}/internal/ops/notify" \
        >/dev/null \
        || echo "[notify] backend call failed — mail not sent" >&2
}

# 스크립트 자체 실패(set -e 트랩) 시에도 알람.
trap '
    rc=$?
    if [ $rc -ne 0 ]; then
        notify_failure "[Folio][backup] FAILED rc=${rc}" \
            "백업 스크립트가 비정상 종료됨.
호스트: $(hostname)
일시: $(date -Iseconds)
종료 코드: ${rc}
로그 확인: tail -200 ${BACKUP_ROOT}/backup.log"
    fi
' EXIT

echo "=== Folio Backup Started: $(date -Iseconds) ==="

# ─── PostgreSQL 백업 ─────────────────────────────────────────
echo "[backup] PostgreSQL dump..."
docker exec "$PG_CONTAINER" pg_dump \
    -U "$DB_USERNAME" \
    -d "$DB_NAME" \
    --no-owner --no-privileges \
    | gzip > "$PG_FILE"

# 결과 sanity check — pg_dump 실패 시 gzip 헤더만 있는 빈 파일이 남을 수 있음.
PG_SIZE_BYTES=$(stat -c%s "$PG_FILE")
if [ "$PG_SIZE_BYTES" -lt 1024 ]; then
    echo "[backup] PostgreSQL dump suspiciously small (${PG_SIZE_BYTES} bytes)" >&2
    exit 11
fi
PG_SIZE=$(du -h "$PG_FILE" | cut -f1)
echo "[backup] PostgreSQL dump complete: $PG_FILE ($PG_SIZE)"

# ─── MongoDB 백업 ────────────────────────────────────────────
echo "[backup] MongoDB dump..."
docker exec "$MONGO_CONTAINER" mongodump \
    --archive \
    --gzip \
    --db "$MONGO_DB" \
    > "$MONGO_FILE"

MONGO_SIZE_BYTES=$(stat -c%s "$MONGO_FILE")
if [ "$MONGO_SIZE_BYTES" -lt 1024 ]; then
    echo "[backup] MongoDB dump suspiciously small (${MONGO_SIZE_BYTES} bytes)" >&2
    exit 12
fi
MONGO_SIZE=$(du -h "$MONGO_FILE" | cut -f1)
echo "[backup] MongoDB dump complete: $MONGO_FILE ($MONGO_SIZE)"

# ─── 주간/월간 카피 (hardlink — 디스크 추가 점유 0) ──────────
if [ "$DAY_OF_WEEK" = "7" ]; then
    ln -f "$PG_FILE" "${WEEKLY_DIR}/$(basename "$PG_FILE")"
    ln -f "$MONGO_FILE" "${WEEKLY_DIR}/$(basename "$MONGO_FILE")"
    echo "[backup] Weekly hardlink saved."
fi
if [ "$DAY_OF_MONTH" = "01" ]; then
    ln -f "$PG_FILE" "${MONTHLY_DIR}/$(basename "$PG_FILE")"
    ln -f "$MONGO_FILE" "${MONTHLY_DIR}/$(basename "$MONGO_FILE")"
    echo "[backup] Monthly hardlink saved."
fi

# ─── 보존 정책 적용 (mtime 기준 삭제) ────────────────────────
# hardlink 이므로 weekly/monthly 에 카피된 파일이 daily 에서 지워져도 그쪽엔 유지됨.
find "$DAILY_DIR"   -name "pg-*.sql.gz"        -mtime +$DAILY_KEEP_DAYS   -delete
find "$DAILY_DIR"   -name "mongo-*.archive.gz" -mtime +$DAILY_KEEP_DAYS   -delete
find "$WEEKLY_DIR"  -name "pg-*.sql.gz"        -mtime +$WEEKLY_KEEP_DAYS  -delete
find "$WEEKLY_DIR"  -name "mongo-*.archive.gz" -mtime +$WEEKLY_KEEP_DAYS  -delete
find "$MONTHLY_DIR" -name "pg-*.sql.gz"        -mtime +$MONTHLY_KEEP_DAYS -delete
find "$MONTHLY_DIR" -name "mongo-*.archive.gz" -mtime +$MONTHLY_KEEP_DAYS -delete

echo "[backup] Rotation done (daily=${DAILY_KEEP_DAYS}d, weekly=${WEEKLY_KEEP_DAYS}d, monthly=${MONTHLY_KEEP_DAYS}d)."

# ─── 디스크 사용량 워치 (90% 초과 시 알람) ───────────────────
USE_PCT=$(df -P /opt | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
if [ "${USE_PCT:-0}" -ge 90 ]; then
    notify_failure "[Folio][backup] DISK_HIGH ${USE_PCT}%" \
        "/opt 디스크 사용량이 ${USE_PCT}% 입니다. 백업은 성공했으나 보존 기간 축소 필요."
fi

echo "=== Folio Backup Complete: $(date -Iseconds) ==="
