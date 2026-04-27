#!/usr/bin/env bash
# ============================================================
# StoryZip 개발 환경 완전 초기화 스크립트
# ============================================================
# 대상:
#   - PostgreSQL (앱 데이터 + writer)
#   - PowerSync Service (MongoDB 버킷 메타)
#   - Redis (Refresh Token)
#   - Electron 앱 userData (토큰 · 게스트 UUID · lastKnownWriterId)
#
# 사용법:
#   ./reset.sh              # 확인 프롬프트 + 전체 초기화
#   ./reset.sh --yes        # 프롬프트 생략 (CI/자동화용)
#   ./reset.sh --soft       # TRUNCATE만 (볼륨 유지, 더 빠름)
#   ./reset.sh --no-app     # 앱 userData는 건드리지 않음
#
# 필수:
#   - Git Bash / WSL / macOS / Linux
#   - Docker Compose v2
#   - Doppler CLI (env 주입)
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.dev.yml"
INIT_SH="$SCRIPT_DIR/../db/powersync-init.sh"

PG_CONTAINER="storyzip-postgresql-dev"
REDIS_CONTAINER="storyzip-redis-dev"
PS_CONTAINER="storyzip-powersync-dev"
PG_USER="storyzip"
PG_DB="storyzip"

# 앱 userData 경로 (플랫폼별)
# 이 디렉토리 안에는 토큰 파일뿐 아니라 Chromium이 관리하는 OPFS(PowerSync SQLite 본체)도 함께 들어있다.
# → 이 디렉토리 전체를 삭제해야 로컬 DB까지 완전 초기화된다.
detect_app_data() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) echo "${APPDATA}/storyzip-front" ;;
    Darwin)               echo "${HOME}/Library/Application Support/storyzip-front" ;;
    Linux)                echo "${HOME}/.config/storyzip-front" ;;
    *)                    echo "" ;;
  esac
}

# Electron 앱 실행 여부 체크 (파일 락 방지)
is_electron_running() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      tasklist 2>/dev/null | grep -i "storyzip\|electron" >/dev/null
      ;;
    Darwin)
      pgrep -f "storyzip-front\|Electron.app" >/dev/null
      ;;
    Linux)
      pgrep -f "storyzip-front\|electron" >/dev/null
      ;;
    *) return 1 ;;
  esac
}

SOFT=0
NO_APP=0
YES=0
for arg in "$@"; do
  case "$arg" in
    --soft)   SOFT=1 ;;
    --no-app) NO_APP=1 ;;
    --yes|-y) YES=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

# ── 사전 체크 ──────────────────────────────────────────────
if ! command -v docker >/dev/null; then
  echo "❌ docker CLI 없음"; exit 1
fi
if ! command -v doppler >/dev/null; then
  echo "⚠️  doppler CLI 없음 — env 주입 실패 가능"
fi

# ── 확인 프롬프트 ──────────────────────────────────────────
if [[ "$YES" -ne 1 ]]; then
  echo ""
  echo "⚠️  StoryZip 개발 환경을 초기화합니다."
  echo "   모드:          $([[ $SOFT -eq 1 ]] && echo 'SOFT (TRUNCATE만)' || echo 'HARD (볼륨 삭제)')"
  echo "   PostgreSQL:    $([[ $SOFT -eq 1 ]] && echo 'TRUNCATE' || echo 'DROP VOLUME')"
  echo "   PowerSync:     $([[ $SOFT -eq 1 ]] && echo 'restart' || echo 'DROP VOLUME + restart')"
  echo "   Redis:         FLUSHDB"
  echo "   앱 userData:   $([[ $NO_APP -eq 1 ]] && echo 'SKIP' || echo 'DELETE')"
  echo "   userData 경로: $(detect_app_data)"
  echo ""
  read -p "계속하려면 'yes' 입력: " CONFIRM
  [[ "$CONFIRM" == "yes" ]] || { echo "취소됨."; exit 1; }
fi

echo ""
echo "==================================================="
echo "StoryZip 개발 환경 초기화 시작"
echo "==================================================="

# ── 1. Electron 앱 userData 삭제 (OPFS 포함) ───────────────
if [[ "$NO_APP" -ne 1 ]]; then
  if is_electron_running; then
    echo "❌ Electron 앱이 실행 중입니다."
    echo "   OPFS 파일 락으로 로컬 SQLite가 완전 삭제되지 않습니다."
    echo "   앱 종료 후 다시 실행하세요. (--no-app 쓰면 이 단계 스킵)"
    exit 1
  fi
  APP_DATA=$(detect_app_data)
  if [[ -n "$APP_DATA" && -d "$APP_DATA" ]]; then
    echo "[1/5] 앱 userData 삭제: $APP_DATA"
    echo "      (토큰·게스트ID·lastWriterID·OPFS SQLite·IndexedDB 포함)"
    rm -rf "$APP_DATA"
    if [[ -d "$APP_DATA" ]]; then
      echo "      ⚠️  일부 파일 삭제 실패 — 앱이 아직 실행 중인지 확인하세요"
    else
      echo "      ✓ 삭제 완료"
    fi
  else
    echo "[1/5] 앱 userData 없음 — 스킵"
  fi
