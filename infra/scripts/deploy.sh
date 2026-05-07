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
set -Eeuo pipefail
trap 'echo "[FATAL] Deploy failed at line $LINENO (exit=$?)" >&2' ERR

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

# ─── 1.5. PLG 데이터 디렉토리 보장 ─────────────────────────
# Loki/Grafana/Promtail 컨테이너가 처음 기동될 때 필요한 디렉토리와
# 권한을 자동으로 준비한다 (idempotent — 이미 있으면 무시).
sudo mkdir -p /opt/folio/data/{loki,grafana,promtail-positions}
sudo chown -R 10001:10001 /opt/folio/data/loki
sudo chown -R 472:472 /opt/folio/data/grafana

# Vault 데이터 디렉토리 (curious-wiggling-thacker plan V-1).
# 컨테이너는 root 로 실행되지만 데이터 디렉토리 권한 명시 (idempotent).
# 최초 1회: bash infra/scripts/vault-init.sh 실행 후 출력 토큰을 Doppler 에 등록할 것.
sudo mkdir -p /opt/folio/data/vault
sudo chmod 700 /opt/folio/data/vault

# ─── 2. Doppler에서 시크릿 다운로드 ─────────────────────────
echo "[deploy] Downloading secrets from Doppler..."
doppler secrets download --project folio --config prd --no-file --format env > .env
echo "IMAGE_TAG=${IMAGE_TAG}" >> .env

# ─── 3. 새 이미지 Pull ──────────────────────────────────────
echo "[deploy] Pulling images for $NEXT..."
docker compose -f docker-compose.yml -f "docker-compose.${NEXT}.yml" --env-file .env pull

# ─── 4. 새 색상 컨테이너 기동 ────────────────────────────────
# Vault 컨테이너는 base compose 에 정의되어 있어 자동 기동되지만,
# 최초 기동 시 미초기화/봉인 상태 → backend (FOLIO_VAULT_ENABLED=true) 가 즉시 fail-fast.
# 운영자가 vault-init.sh / vault-unseal.sh 를 먼저 실행해야 한다는 사실을 명시.
echo "[deploy] Ensuring vault container is up..."
docker compose -f docker-compose.yml -f "docker-compose.${NEXT}.yml" --env-file .env up -d vault < /dev/null
sleep 3
if ! bash "${SCRIPT_DIR}/vault-status.sh" folio-vault-prod; then
  echo ""
  echo "[deploy] ✗ Vault 가 준비되지 않음. backend 기동 중단."
  echo "        최초 1회: ssh ec2 → bash /opt/folio/S14P31F203/infra/scripts/vault-init.sh"
  echo "        재기동:   ssh ec2 → bash /opt/folio/S14P31F203/infra/scripts/vault-unseal.sh --interactive"
  echo "        그 후 deploy 재시도."
  exit 2
fi

echo "[deploy] Starting $NEXT containers..."
docker compose -f docker-compose.yml -f "docker-compose.${NEXT}.yml" --env-file .env up -d

# ─── 5. 헬스체크 ─────────────────────────────────────────────
echo "[deploy] Running health checks..."

BACKEND_PORT=$( [ "$NEXT" = "blue" ] && echo 8081 || echo 8082 )
AI_PORT=$( [ "$NEXT" = "blue" ] && echo 8091 || echo 8092 )
WEB_PORT=$( [ "$NEXT" = "blue" ] && echo 3001 || echo 3002 )
LANDING_PORT=$( [ "$NEXT" = "blue" ] && echo 3011 || echo 3012 )
CELERY_CONTAINER="folio-celery-worker-${NEXT}"

HEALTH_FAILED=false

bash "$HEALTH_CHECK" "http://localhost:${BACKEND_PORT}/actuator/health" 30 2 || HEALTH_FAILED=true
bash "$HEALTH_CHECK" "http://localhost:${AI_PORT}/v1/health" 20 2 || HEALTH_FAILED=true
bash "$HEALTH_CHECK" "http://localhost:${WEB_PORT}/healthz" 10 2 || HEALTH_FAILED=true

# Celery worker (HTTP 엔드포인트 없음 — docker exec로 broker ping)
if [ "$HEALTH_FAILED" = false ]; then
    echo "[deploy] Checking celery worker..."
    CELERY_OK=false
    for i in $(seq 1 10); do
        if docker exec "$CELERY_CONTAINER" celery -A app.celery_app inspect ping -t 5 > /dev/null 2>&1; then
            echo "[deploy] Celery worker healthy (attempt $i)"
            CELERY_OK=true
            break
        fi
        echo "[deploy] Celery attempt $i/10 - waiting 3s..."
        sleep 3
    done
    if [ "$CELERY_OK" = false ]; then
        echo "[deploy] Celery worker health check failed!"
        HEALTH_FAILED=true
    fi
fi

# Landing page
bash "$HEALTH_CHECK" "http://localhost:${LANDING_PORT}/healthz" 10 2 || HEALTH_FAILED=true

if [ "$HEALTH_FAILED" = true ]; then
    echo "[deploy] ✗ Health check failed! Rolling back..."
    docker compose -f docker-compose.yml -f "docker-compose.${NEXT}.yml" --env-file .env \
        rm -sf "spring-boot-${NEXT}" "fastapi-${NEXT}" "celery-worker-${NEXT}" "react-web-${NEXT}" "landing-${NEXT}"
    rm -f .env
    echo "[deploy] $NEXT containers stopped. $CURRENT still active."
    exit 1
fi

# ─── 6. Nginx upstream 전환 ──────────────────────────────────
echo "[deploy] Switching nginx upstream to $NEXT..."
cp "nginx/upstream-${NEXT}.conf" "nginx/upstream-active.conf"
# docker compose exec는 stdin attach로 heredoc 시나리오에서 stdin을 소비하는 버그가 있음.
# 여기는 로컬 실행이지만 일관성을 위해 docker exec 직접 사용.
docker exec folio-nginx nginx -s reload

# ─── 7. 원자성: 트래픽 전환 직후 즉시 상태 기록 ────────────────
# (중간 단계에서 실패해도 active-color 파일이 실제 트래픽 방향과 일치하도록)
echo "$NEXT" > "$ACTIVE_COLOR_FILE"

echo "[deploy] Waiting 5s for nginx to stabilize..."
sleep 5

# ─── 8. 이전 색상 종료 ──────────────────────────────────────
echo "[deploy] Stopping $CURRENT containers..."
docker compose -f docker-compose.yml -f "docker-compose.${CURRENT}.yml" --env-file .env \
    rm -sf "spring-boot-${CURRENT}" "fastapi-${CURRENT}" "celery-worker-${CURRENT}" "react-web-${CURRENT}" "landing-${CURRENT}" \
    || echo "[deploy] Warning: failed to stop ${CURRENT} containers"

# ─── 9. 정리 ──────────────────────────────────────────────
rm -f .env

# 미사용 이미지 정리
docker image prune -f > /dev/null 2>&1 || true

echo ""
echo "=== Deploy Complete ==="
echo "Active: $NEXT (tag: $IMAGE_TAG)"
echo "Previous $CURRENT containers stopped."
