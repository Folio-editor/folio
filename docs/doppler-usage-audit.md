# Doppler 사용처 전수 조사

> 조사 일자: 2026-05-18
> 운영 가이드 원문은 [doppler-setup.md](./doppler-setup.md) 참조.
> 이 문서는 **"우리 코드/인프라/문서 어디서, 어떻게, 어떤 변수를 Doppler 와 엮는가"** 를 한눈에 보기 위한 감사용(audit) 정리.

---

## 1. 한눈에 보기

### Doppler 프로젝트 구조

```
Project: folio
├── config: dev   - 개발자 PC, 로컬 docker compose
├── config: test  - CI 통합 테스트
└── config: prd   - EC2 prod (CI 배포 + 런타임)
```

서비스 토큰 3종 (`ci-dev`, `ci-test`, `ci-prd`) 발급 후 GitLab CI Variables 에
`DOPPLER_TOKEN_DEV / TEST / PRD` 로 저장 (Masked + Protected).

### 주입 방식 4가지

| # | 방식 | 대상 | 예시 |
|---|------|------|------|
| 1 | `doppler run --` 래퍼 | 로컬 dev 모든 프로세스, AI 스크립트 | `doppler run -- pnpm dev`, `doppler run -- python ...` |
| 2 | `doppler secrets download --format env` | prod docker compose, CI 배포, vault-init 후 prometheus 시크릿 | `deploy.sh`, `infra-up.sh`, `.gitlab-ci.yml` |
| 3 | `doppler secrets get <KEY> --plain` | CI 빌드 시점 단건 추출 (PortOne 등) | `build-electron-windows` job |
| 4 | 사용자가 UI 에 수동 입력 | 운영자 admin 토큰 | `AdminRefundsPage.tsx` (브라우저 localStorage 8h) |

### 핵심 시크릿

- **부팅 차단(prod fail-fast)**: `JWT_SECRET`, `INTERNAL_API_KEY`, `VAULT_TOKEN`, `SERVER_PEPPER`, `DB_*`, `REDIS_HOST`, `AI_SERVER_URL`
- **부팅 후 차단(fail-safe)**: `ADMIN_API_TOKEN` (미설정 시 `/api/v1/admin/**` 401)
- **빌드 차단**: `VITE_API_URL`, `VITE_GOOGLE_DESKTOP_CLIENT_ID`, `VITE_PORTONE_*` (`check-build-env.mjs`)

---

## 2. 백엔드 (Spring Boot)

### 2.1 [application.yml](../backend/src/main/resources/application.yml)
공통 설정. `${VAR}` 또는 `${VAR:default}` 형태로 환경변수 치환.

| 변수 | 필수? | 기본값 | 비고 |
|------|------|--------|------|
| `SPRING_PROFILES_ACTIVE` | 선택 | `dev` | 프로필 분기 |
| `SERVER_PORT` | 선택 | `8080` | |
| `JWT_SECRET` | **필수** | 없음 | HS256 최소 32B |
| `JWT_ACCESS_EXPIRY` / `JWT_REFRESH_EXPIRY` | 선택 | 1800 / 1209600 | 초 단위 |
| `PS_JWT_AUDIENCE` / `PS_JWT_KID` | 선택 | `powersync-dev` / `folio-dev` | PowerSync 서명 |
| `GOOGLE_CLIENT_ID` / `_SECRET` | (사실상 필수) | 빈 값 | OAuth 웹 |
| `GOOGLE_DESKTOP_CLIENT_ID` / `_SECRET` | 선택 | 빈 값 | OAuth Electron |
| `INTERNAL_API_KEY` | **필수** | 없음 | AI 서버 ↔ 백엔드 공유 시크릿 |
| `SERVER_PEPPER` | **필수** | 빈 값 | 32B base64. 주석에 "Doppler `SERVER_PEPPER` 환경변수로 직접 주입" 명시 |
| `VAULT_TOKEN` | **필수** | 빈 값 | `vault-init.sh` 출력 → Doppler 등록 |
| `PORTONE_API_SECRET` / `PORTONE_WEBHOOK_SECRET` | 선택 | 빈 값 | 결제 |
| `PORTONE_API_BASE_URL` | 선택 | `https://api.portone.io` | |
| `GA4_MEASUREMENT_ID` / `GA4_API_SECRET` | 선택 | 빈 값 | 서버 사이드 GA4 |
| `MAIL_HOST` / `MAIL_PORT` | 선택 | smtp.gmail.com / 587 | |
| `MAIL_USERNAME` / `MAIL_PASSWORD` / `MAIL_FROM` | 선택 | 빈 값 | |
| `MAIL_OPERATOR_TO` | 선택 | `2square.f203@gmail.com` | |
| `ADMIN_API_TOKEN` | (사실상 필수) | 빈 값 | 미설정 시 admin API 전부 401 |