else
  echo "[1/5] 앱 userData — 스킵 (--no-app)"
  echo "      ⚠️  로컬 OPFS SQLite는 보존됩니다."
  echo "         HARD 리셋 후 앱 기동하면 ps_crud 큐가 서버로 재업로드되어"
  echo "         삭제한 데이터가 되살아날 수 있습니다."
  echo "         필요 시 DevTools Console에서:"
  echo "           await __db.disconnectAndClear()"
fi

# ── 2. 데이터베이스 초기화 ─────────────────────────────────
if [[ "$SOFT" -eq 1 ]]; then
  # SOFT: TRUNCATE만
  echo "[2/5] PostgreSQL TRUNCATE"
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c "
    TRUNCATE TABLE
      foreshadow_link, plot_episode_link, character_tag, character_custom_field,
      idea_archive, foreshadow, episode, plot, \"character\", world_note, plan, work,
      writer
    RESTART IDENTITY CASCADE;
  " >/dev/null
  echo "      ✓ TRUNCATE 완료"

  echo "[3/5] PowerSync Service 재시작"
  docker compose -f "$COMPOSE_FILE" restart powersync >/dev/null
  echo "      ✓ restart 완료"

  echo "[4/5] Redis FLUSHDB"
  docker exec "$REDIS_CONTAINER" redis-cli FLUSHDB >/dev/null
  echo "      ✓ FLUSHDB 완료"
else
  # HARD: 볼륨 통째 삭제 후 재생성
  echo "[2/5] 컨테이너 + 볼륨 전체 삭제"
  docker compose -f "$COMPOSE_FILE" down -v >/dev/null
  echo "      ✓ down -v 완료"

  echo "[3/5] 인프라 재기동 (Doppler env 주입)"
  if command -v doppler >/dev/null; then
    # --project / --config 명시 — 사용자 머신의 doppler setup 캐시(legacy 'storyzip' 등)와 무관하게 동작
    (cd "$SCRIPT_DIR" && doppler run --project folio --config dev -- docker compose -f "$COMPOSE_FILE" up -d) >/dev/null
  else
    (cd "$SCRIPT_DIR" && docker compose -f "$COMPOSE_FILE" up -d) >/dev/null
  fi
  echo "      ✓ up -d 완료"

  echo "[4/5] PostgreSQL init 대기"
  for i in {1..30}; do
    if docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
      echo "      ✓ PostgreSQL ready"
      break
    fi
    sleep 1
    [[ $i -eq 30 ]] && { echo "❌ PostgreSQL 30초 내 기동 실패"; exit 1; }
  done
fi

# ── 5. 검증 ────────────────────────────────────────────────
echo "[5/5] 검증"

# PowerSync 헬스체크 (최대 30초 대기)
for i in {1..30}; do
  if curl -sf http://127.0.0.1:8090/probes/readiness >/dev/null 2>&1; then
    echo "      ✓ PowerSync readiness OK"
    break
  fi
  sleep 1
  [[ $i -eq 30 ]] && echo "      ⚠️  PowerSync 30초 내 readiness 실패 — 로그 확인 필요"
done

# Replication slot
SLOT_COUNT=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -At -c \
  "SELECT count(*) FROM pg_replication_slots;" 2>/dev/null || echo "0")
echo "      · replication slots: $SLOT_COUNT"

# Publication 테이블 수
PUB_COUNT=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -At -c \
  "SELECT count(*) FROM pg_publication_tables WHERE pubname='powersync';" 2>/dev/null || echo "0")
echo "      · publication tables: $PUB_COUNT (기대: 12)"

# 앱 테이블 데이터 개수
WORK_COUNT=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -At -c \
  "SELECT count(*) FROM work;" 2>/dev/null || echo "0")
WRITER_COUNT=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -At -c \
  "SELECT count(*) FROM writer;" 2>/dev/null || echo "0")
echo "      · work rows: $WORK_COUNT / writer rows: $WRITER_COUNT"

echo ""
echo "==================================================="
echo "✅ 초기화 완료"
echo "==================================================="
echo ""
echo "다음 단계:"
echo "  1. Electron 앱 기동:  cd frontend && pnpm dev"
echo "  2. Google 로그인 (신규 가입자 경로)"
echo "  3. DevTools Console — useAuthStore.getState()"
echo ""
