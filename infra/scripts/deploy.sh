#!/bin/bash
# ============================================================
# Folio — Blue/Green 무중단 배포 스크립트
#
# 사용법:
#   bash deploy.sh <IMAGE_TAG>
#
# 예시:
#   bash deploy.sh abc1234    # git short SHA
#   bash deploy.sh latest
#
# 전제 조건:
#   - /opt/folio/infra/prod/ 에서 실행
#   - docker compose 설치됨
#   - doppler CLI 설치됨 (또는 .env 직접 준비)
#   - 공유 서비스(docker-compose.yml)가 이미 기동 중
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROD_DIR="/opt/folio/infra/prod"
ACTIVE_COLOR_FILE="/opt/folio/active-color"
HEALTH_CHECK="${SCRIPT_DIR}/health-check.sh"

IMAGE_TAG="${1:?Usage: deploy.sh <IMAGE_TAG>}"

# ─── 1. 현재 활성 색상 확인 ──────────────────────────────────
if [ -f "$ACTIVE_COLOR_FILE" ]; then
    CURRENT=$(cat "$ACTIVE_COLOR_FILE")
else
    CURRENT="blue"
    echo "blue" > "$ACTIVE_COLOR_FILE"
fi

if [ "$CURRENT" = "blue" ]; then
    NEXT="green"
else
    NEXT="blue"
fi

echo "=== Folio Deploy ==="
echo "Current: $CURRENT → Next: $NEXT"
echo "Image tag: $IMAGE_TAG"
echo ""

cd "$PROD_DIR"

# ─── 2. Doppler에서 시크릿 다운로드 ─────────────────────────
echo "[deploy] Downloading secrets from Doppler..."
doppler secrets download --project folio --config prd --no-file --format env > .env
echo "IMAGE_TAG=${IMAGE_TAG}" >> .env

# ─── 3. 새 이미지 Pull ──────────────────────────────────────
echo "[deploy] Pulling images for $NEXT..."
docker compose -f docker-compose.yml -f "docker-compose.${NEXT}.yml" --env-file .env pull

# ─── 4. 새 색상 컨테이너 기동 ────────────────────────────────
echo "[deploy] Starting $NEXT containers..."
docker compose -f docker-compose.yml -f "docker-compose.${NEXT}.yml" --env-file .env up -d

# ─── 5. 헬스체크 ─────────────────────────────────────────────
echo "[deploy] Running health checks..."

BACKEND_PORT=$( [ "$NEXT" = "blue" ] && echo 8081 || echo 8082 )
AI_PORT=$( [ "$NEXT" = "blue" ] && echo 8091 || echo 8092 )
WEB_PORT=$( [ "$NEXT" = "blue" ] && echo 3001 || echo 3002 )

HEALTH_FAILED=false

bash "$HEALTH_CHECK" "http://localhost:${BACKEND_PORT}/actuator/health" 30 2 || HEALTH_FAILED=true
bash "$HEALTH_CHECK" "http://localhost:${AI_PORT}/v1/health" 20 2 || HEALTH_FAILED=true
bash "$HEALTH_CHECK" "http://localhost:${WEB_PORT}/healthz" 10 2 || HEALTH_FAILED=true

if [ "$HEALTH_FAILED" = true ]; then
    echo "[deploy] ✗ Health check failed! Rolling back..."
    docker compose -f docker-compose.yml -f "docker-compose.${NEXT}.yml" --env-file .env down
    rm -f .env
    echo "[deploy] $NEXT containers stopped. $CURRENT still active."
    exit 1
fi

# ─── 6. Nginx upstream 전환 ──────────────────────────────────
echo "[deploy] Switching nginx upstream to $NEXT..."
cp "nginx/upstream-${NEXT}.conf" "nginx/upstream-active.conf"
docker compose -f docker-compose.yml exec nginx nginx -s reload

echo "[deploy] Waiting 5s for nginx to stabilize..."
sleep 5

# ─── 7. 이전 색상 종료 ──────────────────────────────────────
echo "[deploy] Stopping $CURRENT containers..."
docker compose -f "docker-compose.${CURRENT}.yml" --env-file .env down || true

# ─── 8. 상태 업데이트 + 정리 ─────────────────────────────────
echo "$NEXT" > "$ACTIVE_COLOR_FILE"
rm -f .env

# 미사용 이미지 정리
docker image prune -f > /dev/null 2>&1 || true

echo ""
echo "=== Deploy Complete ==="
echo "Active: $NEXT (tag: $IMAGE_TAG)"
echo "Previous $CURRENT containers stopped."