### 2.2 [application-prod.yml](../backend/src/main/resources/application-prod.yml)
prod 전용. 기본값 거의 없음 → Doppler 누락 시 fail-fast.

| 변수 | 필수 | 비고 |
|------|------|------|
| `DB_HOST` / `DB_NAME` / `DB_USERNAME` / `DB_PASSWORD` | **필수** | 기본값 없음 |
| `DB_PORT` | 선택 | 기본 5432 |
| `DB_POOL_SIZE` | 선택 | 기본 50 |
| `REDIS_HOST` | **필수** | |
| `REDIS_PORT` | 선택 | 기본 6379 |
| `REDIS_PASSWORD` | 선택 | |
| `AI_SERVER_URL` | **필수** | docker compose blue/green 컨테이너명. **Doppler 가 아니라 compose 가 직접 주입** (주석에 명시) |

주석 발췌:
> 운영 도메인 hardcode (도플러 슬림화 — 옵션 B)
> server_pepper 는 Doppler 의 `SERVER_PEPPER` 환경변수에서 직접 주입.

### 2.3 [application-dev.yml](../backend/src/main/resources/application-dev.yml)
dev 전용. 대부분 기본값으로 Doppler 없이도 동작 가능. **단 SERVER_PEPPER 는 dev 도 Doppler 주입** ([기억된 정책](../README.md) — dev pepper 활성화).

### 2.4 [application-test.yml](../backend/src/main/resources/application-test.yml)
모든 시크릿에 더미 기본값 → CI 에서 Doppler 없이도 단위/통합 테스트 부팅 가능.
- `JWT_SECRET` 더미 ≥ 32B
- `INTERNAL_API_KEY=test-internal-api-key`
- Vault 비활성

### 2.5 Java 소스에서의 명시적 참조

| 파일 | 어떤 변수 / 어떻게 |
|------|-------------------|
| [JwtProvider.java:49](../backend/src/main/java/com/storyzip/auth/jwt/JwtProvider.java) | `JWT_SECRET` 미설정 시 "환경변수 또는 Doppler 에 jwt.secret 을 설정하세요" 예외 |
| [VaultKmsService.java:44-50](../backend/src/main/java/com/storyzip/security/VaultKmsService.java) | `@Value("${folio.security.vault.token}")` + Doppler/CRLF trailing whitespace 방어 |
| [PepperProvider.java:15-49](../backend/src/main/java/com/storyzip/common/crypto/PepperProvider.java) | `SERVER_PEPPER`, `SERVER_PEPPER_VERSION`. AWS Secrets Manager → Doppler 전환 명시. 회전 명령: `doppler secrets set SERVER_PEPPER="..."` |
| [AdminProperties.java](../backend/src/main/java/com/storyzip/admin/AdminProperties.java) | `ADMIN_API_TOKEN` 주입. 미설정 시 모든 admin 요청 401 차단 |
| [AdminAuthInterceptor.java:135](../backend/src/main/java/com/storyzip/admin/AdminAuthInterceptor.java) | 보안 알림 메일 안내문에 "ADMIN_API_TOKEN 즉시 회전 (Doppler)" |
| [AdminRefundController.java:20](../backend/src/main/java/com/storyzip/admin/AdminRefundController.java) | javadoc: "값은 Doppler `ADMIN_API_TOKEN`" |
| [GoogleWebOAuthController.java:71,98](../backend/src/main/java/com/storyzip/auth/controller/GoogleWebOAuthController.java) | `sanitizeOAuthValue()` — "Doppler 값에 CRLF/공백이 섞일 수 있어 sanitize" / "Doppler 가 Git Bash 환경에서 값에 `\r\n` 을 섞어 저장하는 알려진 이슈에 대한 방어선" |

