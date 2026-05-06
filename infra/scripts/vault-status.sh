#!/usr/bin/env bash
# Vault 컨테이너 상태 점검 (curious-wiggling-thacker plan V-1).
# - 미초기화 (initialized=false) 또는 봉인 (sealed=true) 시 exit 1
# - backend 기동 전에 호출하여 Vault 미준비 상태에서의 fail-fast 회피
#
# 사용법:
#   bash infra/scripts/vault-status.sh [container-name]
# 기본 컨테이너: folio-vault-prod (prod), 인자로 storyzip-vault-dev 등 지정 가능

set -euo pipefail

# 인자로 명시 우선, 없으면 자동 감지 (prod 우선, 없으면 dev).
if [[ -n "${1:-}" ]]; then
  CONTAINER="$1"
elif docker ps --format '{{.Names}}' | grep -q '^folio-vault-prod$'; then
  CONTAINER="folio-vault-prod"
elif docker ps --format '{{.Names}}' | grep -q '^storyzip-vault-dev$'; then
  CONTAINER="storyzip-vault-dev"
else
  CONTAINER="folio-vault-prod"  # 자동 감지 실패 시 기본값 — 아래에서 not-running 처리
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "[vault-status] ✗ container '${CONTAINER}' not running"
  exit 1
fi

# /v1/sys/health: 200=unsealed/active, 429=standby, 472=DR replication secondary,
#                 473=performance standby, 501=not initialized, 503=sealed
# wget 가 503/501 받으면 exit code != 0 → set -e + pipefail 이 스크립트 종료시킴.
# 명시적으로 || true 로 흡수 + sealed/uninitialized 상태도 정상 분기 도달.
set +e
# wget --server-response 의 stderr 에 다양한 헤더가 섞여 awk $2 가 잘못된 값을 잡는 경우가 있다.
# grep 으로 HTTP 응답 라인만 정확히 추출 후 status code 만 분리.
HTTP_CODE=$(MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' docker exec "$CONTAINER" \
  wget -qO- --server-response --tries=1 \
  "http://127.0.0.1:8200/v1/sys/health?standbycode=200&sealedcode=503&uninitcode=501" 2>&1 \
  | grep -oE 'HTTP/[0-9.]+ [0-9]{3}' | tail -1 | awk '{print $2}')
set -e

case "$HTTP_CODE" in
  200)
    echo "[vault-status] ✓ ${CONTAINER} unsealed/active"
    exit 0
    ;;
  501)
    echo "[vault-status] ✗ ${CONTAINER} NOT INITIALIZED"
    echo "  → 최초 1회: bash infra/scripts/vault-init.sh"
    exit 1
    ;;
  503)
    echo "[vault-status] ✗ ${CONTAINER} SEALED"
    echo "  → 운영자 unseal 필요: bash infra/scripts/vault-unseal.sh --interactive"
    exit 1
    ;;
  *)
    echo "[vault-status] ✗ ${CONTAINER} unexpected status: ${HTTP_CODE:-no_response}"
    exit 1
    ;;
esac
