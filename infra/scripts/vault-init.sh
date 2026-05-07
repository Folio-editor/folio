#!/usr/bin/env bash
# Vault 최초 초기화 스크립트.
# - vault operator init 으로 root token + unseal key 5개 발급
# - 5개 중 3개로 unseal
# - Transit Engine 활성화 + folio-work-dek 키 생성
# - 백엔드용 정책/토큰 발급 (encrypt/decrypt 만 허용)
#
# 사용법 (docker compose up 직후 1회):
#   bash infra/scripts/vault-init.sh
#
# 출력:
#   - root token + unseal key 5개 → infra/vault/.init.secrets (gitignore 필수)
#   - 백엔드용 토큰 → stdout (.env 의 VAULT_TOKEN 으로 복사)
#
# 운영 주의:
#   - infra/vault/.init.secrets 는 즉시 EC2 외부 (운영자 노트북·USB) 로 옮기고 EC2 에선 삭제
#   - unseal key 5개 중 3개 모이면 unseal 가능 — 분산 보관

set -euo pipefail

# 컨테이너 자동 감지: prod (folio-vault-prod) 우선, 없으면 dev (storyzip-vault-dev).
# 환경변수 VAULT_CONTAINER 로 명시도 가능.
if [[ -n "${VAULT_CONTAINER:-}" ]]; then
  : # 사용자 지정 우선
elif docker ps --format '{{.Names}}' | grep -q '^folio-vault-prod$'; then
  VAULT_CONTAINER="folio-vault-prod"
elif docker ps --format '{{.Names}}' | grep -q '^storyzip-vault-dev$'; then
  VAULT_CONTAINER="storyzip-vault-dev"
else
  echo "[ERROR] vault 컨테이너가 떠있지 않음. 먼저 docker compose up -d vault 실행."
  exit 1
fi
echo "[init] target container: $VAULT_CONTAINER"
SECRETS_FILE="$(dirname "$0")/../vault/.init.secrets"

# MSYS_NO_PATHCONV=1: Git Bash 가 슬래시로 시작하는 인자 (예: base64 unseal key '/GIES...')
# 를 Windows 경로로 자동 변환하는 동작 차단. Linux/macOS 에선 무해 (변수 무시).
# </dev/null 은 heredoc (policy write) 를 끊어버리므로 함수에 박지 않음.
# 호출처 중 stdin 을 받아야 하는 명령 (policy write -) 는 그대로,
# stdin 이 필요 없는 명령은 호출 시점에 </dev/null 명시.
vault_exec() {
  MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' \
    docker exec -e VAULT_ADDR=http://127.0.0.1:8200 "$VAULT_CONTAINER" vault "$@"
}
# stdin 을 컨테이너에 전달해야 하는 경우 (vault policy write -, vault login - 등)
# docker exec -i 필수. 없으면 stdin 가 컨테이너로 안 들어가 빈 값 처리됨.
vault_exec_stdin() {
  MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' \
    docker exec -i -e VAULT_ADDR=http://127.0.0.1:8200 "$VAULT_CONTAINER" vault "$@"
}

if vault_exec status >/dev/null 2>&1; then
  status=$(vault_exec status -format=json 2>/dev/null || true)
  initialized=$(echo "$status" | grep -o '"initialized":[^,}]*' | head -n1 | cut -d: -f2 | tr -d ' ')
  if [[ "$initialized" == "true" ]]; then
    echo "[ERROR] Vault 가 이미 초기화됨. 재초기화하려면 컨테이너 + 볼륨 (storyzip-vault-dev) 삭제 후 재시도."
    exit 1
  fi
fi

echo "[1/4] vault operator init ..."
init_json=$(vault_exec operator init -key-shares=5 -key-threshold=3 -format=json)
echo "$init_json" > "$SECRETS_FILE"
chmod 600 "$SECRETS_FILE"
echo "  → $SECRETS_FILE 저장 (즉시 EC2 외부로 옮길 것)"

# JSON 파싱: python3 (Microsoft Store stub 가 hang 위험) 대신 순수 bash + grep/sed.
# .init.secrets 형식은 vault operator init 출력 그대로라 한 줄에 하나씩 들어있음.
extract_b64() {
  # 인덱스 idx 의 base64 문자열 (40자 이상) 추출
  local idx=$1
  grep -oE '"[A-Za-z0-9+/=]{40,}"' "$SECRETS_FILE" | sed 's/^"//;s/"$//' | sed -n "$((idx+1))p"
}
extract_root_token() {
  grep -oE '"root_token"[[:space:]]*:[[:space:]]*"[^"]+"' "$SECRETS_FILE" \
    | sed 's/.*"\([^"]*\)"$/\1/'
}

ROOT_TOKEN=$(extract_root_token)

echo "[2/4] unseal (3/5)..."
for i in 0 1 2; do
  KEY=$(extract_b64 "$i")
  if [[ -z "$KEY" ]]; then echo "[ERROR] unseal key[$i] 추출 실패"; exit 1; fi
  vault_exec operator unseal "$KEY" >/dev/null
done
echo "  → unseal 완료"

echo "[3/4] Transit Engine + folio-work-dek 키 생성..."
vault_exec login "$ROOT_TOKEN" >/dev/null
vault_exec secrets enable transit >/dev/null 2>&1 || echo "  (transit 이미 활성)"
vault_exec write -f transit/keys/folio-work-dek >/dev/null
echo "  → transit/keys/folio-work-dek 생성"

echo "[4/4] 백엔드 정책 + 토큰 발급..."
vault_exec_stdin policy write folio-backend - <<'EOF' >/dev/null
path "transit/encrypt/folio-work-dek" {
  capabilities = ["update"]
}
path "transit/decrypt/folio-work-dek" {
  capabilities = ["update"]
}
EOF

BACKEND_TOKEN=$(vault_exec token create -policy=folio-backend -ttl=8760h -renewable=true -format=json \
  | grep -oE '"client_token"[[:space:]]*:[[:space:]]*"[^"]+"' \
  | sed 's/.*"\([^"]*\)"$/\1/' | tr -d '\r\n')

cat <<EOF

================================================================
✅ Vault 초기화 완료

VAULT_TOKEN (백엔드용 — .env 에 복사):
  $BACKEND_TOKEN

다음 단계:
  1) $SECRETS_FILE 를 EC2 외부 (운영자 노트북·USB) 로 옮기고 EC2 에선 삭제
  2) backend/.env 또는 doppler 에 VAULT_TOKEN=$BACKEND_TOKEN 등록
  3) Vault 재기동 시 'bash infra/scripts/vault-unseal.sh' 로 봉인 해제
================================================================
EOF