---

## 3. 프론트엔드 (Electron + Web)

### 3.1 [check-build-env.mjs](../frontend/scripts/check-build-env.mjs)
build 직전 필수 `VITE_*` 누락 검사. **Doppler 없이 빌드하면 즉시 차단**.

```js
const REQUIRED = [
  'VITE_API_URL',
  'VITE_GOOGLE_DESKTOP_CLIENT_ID',
  'VITE_PORTONE_STORE_ID',
  'VITE_PORTONE_CHANNEL_KEY_ONETIME',
  'VITE_PORTONE_CHANNEL_KEY_BILLING',
];
```

스크립트가 직접 명시: `doppler run -- pnpm build:win` / `pnpm build:web`.

### 3.2 [electron.vite.config.ts](../frontend/electron.vite.config.ts)
`mainDefine` 으로 `process.env.VITE_*` 을 빌드 시점에 정적 인라인.
> Doppler 에서 export 된 `process.env` 가 빌드 타임에 들어와 그대로 박힌다.

### 3.3 [landing/src/lib/loginUrl.ts](../landing/src/lib/loginUrl.ts)
`VITE_API_URL` (백엔드), `VITE_EDITOR_URL` (에디터 도메인) 인라인.
> Doppler 변수 `VITE_API_URL` 은 trailing slash 포함 가능 → 정규화.

### 3.4 [AdminRefundsPage.tsx](../frontend/src/shared/features/settings/AdminRefundsPage.tsx)
사용자(운영자)가 직접 UI 에 `ADMIN_API_TOKEN` 값을 입력. 그 토큰의 **원본 출처가 Doppler**. localStorage 에 8시간 저장.

---

## 4. AI 서버 (FastAPI)

### 4.1 [ai/app/config.py](../ai/app/config.py)
Pydantic `BaseSettings` 가 환경변수 로드. 다수 변수에 `validation_alias = AliasChoices(...)` 로 fallback 이름 매핑.

주요 변수:

| 변수 | 비고 |
|------|------|
| `APP_ENV` (또는 `DOPPLER_ENVIRONMENT`) | 환경 구분 |
| `APP_PORT` (또는 `SERVER_PORT`) | 포트 |
| `LOG_LEVEL` | |
| `INTERNAL_API_KEY` | **필수** |
| `BACKEND_INTERNAL_URL` | 백엔드 KMS 호출 |
| `DB_HOST` / `DB_USERNAME` / `DB_PASSWORD` 또는 `DATABASE_URL` | prod 에서 누락 시 fail-fast |
| `REDIS_HOST` / `REDIS_PASSWORD` 또는 `REDIS_URL` | prod fail-fast |
| `ANTHROPIC_API_KEY` (또는 `CLAUDE_API_KEY`) | LLM |
| `ANTHROPIC_BASE_URL` | **특수**: 빈 문자열로 들어오면 pop 으로 언셋 — Doppler 가 빈 값 주입하는 케이스 방어 |
| `CLAUDE_SONNET_MODEL` / `_HAIKU_MODEL` / `_OPUS_MODEL` | 모델 alias |
| `EMBEDDING_PROVIDER` / `LLM_PROVIDER` | fake / openai / anthropic 토글 |
| `OPENAI_API_KEY` | embedding |

### 4.2 [ai/.env.example](../ai/.env.example)
참고용 템플릿. 첫 줄에 "실제 사용은 Doppler. 로컬 개발용 참고 파일."

### 4.3 진단/부하 스크립트
모두 `doppler run --` 래퍼 전제.

