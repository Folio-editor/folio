#!/usr/bin/env bash
# ============================================================
# Folio 개발 환경 완전 초기화 스크립트
# ============================================================
# 대상:
#   - PostgreSQL (앱 데이터 + writer)
#   - PowerSync Service (MongoDB 버킷 메타)
#   - Redis (Refresh Token)
#   - Electron 앱 userData (토큰 · 게스트 UUID · lastKnownWriterId)
#   - Vault: 양 모드 모두 마스터키/토큰 보존 (volume 명시적 보존).
#     SOFT: work 행 TRUNCATE 로 server_encrypted_dek 자동 정리.
#     HARD: pgdata/redis/mongo 볼륨만 삭제, vault 볼륨 유지 + 자동 unseal.
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
VAULT_CONTAINER="storyzip-vault-dev"
PG_USER="storyzip"
PG_DB="storyzip"

# 앱 userData 경로 (플랫폼별)
# 이 디렉토리 안에는 토큰 파일뿐 아니라 Chromium이 관리하는 OPFS(PowerSync SQLite 본체)도 함께 들어있다.
# → 이 디렉토리 전체를 삭제해야 로컬 DB까지 완전 초기화된다.
# 'Folio'      = electron-builder 빌드 배포본 (실 사용자 데이터, 절대 건드리지 않음).
# 'Folio Dev'  = pnpm dev 개발자 모드 (electron 이 ' Dev' suffix 자동 추가) → reset 대상.
detect_app_data() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) echo "${APPDATA}/Folio Dev" ;;
    Darwin)               echo "${HOME}/Library/Application Support/Folio Dev" ;;
    Linux)                echo "${HOME}/.config/Folio Dev" ;;
    *)                    echo "" ;;
  esac
}

# Electron 앱 실행 여부 체크 (파일 락 방지)
is_electron_running() {
  # 'Folio Dev' (개발 모드) 만 감지. 'Folio' 빌드 배포본은 reset 대상 아님.
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      tasklist 2>/dev/null | grep -iE "Folio Dev|electron" >/dev/null
      ;;
    Darwin)
      pgrep -f "Folio Dev|Electron.app" >/dev/null
      ;;
    Linux)
      pgrep -f "Folio Dev|electron" >/dev/null
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
  echo "⚠️  Folio 개발 환경을 초기화합니다."
  echo "   모드:          $([[ $SOFT -eq 1 ]] && echo 'SOFT (TRUNCATE만)' || echo 'HARD (볼륨 삭제)')"
  echo "   PostgreSQL:    $([[ $SOFT -eq 1 ]] && echo 'TRUNCATE' || echo 'DROP VOLUME')"
  echo "   PowerSync:     $([[ $SOFT -eq 1 ]] && echo 'restart' || echo 'DROP VOLUME + restart')"
  echo "   Vault:         보존 (양 모드 모두 마스터키 유지 → VAULT_TOKEN 재발급 불필요)"
  echo "   Redis:         FLUSHDB"
  echo "   앱 userData:   $([[ $NO_APP -eq 1 ]] && echo 'SKIP' || echo 'DELETE')"
  echo "   userData 경로: $(detect_app_data)"
  echo ""
  read -p "계속하려면 'yes' 입력: " CONFIRM
  [[ "$CONFIRM" == "yes" ]] || { echo "취소됨."; exit 1; }
fi

