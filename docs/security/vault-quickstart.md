# Vault Transit 적용 가이드 — dev / prod

> Vault Transit envelope encryption 의 처음부터 끝까지 셋업 절차.
> 모델/보안 약속/내부 구조는 [vault-integration.md](vault-integration.md) 참조.

---

## 0. 공통 사전 지식

### 시크릿은 단 하나
| 키 | 시크릿? | 저장 위치 |
|---|---|---|
| `VAULT_TOKEN` | ✅ 시크릿 | Doppler (dev/prd config 양쪽) |
| `vault.url`, `vault.transit-key`, `vault.cache-ttl-seconds`, `vault.enabled` | ❌ | `application.yml` 코드 상수 (dev/prod 동일) |
| `BACKEND_INTERNAL_URL` | ❌ | compose hardcode (색상별 분리) |

### 컨테이너 이름
| 환경 | 컨테이너명 | 컴포즈 위치 |
|---|---|---|
| dev | `storyzip-vault-dev` | `infra/dev/docker-compose.dev.yml` |
| prod | `folio-vault-prod` | `infra/prod/docker-compose.yml` |

### 보조 스크립트 (공통, 자동 컨테이너 감지)
- `infra/scripts/vault-init.sh` — 최초 1회 init + unseal + transit 키 생성 + 백엔드 토큰 발급
- `infra/scripts/vault-unseal.sh --interactive` — 컨테이너 재기동 시 봉인 해제
- `infra/scripts/vault-status.sh` — initialized/sealed 상태 점검 (200/501/503 체크)

---

## 1. Dev (로컬) 셋업 — 최초 1회

### 1.1 인프라 컨테이너 기동
```bash
cd infra/dev
doppler run -- docker compose -f docker-compose.dev.yml up -d
```
→ postgresql / redis / mongo / powersync / **vault** (storyzip-vault-dev) 모두 기동.
이 시점 vault 는 **미초기화 (sealed 상태)**.

### 1.2 Vault 초기화 + 토큰 발급
```bash
cd /c/WorkSpace/Final/S14P31F203
bash infra/scripts/vault-init.sh
```
출력:
- `infra/vault/.init.secrets` — root token + unseal key 5개 (gitignore 처리됨)
- 콘솔 마지막에 `VAULT_TOKEN=hvs.XXXXXX` 출력

### 1.3 Doppler dev config 에 토큰 등록
```bash
doppler setup    # 처음이면 project=folio, config=dev 선택
doppler secrets set --project folio --config dev VAULT_TOKEN=hvs.XXXXXX
```
또는 Doppler 웹 dashboard 에서 직접 입력.

### 1.4 unseal key 분산 보관
`infra/vault/.init.secrets` 의 `unseal_keys_b64[0..4]` 5개를 USB·노트북·다른 디스크 등에 **분산 보관**.
3개만 모이면 unseal 가능 → 1~2개 분실해도 복구 가능.

dev 단계에서는 .init.secrets 를 로컬에 그대로 두고 사용 가능 (편의). prod 와 절차 검증을 위해 외부로 옮겨두는 것도 권장.

### 1.5 모든 서버 기동
```bash
bash dev-start.sh
```
스크립트 첫 단계에서 `vault-status.sh` 호출 → unsealed 확인 → backend·AI·frontend 일괄 기동.

### 1.6 동작 검증
브라우저로 작품 생성 → episode 작성 → backend 로그에 다음 확인:
```
INFO  c.s.s.VaultKmsService - VaultKmsService 초기화: url=http://vault:8200, transit-key=folio-work-dek
INFO  c.s.s.WorkServerDekController - server_encrypted_dek 발급 완료 workId=...
```
DB 확인:
```sql
SELECT id, encrypted_dek IS NOT NULL AS has_kek, server_encrypted_dek IS NOT NULL AS has_vault FROM work;
```
both columns true 면 정상.

---

## 2. Dev — 컨테이너 재기동 시 (PC 재부팅·docker compose down 후)

```bash
cd infra/dev
doppler run -- docker compose -f docker-compose.dev.yml up -d
bash ../scripts/vault-unseal.sh --interactive
# unseal key 3 개 입력 (분산 보관처에서)
# 또는 .init.secrets 가 로컬에 있으면:
bash ../scripts/vault-unseal.sh
```
이후 `bash dev-start.sh` → 정상 동작.

---

## 3. Dev — Vault 끄고 디버깅하고 싶을 때 (예외 케이스)

`backend/.env` 에 한 줄 추가:
```
FOLIO_VAULT_ENABLED=false
```
backend 만 vault 미사용. 단 AI 자동 인덱싱은 동작 안 함 (server_encrypted_dek 없음). 기존 episode 편집·검수·초안은 정상.

---

## 4. Prod (EC2) 최초 셋업