- [diag_chunk.py](../ai/diag_chunk.py) - `doppler run -- .venv/Scripts/python diag_chunk.py <episode_id>`
- [scripts/concurrency_test.py](../ai/scripts/concurrency_test.py) - `INTERNAL_API_KEY` 미설정 시 "Run with `doppler run --`" 에러 출력
- [scripts/concurrency_test_drafts.py](../ai/scripts/concurrency_test_drafts.py) - 동일 패턴

---

## 5. 인프라 / Docker Compose

### 5.1 [infra/dev/docker-compose.dev.yml](../infra/dev/docker-compose.dev.yml)
실행 패턴: `doppler run -- docker compose -f docker-compose.dev.yml up -d`
주입 변수: `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `PS_REPL_PASSWORD`, `PS_JWT_K`, `REDIS_PASSWORD`(선택)
`${VAR:-default}` 패턴으로 Doppler 없으면 기본값.

### 5.2 [infra/test/docker-compose.test.yml](../infra/test/docker-compose.test.yml)
권장: `doppler run -c test -- docker compose ...`
대안: `doppler secrets download --config test --no-file --format env > .env` 후 `--env-file .env`

### 5.3 [infra/prod/docker-compose.yml](../infra/prod/docker-compose.yml) + [docker-compose.blue.yml](../infra/prod/docker-compose.blue.yml) / [docker-compose.green.yml](../infra/prod/docker-compose.green.yml)
필수 변수에 `${VAR:?error message}` 패턴 적용 → 누락 시 compose 자체가 실패.

예시:
```yaml
POSTGRES_USER: ${DB_USERNAME:?DB_USERNAME must be set in Doppler}
VAULT_TOKEN: ${VAULT_TOKEN:?VAULT_TOKEN must be set in Doppler — bash infra/scripts/vault-init.sh 로 발급}
```

주입 방식: `deploy.sh` 가 `doppler secrets download --project folio --config prd --no-file --format env > .env` 후 `--env-file .env` 로 compose 호출.

### 5.4 [infra/prod/prometheus/prometheus.yml](../infra/prod/prometheus/prometheus.yml)
FastAPI `/metrics` 스크레이프 시 `X-Internal-Api-Key` 헤더 검증 필요 → 파일 마운트로 읽음 (`/etc/prometheus/secrets/internal-api-key`). 원본은 Doppler `INTERNAL_API_KEY`.

### 5.5 [infra/prod/grafana/.../contact-points.yml](../infra/prod/grafana/provisioning/alerting/contact-points.yml)
Discord webhook 등 외부 알림 채널 URL. Doppler 에서 환경변수로 주입되거나 deploy 시 .env 에서 끌어옴.

---

## 6. 운영 스크립트

### 6.1 [infra/scripts/deploy.sh](../infra/scripts/deploy.sh)
Blue/Green 배포 핵심.

```bash
# (1) 전체 시크릿 다운로드
doppler secrets download --project folio --config prd --no-file --format env > .env
echo "IMAGE_TAG=${IMAGE_TAG}" >> .env

# (2) Prometheus 가 읽을 INTERNAL_API_KEY 파일 기록
printf '%s' "$(doppler secrets get INTERNAL_API_KEY --project folio --config prd --plain)" \
  | sudo tee /opt/folio/data/prometheus-secrets/internal-api-key > /dev/null
