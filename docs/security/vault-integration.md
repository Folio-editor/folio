# Vault Transit 통합 가이드

> Plan C 옵션 1 → Vault Transit envelope encryption 전환 (curious-wiggling-thacker plan).
> AWS KMS 가 교육기관 EC2 외부 방화벽으로 도달 불가하여 self-hosted Vault 채택.

## 1. 모델 개요

```
[ 클라이언트 ]
  사용자 패스워드 → KEK (HKDF, non-extractable CryptoKey, 메모리만)
  새 작품 work_key 생성
       ↓ KEK 으로 wrap
       work.encrypted_dek (BYTEA, KEK wrap)              ← PowerSync sync
       ↓ raw work_key 를 TLS 로 한 번 서버 전송 (작품 생성 순간만)
[ Spring Backend ]
       VaultKmsService.encrypt(rawWorkKey)
       ↓ Vault Transit
       work.server_encrypted_dek (BYTEA, Vault wrap)     ← PowerSync sync
       raw work_key 즉시 메모리 폐기
[ AI 인덱싱 / 검수 시 ]
  AI 서버 → backend 내부 API → WorkKeyService
       ↓ KmsService.decrypt(server_encrypted_dek)
       work_key 평문 메모리 획득 → episode 본문 복호화 → 메모리 처리
```

## 2. 보안 약속

| 항목 | 약속 |
|---|---|
| DB ciphertext | 평문 본문 0, encrypted_dek + server_encrypted_dek + ciphertext 만 |
| 운영자 접근 | Vault unseal key 3/5 보유 시에만 일시적 복호화 가능 |
| 작품 생성 순간 | raw work_key 가 서버 메모리를 한 번 통과 (envelope encryption 본질적 trade-off) |
| AI 서버 | Vault 토큰 미보유, backend 내부 API 경유 |
| Vault 봉인 | 컨테이너 재기동 시 자동 봉인, 운영자 수동 unseal 필요 |
| 디스크 유출 | Vault 데이터 파일 + ciphertext 만으로는 복호화 불가능 (unseal key 필요) |

## 3. 파일 구조

```
infra/
├── vault/
│   ├── config/vault.hcl       # 컨테이너 설정 (storage file, listener tcp)
│   ├── data/                  # 영속 볼륨 (.gitignore)
│   └── .init.secrets          # root token + unseal keys 5개 (.gitignore, EC2 외부 보관 필수)
└── scripts/
    ├── vault-init.sh          # 최초 1회 — init + unseal + transit + 토큰 발급
    └── vault-unseal.sh        # 재기동 시 — unseal key 3 개 입력
```

## 4. 운영 절차

### 4.1 최초 셋업 (한 번만)
```bash
cd infra/dev
doppler run -- docker compose -f docker-compose.dev.yml up -d
bash ../scripts/vault-init.sh
```
출력된 `VAULT_TOKEN` 을 `backend/.env` (또는 doppler) 의 `VAULT_TOKEN=...` 에 등록.
`infra/vault/.init.secrets` 는 즉시 EC2 외부 (운영자 노트북·USB) 로 옮기고 EC2 에선 삭제.

### 4.2 컨테이너 재기동 후 unseal
```bash
bash infra/scripts/vault-unseal.sh --interactive
```
unseal key 3 개를 분산 보관처에서 가져와 입력. 봉인 해제 전엔 AI 기능만 정지 (클라이언트 R/W 영향 0).

### 4.3 토큰 회전
```bash
docker exec storyzip-vault-dev vault token create -policy=folio-backend -ttl=8760h -renewable=true
```
새 토큰을 `.env` 에 반영 후 backend 재기동.

### 4.4 Transit 키 회전
```bash
docker exec storyzip-vault-dev vault write -f transit/keys/folio-work-dek/rotate
```
이전 버전 ciphertext 도 자동 복호화 가능 (Vault 가 키 버전 관리).

## 5. 토큰 정책

`folio-backend` 정책: `transit/encrypt/folio-work-dek` + `transit/decrypt/folio-work-dek` 만 허용.
키 관리·생성·삭제·정책 변경 권한 없음 (root token 만 가능).

## 6. 호환성

기존 클라이언트 KEK 흐름 0 변경. 자세한 호환성 매트릭스는 plan 파일 참조.

| 컴포넌트 | 영향 |
|---|---|
| Electron / 웹 / PWA | 변경 0 |
| 오프라인 R/W | 변경 0 |
| 오프라인 신규 작품 생성 | server_encrypted_dek pending → 온라인 복귀 시 발급 |
| 게스트 모드 | 변경 0 (서버 업로드 자체 안 함) |
| 다중 디바이스 | 변경 0 (KEK 결정적 재도출) |
| 패스워드 변경 (KEK 회전) | server_encrypted_dek 재발급 불필요 |
| AI 인덱싱·검수 | Vault 봉인 시만 정지 |

## 7. Prod (EC2) 운영 절차 — CI/CD 연동