echo ""
echo "==================================================="
echo "Folio 개발 환경 초기화 시작"
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
  # plan 테이블은 ERD 정리 2단계 (2026-05) 로 폐기됨 → 목록에서 제거.
  # plan_note 는 work_id FK 직참조라 별도 명시.
  # episode_chunk / episode_summary / extraction_suggestion 은 AI 인덱싱 산출물 →
  # work CASCADE 로도 정리되지만 명시 (writer FK 가 없어 RESTRICT 회피).
  # work TRUNCATE 시 server_encrypted_dek (Vault wrap 결과) 도 함께 비워짐 — vault
  # 키 자체는 보존되므로 새 작품 생성 시 정상 신규 wrap.
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c "
    TRUNCATE TABLE
      foreshadow_link, plot_episode_link, character_tag, character_custom_field,
      idea_archive, foreshadow, episode_chunk, episode_summary, extraction_suggestion,
      episode, plot, \"character\", character_note, world_note, plan_note, work,
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
  # HARD: 컨테이너 down + 선택적 볼륨 삭제 (vault 데이터는 보존)
  # `docker compose down -v` 는 모든 named volume 을 지워 vault 마스터키도 잃게 됨 →
  # 매번 vault-init.sh + 토큰 재발급 + Doppler 재등록 필요해짐. 따라서:
  #   1) 컨테이너만 down (볼륨 보존)
  #   2) 초기화 대상 볼륨 (pgdata/redis/mongo) 만 명시적으로 rm
  #   3) vault 볼륨은 그대로 → 토큰/마스터키 유지
  echo "[2/5] 컨테이너 down + 선택적 볼륨 삭제 (vault 보존)"
  docker compose -f "$COMPOSE_FILE" down >/dev/null
  # docker compose 가 named volume 에 프로젝트명 prefix 를 자동 추가 (예: dev_).
  # COMPOSE_PROJECT_NAME 또는 compose 디렉토리명에서 추출.
  PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$SCRIPT_DIR")}"
  REMOVED=0
  for vol in storyzip-pgdata-dev storyzip-redis-dev storyzip-mongo-dev; do
    FULL_VOL="${PROJECT_NAME}_${vol}"
    if docker volume inspect "$FULL_VOL" >/dev/null 2>&1; then
      docker volume rm "$FULL_VOL" >/dev/null
      echo "      ✓ removed volume: $FULL_VOL"
      REMOVED=$((REMOVED+1))
    fi
  done
  if [[ $REMOVED -eq 0 ]]; then
    echo "      ⚠️  볼륨 0 개 삭제됨 — 프로젝트명 mismatch 가능성"
    echo "         실제 볼륨: $(docker volume ls --format '{{.Name}}' | grep storyzip | tr '\n' ' ')"
  fi
  echo "      ✓ vault 볼륨 (${PROJECT_NAME}_storyzip-vault-dev) 보존 → VAULT_TOKEN 재발급 불필요"

  echo "[3/5] 인프라 재기동 (Doppler env 주입)"
  # docker compose 출력은 stderr 로 가므로 stdout 만 죽이고 stderr 는 보존 (이전 동작 복원).
  if command -v doppler >/dev/null; then
    (cd "$SCRIPT_DIR" && doppler run -- docker compose -f "$COMPOSE_FILE" up -d) >/dev/null
  else
    (cd "$SCRIPT_DIR" && docker compose -f "$COMPOSE_FILE" up -d) >/dev/null
  fi
  echo "      ✓ up -d 완료"

  # vault 자동 unseal.
  # 진짜 원인: set -euo pipefail 활성 상태에서 폴링 첫 시도의 docker exec 가
  # vault HTTP 미준비로 rc != 0/2 반환 → set -e 가 reset.sh 자체를 종료시킴.
  # 이전 "hang" 으로 보인 것은 silent script termination 이었음.
  # 해결: 폴링 부분만 set +e 로 감싸 fail 흡수.
  if [[ -f "$SCRIPT_DIR/../vault/.init.secrets" ]]; then
    echo "      ⏳ vault 응답 대기..."
    set +e
    READY=0
    for i in $(seq 1 30); do
      out=$(docker exec -e VAULT_ADDR=http://127.0.0.1:8200 storyzip-vault-dev \
              vault status </dev/null 2>&1)
      rc=$?
      if [[ $rc -eq 0 || $rc -eq 2 ]]; then
        READY=1
        break
      fi
      sleep 1
    done
    set -e
    if [[ $READY -ne 1 ]]; then
      echo "      ⚠️  vault 응답 없음 (30s) — 마지막 출력:"
      echo "$out" | sed 's/^/         /'
    else
      echo "      ⏳ vault unseal 시도..."
      set +e
      UNSEAL_OUT=$(timeout 30 bash "$SCRIPT_DIR/../scripts/vault-unseal.sh" </dev/null 2>&1)
      UNSEAL_RC=$?
      set -e
      if [[ $UNSEAL_RC -eq 0 ]]; then
        echo "      ✓ vault unsealed (.init.secrets 자동 사용)"
      else
        echo "      ⚠️  vault unseal 실패 (rc=$UNSEAL_RC):"
        echo "$UNSEAL_OUT" | sed 's/^/         /'
        echo "         → bash infra/scripts/vault-unseal.sh 수동 재시도"
      fi
    fi
  else
    echo "      ⚠️  .init.secrets 없음 — bash infra/scripts/vault-init.sh 실행 필요"
  fi

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

# Vault 컨테이너 상태 (참고용)
if docker ps --format '{{.Names}}' | grep -q "^${VAULT_CONTAINER}$"; then
  if bash "$SCRIPT_DIR/../scripts/vault-status.sh" "$VAULT_CONTAINER" >/dev/null 2>&1; then
    echo "      · vault: unsealed (재초기화 불필요)"
  else
    echo "      · vault: NOT READY (sealed 또는 미초기화)"
    [[ "$SOFT" -ne 1 ]] && echo "        → HARD 리셋으로 데이터 삭제됨. bash infra/scripts/vault-init.sh 재실행 필요"
  fi
else
  echo "      · vault: container down"
fi

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