sudo chown 65534:65534 /opt/folio/data/prometheus-secrets/internal-api-key
sudo chmod 400 /opt/folio/data/prometheus-secrets/internal-api-key
```

### 6.2 [infra/scripts/infra-up.sh](../infra/scripts/infra-up.sh)
EC2 최초 공용 인프라 기동. line 44-46 에서 prd 시크릿 다운로드.

### 6.3 [infra/scripts/vault-init.sh](../infra/scripts/vault-init.sh)
Vault Transit Engine 초기화 → `VAULT_TOKEN` 발급 → 운영자가 Doppler prd 에 등록.

### 6.4 [infra/dev/reset.sh](../infra/dev/reset.sh)
dev 환경 초기화. Doppler 변수 의존 docker compose teardown.

### 6.5 [dev-start.sh](../dev-start.sh) (프로젝트 루트)
로컬 6개 프로세스(backend, ai, celery, frontend, landing, dev:web) 모두 `doppler run --` 래퍼로 동시 기동.

```bash
(cd backend && doppler run -- cmd //c "gradlew.bat --no-daemon bootRun ...")
(cd landing && doppler run -- pnpm dev)
(cd ai && BACKEND_INTERNAL_URL=... doppler run -- .venv/Scripts/python -m uvicorn ...)
(cd ai && BACKEND_INTERNAL_URL=... doppler run -- .venv/Scripts/python -m celery ...)
(cd frontend && doppler run -- pnpm dev:web)
(cd frontend && doppler run -- pnpm dev)
```

---

## 7. CI/CD ([.gitlab-ci.yml](../.gitlab-ci.yml))

### 7.1 등록된 GitLab CI Variables (Masked + Protected)
- `DOPPLER_TOKEN_DEV`
- `DOPPLER_TOKEN_TEST`
- `DOPPLER_TOKEN_PRD`

### 7.2 build-electron-windows job (line 140-143)
PortOne 변수만 단건 추출해서 빌드 인라인.

```bash
export DOPPLER_TOKEN="${DOPPLER_TOKEN_PRD}"
VITE_PORTONE_STORE_ID=$(doppler secrets get VITE_PORTONE_STORE_ID --project folio --config prd --plain)
VITE_PORTONE_CHANNEL_KEY_ONETIME=$(doppler secrets get VITE_PORTONE_CHANNEL_KEY_ONETIME --project folio --config prd --plain)
VITE_PORTONE_CHANNEL_KEY_BILLING=$(doppler secrets get VITE_PORTONE_CHANNEL_KEY_BILLING --project folio --config prd --plain)
```

> Electron 빌드 산출물에 박히므로, 변경 시 **재빌드/재배포 필요**.

### 7.3 deploy-production job (line 231-233)
EC2 SSH 후 `doppler secrets download` 로 .env 통째로 받아 compose 에 주입.

### 7.4 Vault 1회 절차 (line 19-30)
```
1) CI 가 코드 EC2 배포 (Vault 컨테이너 기동 단계까지)
2) 운영자 SSH → bash infra/scripts/vault-init.sh
3) 출력된 VAULT_TOKEN 을 Doppler prd 에 등록
4) /opt/folio/data/vault/.init.secrets 를 EC2 외부로 이동
5) GitLab 에서 deploy job 재실행
```

---

## 8. 운영 시 자주 쓰는 명령 모음

```bash
# 셋업
doppler login
cd backend && doppler setup    # project=folio, config=dev
cd ai && doppler setup
cd frontend && doppler setup
cd infra/dev && doppler setup

# 조회
doppler secrets                       # 현재 config 전체
doppler secrets get JWT_SECRET --plain

# 변경
doppler secrets set DB_PASSWORD="new-pw"
doppler open                          # 대시보드 (권장)

# 실행
doppler run -- pnpm dev
doppler run -- ./gradlew bootRun
doppler run -- docker compose -f infra/dev/docker-compose.dev.yml up -d

