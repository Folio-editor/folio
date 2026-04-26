#!/usr/bin/env bash
# ============================================================
# Folio — 공용 인프라 초기 기동 스크립트
#
# CI/CD로 교체되지 않는 고정 서비스를 한 번에 올린다:
#   PostgreSQL, Redis, MongoDB, PowerSync, Nginx, Certbot
#
# 사용법 (EC2에서):
#   cd /opt/folio/S14P31F203
#   bash infra/scripts/infra-up.sh
#
# 필수:
#   - Doppler CLI 설치 + 로그인 완료
#   - Docker / Docker Compose v2
#   - /opt/folio/data/ 디렉토리 존재
# ============================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROD_DIR="$REPO_ROOT/infra/prod"

echo "=== Folio 공용 인프라 기동 ==="
echo "레포: $REPO_ROOT"
echo "Compose: $PROD_DIR"
echo ""

# ── 1. 사전 체크 ──────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "❌ docker 미설치"; exit 1
fi
if ! command -v doppler &>/dev/null; then
  echo "❌ doppler CLI 미설치"; exit 1
fi

# ── 2. 데이터 디렉토리 생성 ───────────────────────────────
echo "[1/6] 데이터 디렉토리 확인..."
sudo mkdir -p /opt/folio/data/{postgresql,redis,mongodb,certbot/conf,certbot/www,loki,grafana,promtail-positions}
# PLG 컨테이너가 사용하는 공식 UID로 권한 부여
sudo chown -R 10001:10001 /opt/folio/data/loki
sudo chown -R 472:472 /opt/folio/data/grafana
echo "      ✓ /opt/folio/data/ 준비 완료"

# ── 3. Doppler에서 .env 다운로드 ──────────────────────────
echo "[2/6] Doppler prd 시크릿 다운로드..."
cd "$PROD_DIR"
doppler secrets download --project folio --config prd --no-file --format env > .env
echo "      ✓ .env 생성 완료"

# ── 4. upstream-active.conf 초기화 ────────────────────────
echo "[3/6] Nginx upstream 초기화..."
if [ ! -f nginx/upstream-active.conf ]; then
  cp nginx/upstream-blue.conf nginx/upstream-active.conf
  echo "      ✓ upstream-active.conf → blue 초기화"
else
  echo "      ✓ upstream-active.conf 이미 존재"
fi

# ── 5. active-color 초기화 ────────────────────────────────
if [ ! -f /opt/folio/active-color ]; then
  echo "blue" > /opt/folio/active-color
  echo "      ✓ active-color → blue 초기화"
fi

# ── 6. 공용 인프라 기동 ───────────────────────────────────
echo "[4/6] 공용 서비스 기동 (PostgreSQL, Redis, MongoDB, PowerSync, Nginx, Certbot)..."
docker compose -f docker-compose.yml --env-file .env up -d
echo "      ✓ docker compose up 완료"

# ── 7. 헬스체크 대기 ──────────────────────────────────────
echo "[5/6] 헬스체크 대기..."

# PostgreSQL
for i in $(seq 1 30); do
  if docker exec folio-postgresql-prod pg_isready -U "$(grep '^DB_USERNAME=' .env | cut -d= -f2)" &>/dev/null; then
    echo "      ✓ PostgreSQL ready (${i}s)"
    break
  fi
  [ $i -eq 30 ] && { echo "      ❌ PostgreSQL 30초 내 기동 실패"; }
  sleep 1
done

# Redis
for i in $(seq 1 15); do
  if docker exec folio-redis-prod redis-cli -a "$(grep '^REDIS_PASSWORD=' .env | cut -d= -f2)" ping &>/dev/null; then
    echo "      ✓ Redis ready (${i}s)"
    break
  fi
  [ $i -eq 15 ] && { echo "      ❌ Redis 15초 내 기동 실패"; }
  sleep 1
done

# PowerSync (호스트 포트 미노출이므로 컨테이너 healthcheck 상태로 확인)
for i in $(seq 1 60); do
  if [ "$(docker inspect -f '{{.State.Health.Status}}' folio-powersync-prod 2>/dev/null)" = "healthy" ]; then
    echo "      ✓ PowerSync ready (${i}s)"
    break
  fi
  [ $i -eq 60 ] && { echo "      ⚠️  PowerSync 60초 내 기동 실패 — 로그 확인 필요"; }
  sleep 1
done

# ── 8. 정리 ───────────────────────────────────────────────
echo "[6/6] .env 정리..."
rm -f .env
echo "      ✓ .env 삭제 완료"

echo ""
echo "==================================================="
echo "✅ 공용 인프라 기동 완료"
echo "==================================================="
echo ""
echo "서비스 상태 확인:  docker compose -f $PROD_DIR/docker-compose.yml ps"
echo "다음 단계:         master 브랜치 push → CI/CD가 앱 서비스 자동 배포"
echo ""