### 7.1 컴포즈 구조
- `infra/prod/docker-compose.yml` — `vault` 서비스 정의 (folio-vault-prod, /opt/folio/data/vault host mount, 외부 포트 노출 0)
- `infra/prod/docker-compose.{blue,green}.yml` — backend 환경변수 (`FOLIO_VAULT_ENABLED`, `VAULT_URL`, `VAULT_TOKEN`, `VAULT_TRANSIT_KEY`) + AI 환경변수 (`BACKEND_INTERNAL_URL=http://spring-boot-{color}:8080`)
- `infra/scripts/deploy.sh` + `.gitlab-ci.yml` — vault 디렉토리 자동 생성, 기동 후 `vault-status.sh` 사전 점검

### 7.2 CI/CD 자동 처리되는 것
- `/opt/folio/data/vault` 디렉토리 생성 (chmod 700)
- vault 컨테이너 기동 (base compose 일부)
- 배포 직전 `vault-status.sh folio-vault-prod` 실행 → 미초기화/봉인 시 deploy 중단

### 7.3 운영자 수동 작업 (CI/CD 가 못 하는 것)

#### 최초 1회 (신규 EC2 또는 Vault 데이터 reset 시)
```bash
ssh ec2-user@<host>
cd /opt/folio/S14P31F203
git pull origin master                      # CI 가 이미 했으면 생략
bash infra/scripts/vault-init.sh
```
출력에서 `VAULT_TOKEN=hvs.XXXXXX` 복사 → **Doppler prd config** 에 등록:
```bash
doppler secrets set --project folio --config prd VAULT_TOKEN=hvs.XXXXXX
```
`/opt/folio/data/vault/.init.secrets` (root token + unseal key 5개) 를 즉시 EC2 외부 (운영자 노트북·USB·다른 서버) 로 이동하고 EC2 에선 삭제.

GitLab → deploy-production job 재실행 → 정상 배포.

#### Vault 컨테이너 재기동 시 (업그레이드·EC2 재부팅 등)
```bash
ssh ec2-user@<host>
bash /opt/folio/S14P31F203/infra/scripts/vault-unseal.sh --interactive
# unseal key 3 개를 분산 보관처에서 가져와 입력
```
봉인 동안엔 AI 인덱싱·검수 일부만 정지. 클라이언트 R/W·기존 episode 편집 정상.

### 7.4 Doppler 등록 시크릿
| 키 | 값 | 설명 |
|---|---|---|
| `VAULT_TOKEN` | `hvs.XXXXXX` | **유일한 시크릿**. vault-init.sh 출력. 미설정 시 backend fail-fast |

**그 외 모든 Vault 설정은 시크릿 아니므로 Doppler 등록 금지** — 환경 무관 고정값:
- `folio.security.vault.url=http://vault:8200` ← `application.yml` 코드 상수
- `folio.security.vault.transit-key=folio-work-dek` ← `application.yml` 코드 상수
- `folio.security.vault.cache-ttl-seconds=300` ← `application.yml` 코드 상수
- `folio.security.vault.enabled` ← `application-prod.yml=true`, `application-dev.yml=${FOLIO_VAULT_ENABLED:false}`
- `BACKEND_INTERNAL_URL=http://spring-boot-{blue,green}:8080` ← compose 색상별 hardcode

dev 에서 vault 사용하려면 backend `.env` 또는 IDE run config 에 `FOLIO_VAULT_ENABLED=true` + `VAULT_TOKEN=hvs.xxx` 만 추가.

### 7.5 보안 강화 추천 (운영 안정화 후)
- `vault.hcl`: `tls_disable = false` + 인증서 마운트
- storage backend: `file` → `raft` (HA, 다중 인스턴스)
- auto-unseal: Transit Engine of another Vault (외부 KMS 미사용 시 self-hosted Vault 2개로 상호 unseal)
- audit device 활성화: `vault audit enable file file_path=/vault/audit.log`
- backup: `/opt/folio/data/vault` 정기 스냅샷 (S3 또는 별도 디스크) — unseal key 와 동일 보안 수준 유지

## 8. Trouble Shooting

| 증상 | 원인 | 조치 |
|---|---|---|
| backend 기동 실패 `VAULT_TOKEN 미설정` | Doppler 에 토큰 없음 | vault-init.sh 실행 후 토큰 등록 |
| backend 기동 실패 `Vault encrypt 응답 파싱 실패` | Vault 봉인 상태 | vault-unseal.sh 실행 |
| AI 인덱싱이 동작 안 함 | server_encrypted_dek NULL | 클라이언트가 server-dek pending queue 재시도 대기 — 온라인 복귀 시 자동 발급 |
| deploy 중 `Vault 가 준비되지 않음` | 미초기화/봉인 | vault-init.sh 또는 vault-unseal.sh 실행 후 deploy 재시도 |
| `.init.secrets` 분실 | 운영자 백업 누락 | EC2 의 vault data 와 함께 폐기 → DB 의 server_encrypted_dek 모두 무효 → 알파 단계 wipe + 신규 발급 |
