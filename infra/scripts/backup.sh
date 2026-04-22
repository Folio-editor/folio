#!/bin/bash
# ============================================================
# Folio — 일일 백업 스크립트 (PostgreSQL + MongoDB → S3)
#
# crontab:
#   0 3 * * * /opt/folio/infra/scripts/backup.sh >> /opt/folio/data/backup.log 2>&1
#
# 전제 조건:
#   - AWS CLI 설치 및 자격증명 설정
#   - Docker 컨테이너 실행 중
#   - S3 버킷 생성 완료
# ============================================================
set -euo pipefail

# 설정
BACKUP_DIR="/opt/folio/data/backups"
S3_BUCKET="${S3_BACKUP_BUCKET:-folio-backups}"
S3_REGION="${S3_REGION:-ap-northeast-2}"
DATE=$(date +%Y-%m-%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)  # 1=Mon, 7=Sun
DAY_OF_MONTH=$(date +%d)

mkdir -p "$BACKUP_DIR"

echo "=== Folio Backup Started: $(date) ==="

# ─── PostgreSQL 백업 ─────────────────────────────────────────
echo "[backup] PostgreSQL dump..."
PG_FILE="${BACKUP_DIR}/pg-${DATE}.sql.gz"

docker exec folio-postgresql-prod pg_dump \
    -U "${DB_USERNAME:-folio}" \
    -d "${DB_NAME:-folio}" \
    --no-owner --no-privileges \
    | gzip > "$PG_FILE"

PG_SIZE=$(du -h "$PG_FILE" | cut -f1)
echo "[backup] PostgreSQL dump complete: $PG_FILE ($PG_SIZE)"

# ─── MongoDB 백업 ────────────────────────────────────────────
echo "[backup] MongoDB dump..."
MONGO_FILE="${BACKUP_DIR}/mongo-${DATE}.gz"

docker exec folio-mongo-prod mongodump \
    --archive \
    --gzip \
    --db powersync \
    > "$MONGO_FILE"

MONGO_SIZE=$(du -h "$MONGO_FILE" | cut -f1)
echo "[backup] MongoDB dump complete: $MONGO_FILE ($MONGO_SIZE)"

# ─── S3 업로드 ───────────────────────────────────────────────
echo "[backup] Uploading to S3..."

# 일일 백업
aws s3 cp "$PG_FILE" "s3://${S3_BUCKET}/daily/pg-${DATE}.sql.gz" --region "$S3_REGION"
aws s3 cp "$MONGO_FILE" "s3://${S3_BUCKET}/daily/mongo-${DATE}.gz" --region "$S3_REGION"

# 주간 백업 (일요일)
if [ "$DAY_OF_WEEK" = "7" ]; then
    aws s3 cp "$PG_FILE" "s3://${S3_BUCKET}/weekly/pg-${DATE}.sql.gz" --region "$S3_REGION"
    aws s3 cp "$MONGO_FILE" "s3://${S3_BUCKET}/weekly/mongo-${DATE}.gz" --region "$S3_REGION"
    echo "[backup] Weekly backup saved."
fi

# 월간 백업 (1일)
if [ "$DAY_OF_MONTH" = "01" ]; then
    aws s3 cp "$PG_FILE" "s3://${S3_BUCKET}/monthly/pg-${DATE}.sql.gz" --region "$S3_REGION"
    aws s3 cp "$MONGO_FILE" "s3://${S3_BUCKET}/monthly/mongo-${DATE}.gz" --region "$S3_REGION"
    echo "[backup] Monthly backup saved."
fi

# ─── 로컬 정리 (7일 이상 된 파일 삭제) ──────────────────────
find "$BACKUP_DIR" -name "pg-*.sql.gz" -mtime +7 -delete
find "$BACKUP_DIR" -name "mongo-*.gz" -mtime +7 -delete
echo "[backup] Local files older than 7 days cleaned."

# ─── S3 보존 정책 (일일: 7일, 주간: 4주, 월간: 3개월) ────────
# S3 Lifecycle Policy로 관리 권장. CLI 대안:
# aws s3 rm "s3://${S3_BUCKET}/daily/" --recursive --exclude "*" \
#   --include "*.gz" --older-than 7d  (aws CLI v2에서 미지원, lifecycle 사용)

echo "=== Folio Backup Complete: $(date) ==="
