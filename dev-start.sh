#!/usr/bin/env bash
# =============================================================
# Folio 개발 서버 일괄 실행 스크립트
#
# 사전 조건:
#   1. Docker 인프라 실행: doppler run -- docker compose -f infra/dev/docker-compose.dev.yml up -d
#      (vault 컨테이너 storyzip-vault-dev 포함 — Vault Transit envelope encryption)
#   2. Vault 최초 1회 초기화: bash infra/scripts/vault-init.sh
#      → 출력된 VAULT_TOKEN 을 doppler dev config 에 등록
#      → infra/vault/.init.secrets 를 안전한 곳으로 이동
#   3. Vault 재기동 시: bash infra/scripts/vault-unseal.sh --interactive
#   4. Doppler CLI 로그인 및 프로젝트 설정 완료
#   5. Doppler AI_SERVER_URL=http://localhost:8001 설정
#   6. 각 디렉토리 의존성 설치 완료 (pnpm install, pip install 등)
#
# 사용법:
#   bash dev-start.sh
#
# 종료:
#   Ctrl+C 로 모든 서버 일괄 종료
# =============================================================

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDS=()

cleanup() {
  echo ""
  echo "========== 모든 서버 종료 중... =========="
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
    fi
  done
  wait 2>/dev/null
  echo "========== 모든 서버 종료 완료 =========="
  exit 0
}

trap cleanup SIGINT SIGTERM

# --- 0. Vault 사전 점검 ---
# backend (FOLIO_VAULT_ENABLED=true 기본) 가 봉인/미초기화 vault 에 대고
# IllegalStateException 으로 fail-fast 하지 않도록 먼저 상태 확인.
echo "[vault]    Checking vault container status..."
if ! bash "$ROOT_DIR/infra/scripts/vault-status.sh" storyzip-vault-dev; then
  echo ""
  echo "[vault] ✗ Vault 가 준비되지 않음. backend 기동 중단."
  echo "        - 컨테이너 안 떠있으면: cd infra/dev && doppler run -- docker compose -f docker-compose.dev.yml up -d"
  echo "        - 미초기화: bash infra/scripts/vault-init.sh"
  echo "        - 봉인: bash infra/scripts/vault-unseal.sh --interactive"
  echo "        - 일회성으로 vault 끄려면: backend/.env 에 FOLIO_VAULT_ENABLED=false"
  echo ""
  exit 1
fi
echo "[vault]    ✓ Vault unsealed"

# --- 1. Spring Backend (port 8080) ---
# Gradle daemon 은 첫 invocation 의 ENV 를 캐시한다 — Doppler 변경 / Vault 토큰 갱신 후에도
# 옛 daemon 에 붙으면 stale ENV 로 부팅되어 INTERNAL_API_KEY 같은 시크릿이 default 로 빠지고
# silent 401 이 발생한다. dev-start 마다 daemon 강제 종료 + --no-daemon 으로 fresh process.
echo "[backend]  Stopping stale Gradle daemon (env cache 방지)..."
(cd "$ROOT_DIR/backend" && cmd //c "gradlew.bat --stop" >/dev/null 2>&1) || true

echo "[backend]  Starting Spring Backend..."
(cd "$ROOT_DIR/backend" && doppler run -- cmd //c "gradlew.bat --no-daemon bootRun --args='--spring.profiles.active=dev'" 2>&1 | tee /tmp/backend.log | sed 's/^/[backend]  /') &
PIDS+=($!)

# --- 2. Landing Page (port 5174) ---
echo "[landing]  Starting Landing Page..."
(cd "$ROOT_DIR/landing" && doppler run -- pnpm dev 2>&1 | sed 's/^/[landing]  /') &
PIDS+=($!)

# --- 3. FastAPI (port 8001) ---
echo "[ai]       Starting FastAPI..."
(cd "$ROOT_DIR/ai" && BACKEND_INTERNAL_URL=http://localhost:8080 doppler run -- .venv/Scripts/python -m uvicorn app.main:app --reload --port 8001 2>&1 | sed 's/^/[ai]       /') &
PIDS+=($!)

# --- 4. Celery Worker ---
echo "[celery]   Starting Celery Worker..."
(cd "$ROOT_DIR/ai" && BACKEND_INTERNAL_URL=http://localhost:8080 doppler run -- .venv/Scripts/python -m celery -A app.celery_app worker --loglevel=info --pool=solo -Q indexing,celery,agent -n dev-worker@%h 2>&1 | sed 's/^/[celery]   /') &
PIDS+=($!)

# --- 5. Web Editor (port 5173) — 브라우저용 ---
echo "[web]      Starting Web Editor..."
(cd "$ROOT_DIR/frontend" && doppler run -- pnpm dev:web 2>&1 | sed 's/^/[web]      /') &
PIDS+=($!)

echo ""
echo "========== 6개 서버 실행 중 (Ctrl+C로 일괄 종료) =========="
echo "  [backend]  Spring Backend     :8080"
echo "  [landing]  Landing Page       :5174"
echo "  [web]      Web Editor         :5173"
echo "  [frontend] Frontend Electron  (포그라운드)"
echo "  [ai]       FastAPI            :8001"
echo "  [celery]   Celery Worker"
echo "=========================================================="
echo ""

# --- 6. Frontend Electron App (포그라운드 실행 — GUI 윈도우 표시 필요) ---
echo "[frontend] Starting Frontend App (foreground)..."
cd "$ROOT_DIR/frontend" && doppler run -- pnpm dev
