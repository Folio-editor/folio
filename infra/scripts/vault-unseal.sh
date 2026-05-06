#!/usr/bin/env bash
# Vault unseal 스크립트 (재기동 시).
# - infra/vault/.init.secrets 에서 unseal key 3개 읽어 봉인 해제
# - 운영 환경: .init.secrets 가 EC2 에 없는 게 정상 — 운영자가 unseal key 를
#   대화형으로 직접 입력하거나, USB/별도 서버에서 임시 복사해 사용
#
# 사용법:
#   bash infra/scripts/vault-unseal.sh                # .init.secrets 자동 사용
#   bash infra/scripts/vault-unseal.sh --interactive  # 키 직접 입력

set -euo pipefail

# 컨테이너 자동 감지 (vault-init.sh 와 동일 규칙).
if [[ -n "${VAULT_CONTAINER:-}" ]]; then
  :
elif docker ps --format '{{.Names}}' | grep -q '^folio-vault-prod$'; then
  VAULT_CONTAINER="folio-vault-prod"
elif docker ps --format '{{.Names}}' | grep -q '^storyzip-vault-dev$'; then
  VAULT_CONTAINER="storyzip-vault-dev"
else
  echo "[ERROR] vault 컨테이너가 떠있지 않음."
  exit 1
fi
SECRETS_FILE="$(dirname "$0")/../vault/.init.secrets"

# MSYS_NO_PATHCONV=1: Git Bash 의 슬래시 path conversion 차단 (base64 키 보호).
# unseal.sh 는 stdin 받는 명령 (heredoc) 없으므로 함수에 </dev/null 넣어도 OK 지만,
# init.sh 와 일관성을 위해 함수 외부에서 호출처별 명시.
vault_exec() {
  MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' \
    docker exec -e VAULT_ADDR=http://127.0.0.1:8200 "$VAULT_CONTAINER" vault "$@"
}

# JSON 파싱: python3 (Microsoft Store stub launcher 가 hang 위험) 대신 순수 bash + grep/sed.
# .init.secrets 형식이 한 줄에 하나씩 들어있어 grep 만으로 추출 가능.
extract_unseal_key() {
  local idx=$1
  # "unseal_keys_b64" array 의 idx 번째 base64 문자열 추출.
  # 라인 형식: '    "8UuAW...",'  → quotes·trailing comma·whitespace 제거.
  grep -oE '"[A-Za-z0-9+/=]{40,}"' "$SECRETS_FILE" | sed 's/^"//;s/"$//' | sed -n "$((idx+1))p"
}

if [[ "${1:-}" == "--interactive" ]] || [[ ! -f "$SECRETS_FILE" ]]; then
  echo "Unseal key 3 개 입력 (분산 보관처에서 가져올 것):"
  for i in 1 2 3; do
    read -rsp "  [$i/3] key: " KEY
    echo
    vault_exec operator unseal "$KEY" >/dev/null
  done
else
  echo "[!] $SECRETS_FILE 를 사용해 unseal — 운영 환경에선 이 파일이 EC2 에 있으면 안 됨"
  for i in 0 1 2; do
    KEY=$(extract_unseal_key "$i")
    if [[ -z "$KEY" ]]; then
      echo "[ERROR] unseal_keys_b64[$i] 추출 실패 — .init.secrets 형식 확인"
      exit 1
    fi
    vault_exec operator unseal "$KEY" >/dev/null
  done
fi

vault_exec status | grep -E "^Sealed" || true
echo "✅ unseal 완료"
