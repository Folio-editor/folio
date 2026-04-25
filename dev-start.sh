#!/usr/bin/env bash
# =============================================================
# Folio 개발 서버 일괄 실행 스크립트
#
# 사전 조건:
#   1. Docker 인프라 실행: doppler run -- docker compose -f infra/dev/docker-compose.dev.yml up -d
#   2. Doppler CLI 로그인 및 프로젝트 설정 완료
#   3. Doppler AI_SERVER_URL=http://localhost:8001 설정
#   4. 각 디렉토리 의존성 설치 완료 (pnpm install, pip install 등)
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

# --- 1. Spring Backend (port 8080) ---
echo "[backend]  Starting Spring Backend..."
(cd "$ROOT_DIR/backend" && doppler run -p folio -c dev -- cmd //c "gradlew.bat bootRun --args='--spring.profiles.active=dev'" 2>&1 | sed 's/^/[backend]  /') &
PIDS+=($!)

# --- 2. Landing Page (port 5174) ---
echo "[landing]  Starting Landing Page..."
(cd "$ROOT_DIR/landing" && doppler run -p folio -c dev -- pnpm dev 2>&1 | sed 's/^/[landing]  /') &
PIDS+=($!)

# --- 3. FastAPI (port 8001) ---
echo "[ai]       Starting FastAPI..."
(cd "$ROOT_DIR/ai" && doppler run -p folio -c dev -- .venv/Scripts/python -m uvicorn app.main:app --reload --port 8001 2>&1 | sed 's/^/[ai]       /') &
PIDS+=($!)

# --- 4. Celery Worker ---
echo "[celery]   Starting Celery Worker..."
(cd "$ROOT_DIR/ai" && doppler run -p folio -c dev -- .venv/Scripts/python -m celery -A app.celery_app worker --loglevel=info --pool=solo 2>&1 | sed 's/^/[celery]   /') &
PIDS+=($!)

# --- 5. Web Editor (port 5173) — 브라우저용 ---
echo "[web]      Starting Web Editor..."
(cd "$ROOT_DIR/frontend" && doppler run -p folio -c dev -- pnpm dev:web 2>&1 | sed 's/^/[web]      /') &
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
cd "$ROOT_DIR/frontend" && doppler run -p folio -c dev -- pnpm dev