# 회전 예시 (PepperProvider 주석에서 발췌)
NEW_PEPPER=$(openssl rand -base64 32 | tr -d '\n')
doppler secrets set SERVER_PEPPER="$NEW_PEPPER" --project folio --config prd
# → backend 재기동
```

---

## 9. 알려진 Doppler 이슈 / 방어 패턴

| 이슈 | 방어 코드 |
|------|-----------|
| Git Bash 환경에서 Doppler 가 값 끝에 `\r\n` 을 섞어 저장 | `GoogleWebOAuthController.sanitizeOAuthValue()`, `VaultKmsService` trim, `PepperProvider` trim |
| 빈 문자열로 변수 주입 → SDK 가 invalid value 로 해석 | `ai/app/config.py` 의 `ANTHROPIC_BASE_URL` 빈 값 시 `os.environ.pop` |
| 빌드 시점에 변수 누락 → 결제 깨진 앱 배포 | `frontend/scripts/check-build-env.mjs` fail-fast |
| 운영자 토큰을 빌드 산출물에 박는 위험 | `ARG/ENV` 에 `VITE_ADMIN_API_TOKEN` 제외 (Dockerfile.web 주석), 운영자는 본인 PC dev 빌드 또는 런타임 UI 입력만 사용 |

---

## 10. 변수 카테고리 색인

<details>
<summary>전체 변수 알파벳순 펼치기</summary>

- `ADMIN_API_TOKEN`
- `AI_SERVER_URL`
- `ANTHROPIC_API_KEY` / `CLAUDE_API_KEY`
- `ANTHROPIC_BASE_URL`
- `APP_ENV` / `DOPPLER_ENVIRONMENT`
- `APP_PORT` / `SERVER_PORT`
- `BACKEND_INTERNAL_URL`
- `CLAUDE_HAIKU_MODEL` / `_SONNET_MODEL` / `_OPUS_MODEL`
- `DATABASE_URL`
- `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USERNAME` / `DB_PASSWORD` / `DB_POOL_SIZE`
- `EMBEDDING_PROVIDER`
- `GA4_API_SECRET` / `GA4_MEASUREMENT_ID` / `GA4_ENABLED` / `GA4_ENDPOINT` / `GA4_DEBUG_*`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `GOOGLE_DESKTOP_CLIENT_ID` / `GOOGLE_DESKTOP_CLIENT_SECRET`
- `GRAFANA_ADMIN_PASSWORD`
- `INTERNAL_API_KEY`
- `JWT_ACCESS_EXPIRY` / `JWT_REFRESH_EXPIRY` / `JWT_SECRET`
- `LLM_PROVIDER`
- `LOG_LEVEL`
- `MAIL_FROM` / `MAIL_HOST` / `MAIL_OPERATOR_TO` / `MAIL_PASSWORD` / `MAIL_PORT` / `MAIL_USERNAME`
- `OPENAI_API_KEY`
- `PORTONE_API_BASE_URL` / `PORTONE_API_SECRET` / `PORTONE_WEBHOOK_SECRET`
- `PS_JWT_AUDIENCE` / `PS_JWT_K` / `PS_JWT_KID` / `PS_REPL_PASSWORD`
- `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_URL`
- `SERVER_PEPPER` / `SERVER_PEPPER_VERSION`
- `SPRING_PROFILES_ACTIVE`
- `TOSS_API_BASE_URL` / `TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY` / `TOSS_WEBHOOK_SECRET`
- `VAULT_TOKEN`
- `VITE_API_URL` / `VITE_EDITOR_URL` / `VITE_LANDING_URL`
- `VITE_GOOGLE_CLIENT_ID` / `VITE_GOOGLE_DESKTOP_CLIENT_ID`
- `VITE_POWERSYNC_URL`
- `VITE_PORTONE_STORE_ID` / `VITE_PORTONE_CHANNEL_KEY_ONETIME` / `VITE_PORTONE_CHANNEL_KEY_BILLING`

</details>

---

## 11. 참고 문서

- [doppler-setup.md](./doppler-setup.md) - 셋업/토큰 발급 절차
- [dev-setup.md](./dev-setup.md) - 팀원 로컬 환경 가이드
- [deployment.md](./deployment.md) - 배포 흐름
- [ec2-setup-guide.md](./ec2-setup-guide.md) - EC2 초기 셋업
- [gitlab-ci-guide.md](./gitlab-ci-guide.md) - CI 파이프라인
- [infrastructure/admin-api-hardening.md](./infrastructure/admin-api-hardening.md) - admin 토큰 정책
- [security/vault-quickstart.md](./security/vault-quickstart.md) - Vault Token 1회 발급 절차
- [security/encryption-architecture-guide.md](./security/encryption-architecture-guide.md) - pepper / KEK / Vault 흐름