### 4.1 코드 배포 (CI/CD 자동)
master push → GitLab CI → EC2 SSH 접속 → git pull → `deploy-production` job 실행.

이 단계에서 deploy job 이 vault 컨테이너를 띄운 후 `vault-status.sh` 호출 → **미초기화 상태로 실패하며 안내 메시지 출력** → deploy 중단.

### 4.2 EC2 SSH 접속 후 Vault 초기화
```bash
ssh ec2-user@<host>
cd /opt/folio/S14P31F203
bash infra/scripts/vault-init.sh
```
컨테이너 자동 감지로 `folio-vault-prod` 대상.

### 4.3 토큰을 Doppler prd 에 등록
출력된 `VAULT_TOKEN` 복사:
```bash
# 운영자 로컬에서 (또는 Doppler 웹 dashboard)
doppler secrets set --project folio --config prd VAULT_TOKEN=hvs.XXXXXX
```

### 4.4 .init.secrets 외부 이동
```bash
# EC2 → 운영자 노트북 (scp 권장)
scp ec2-user@<host>:/opt/folio/S14P31F203/infra/vault/.init.secrets ~/folio-vault-secrets-$(date +%F).json
ssh ec2-user@<host> 'rm /opt/folio/S14P31F203/infra/vault/.init.secrets'
```
운영자 노트북에서 다시 `unseal_keys_b64` 5개를 USB·다른 운영자·암호 매니저 등에 **분산 보관**.

### 4.5 GitLab deploy job 재실행
GitLab UI → deploy-production → Retry. 이번엔 vault 가 unsealed 상태 → backend 정상 기동 → blue/green 전환 완료.

---

## 5. Prod — 컨테이너 재기동 시

EC2 서버 재부팅 또는 `docker compose down` 이후:
```bash
ssh ec2-user@<host>
cd /opt/folio/S14P31F203
bash infra/scripts/vault-unseal.sh --interactive
# unseal key 3 개 입력 (분산 보관처에서 가져와)
```
봉인 해제 즉시 backend 가 vault 호출 가능. AI 인덱싱·검수 자동 재개.

봉인 동안 영향:
- ❌ AI 자동 인덱싱 (chunk_and_embed)
- ❌ AI 검수·초안 (work_key 복호화 필요한 경우)
- ✅ 클라이언트 R/W (모두 클라 KEK 자체 복호화)
- ✅ 작품 생성 (server_encrypted_dek 발급은 클라 pending queue 에 적재 → unseal 후 자동 발급)

---

## 6. Trouble Shooting

| 증상 | 원인 | 조치 |
|---|---|---|
| `dev-start.sh` 가 vault 미준비 메시지로 종료 | vault 컨테이너 안 떠있음 | `cd infra/dev && doppler run -- docker compose -f docker-compose.dev.yml up -d` |
| `vault-status.sh` 가 NOT INITIALIZED | 최초 1회 init 안 함 | `bash infra/scripts/vault-init.sh` |
| `vault-status.sh` 가 SEALED | 컨테이너 재기동됨 | `bash infra/scripts/vault-unseal.sh --interactive` |
| backend 기동 시 `VAULT_TOKEN 미설정` | doppler 에 토큰 누락 | doppler dev/prd 에 `VAULT_TOKEN` 등록 |
| backend 기동 시 `Vault encrypt 응답 파싱 실패` | 토큰은 있는데 vault 가 봉인 | unseal 실행 |
| 작품 생성 후 `server_encrypted_dek` 가 NULL | 클라이언트 server-dek 호출 실패 | localStorage 의 `folio.serverDek.pending.v1` 확인. 온라인 복귀 시 자동 재시도 |
| AI 인덱싱이 안 됨 | server_encrypted_dek NULL 또는 vault 봉인 | 위 둘 확인 |
| `.init.secrets` 분실 + unseal key 도 분실 | 키 영구 손실 | 알파 단계: DB wipe + 신규 발급. 기존 ciphertext 모두 무효 |

---

## 7. 운영 체크리스트

### dev 개발자가 PR 보내기 전
- [ ] 로컬 vault 활성 상태에서 작품 생성 → episode 작성 → DB 의 `server_encrypted_dek IS NOT NULL` 확인
- [ ] AI 인덱싱 1회 트리거 → `episode_chunk` 테이블 row 생성 확인
- [ ] 작품 삭제 → 정상 동작 확인

### Prod 배포 운영자
- [ ] Doppler prd 의 `VAULT_TOKEN` 최신화
- [ ] `.init.secrets` 가 EC2 에 없음 확인 (`ssh ec2 'ls /opt/folio/S14P31F203/infra/vault/.init.secrets' → No such file`)
- [ ] unseal key 5개 분산 보관처 점검 (분기별)
- [ ] vault 컨테이너 데이터 디렉토리 백업 (`/opt/folio/data/vault`)
