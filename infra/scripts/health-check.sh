#!/bin/bash
# ============================================================
# Folio — 서비스 헬스체크 스크립트
#
# 사용법:
#   bash health-check.sh <URL> [max_retries] [interval_sec]
#
# 예시:
#   bash health-check.sh http://localhost:8081/actuator/health 30 2
#   bash health-check.sh http://localhost:8091/v1/health
#   bash health-check.sh http://localhost:3001/healthz
# ============================================================
set -euo pipefail

URL="${1:?Usage: health-check.sh <URL> [max_retries] [interval_sec]}"
MAX_RETRIES="${2:-30}"
INTERVAL="${3:-2}"

echo "[health-check] Checking $URL (max ${MAX_RETRIES} retries, ${INTERVAL}s interval)"

for i in $(seq 1 "$MAX_RETRIES"); do
    if curl -sf --max-time 5 "$URL" > /dev/null 2>&1; then
        echo "[health-check] ✓ $URL is healthy (attempt $i)"
        exit 0
    fi
    echo "[health-check] Attempt $i/$MAX_RETRIES - waiting ${INTERVAL}s..."
    sleep "$INTERVAL"
done

echo "[health-check] ✗ $URL failed after $MAX_RETRIES attempts"
exit 1
