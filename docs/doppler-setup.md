# Folio - Doppler 환경변수 관리 세팅 가이드

## 개요

환경변수를 Doppler에서 중앙 관리한다. `.env` 파일 공유 대신 Doppler 대시보드에서 팀 전체가 동일한 시크릿을 사용.

| 환경 | 용도 | 사용처 |
|------|------|--------|
| `dev` | 로컬 개발 | 개발자 PC (`doppler run`) |
| `test` | CI 통합테스트 | GitLab CI 파이프라인 |
| `prd` | 프로덕션 | EC2 배포 서버 |

## 1. Doppler 설치

### Windows

```bash
# Scoop 사용
scoop install doppler

# 또는 공식 설치 스크립트
(Invoke-WebRequest -UseBasicParsing -Uri "https://cli.doppler.com/install.ps1").Content | iex
```

### macOS

```bash
brew install dopplerhq/cli/doppler
```

### Linux

```bash
(curl -Ls --tlsv1.2 --proto "=https" --retry 3 https://cli.doppler.com/install.sh) | sudo sh
```

### 설치 확인

```bash
doppler --version
```

## 2. Doppler 계정 및 프로젝트 준비

### 계정 생성

1. https://dashboard.doppler.com 접속
2. GitHub/Google로 회원가입 (Free 플랜, 5명까지)
3. 조직명: `storyzip` (또는 팀명)

### 프로젝트 및 환경 생성

대시보드에서:
1. New Project → 이름 `storyzip`
2. 자동 생성되는 3개 config 확인: `dev`, `stg`, `prd`
3. `stg` → `test`로 이름 변경 (또는 `test` config 추가 생성)

최종 구조:
```
storyzip (프로젝트)
├── dev        # 로컬 개발
├── test       # CI/테스트
└── prd        # 프로덕션
```

## 3. 로컬 로그인 및 초기 설정

```bash
# 브라우저 열려서 인증
doppler login
```

## 4. 기존 .env 파일을 Doppler로 import (최초 1회)

프로젝트 루트의 관리자가 최초 1회 수행.

```bash
# 1. 템플릿 복사 후 실제 값 채우기
cp infra/.env.dev.example infra/.env.dev
# → 에디터로 열어서 실제 값 입력 (OAuth ID, API 키 등)

# 2. Doppler 연결 (project: storyzip, config: dev)
cd infra
doppler setup

# 3. 파일 업로드 (일괄 import)
doppler secrets upload .env.dev

# 4. 대시보드에서 확인
doppler open
```

**업로드 후 `infra/.env.dev` 파일은 삭제 권장** (Doppler가 원본이 됨).

test, prd config도 동일한 방식으로 import:
```bash
cp infra/.env.test.example infra/.env.test
doppler setup    # config: test 선택
doppler secrets upload .env.test

cp infra/.env.prod.example infra/.env.prod
doppler setup    # config: prd 선택
doppler secrets upload .env.prod
```

## 5. 팀원별 초기 세팅

각 개발자 PC에서 최초 1회:

```bash
# 로그인
doppler login

# 각 서비스 디렉토리에서 연결
cd backend
doppler setup    # project: storyzip, config: dev

cd ../ai
doppler setup    # project: storyzip, config: dev

cd ../frontend
doppler setup    # project: storyzip, config: dev

cd ../infra/dev
doppler setup    # project: storyzip, config: dev
```

`doppler setup`은 디렉토리별로 프로젝트/환경 설정을 `.doppler.yaml` 또는 내부 설정에 저장.

## 6. 실행 방법

### 백엔드 (Spring Boot)

```bash
cd backend
doppler run -- ./gradlew bootRun
```

Doppler가 모든 환경변수를 프로세스에 주입 → `spring-dotenv`나 `backend/.env` 없이도 동작.

### AI 서버 (FastAPI)

```bash
cd ai
doppler run -- uvicorn app.main:app --reload --port 8000
```

### 프론트엔드 (Electron + 웹 에디터)

```bash
cd frontend
doppler run -- pnpm dev           # Electron
doppler run -- pnpm dev:web       # 웹 에디터
```

Vite가 `VITE_*` 접두사 변수를 `import.meta.env.VITE_*`로 노출.

### Docker Compose (dev 인프라)

```bash
cd infra/dev
doppler run -- docker compose -f docker-compose.dev.yml up -d
```

또는 시크릿을 `.env`로 다운로드 후 사용:

```bash
doppler secrets download --no-file --format env > .env
docker compose -f docker-compose.dev.yml --env-file .env up -d
rm .env   # 사용 후 삭제
```

## 7. 시크릿 편집

### CLI로 편집

```bash
# 조회
doppler secrets

# 개별 값 설정
doppler secrets set DB_PASSWORD="new-password"

# 일괄 수정은 대시보드 권장
doppler open
```

### 대시보드에서 편집

https://dashboard.doppler.com → storyzip 프로젝트 → 해당 config에서 편집.

팀원 전체가 `doppler run` 실행 시 자동으로 최신 값 주입.

## 8. CI/CD 연동 (GitLab)

### Service Token 발급

Doppler 대시보드:
1. 프로젝트 설정 → Access → Service Tokens
2. 각 환경별 토큰 생성:
   - `ci-dev` (config: dev)
   - `ci-test` (config: test)
   - `ci-prd` (config: prd)

### GitLab CI Variables 등록

프로젝트 설정 → CI/CD → Variables:
- `DOPPLER_TOKEN_DEV`
- `DOPPLER_TOKEN_TEST`
- `DOPPLER_TOKEN_PRD`

모두 `Masked` + `Protected` 옵션 적용.

### .gitlab-ci.yml 예시

```yaml
build-backend:
  stage: build
  before_script:
    - (curl -Ls --tlsv1.2 https://cli.doppler.com/install.sh) | sh
    - export DOPPLER_TOKEN=$DOPPLER_TOKEN_TEST
  script:
    - cd backend
    - doppler run --config test -- ./gradlew build

deploy-production:
  stage: deploy
  before_script:
    - export DOPPLER_TOKEN=$DOPPLER_TOKEN_PRD
  script:
    - doppler secrets download --config prd --no-file --format env > .env
    - docker compose --env-file .env up -d
    - rm .env
  only:
    - master
```

## 9. Electron 앱 배포 주의사항

Electron 패키지 앱은 사용자 PC에서 실행되므로 **런타임에 Doppler 접근 불가**. 빌드 시점에 `VITE_*` 변수가 번들에 포함됨.

### 프로덕션 빌드 (CI에서만)

```bash
# GitLab CI에서
export DOPPLER_TOKEN=$DOPPLER_TOKEN_PRD
cd frontend
doppler run --config prd -- pnpm make
# → 빌드 결과물에 prd 환경변수 박힘
```

### 포함 가능 vs 금지

| Electron에 포함 가능 | Electron에 포함 금지 |
|---|---|
| `VITE_API_URL` (서버 주소) | `DB_PASSWORD` |
| `VITE_GOOGLE_CLIENT_ID` (public) | `GOOGLE_CLIENT_SECRET` |
| `VITE_POWERSYNC_URL` | `JWT_SECRET` |
| `VITE_SENTRY_DSN` | `OPENAI_API_KEY` |

`VITE_*` 프리픽스가 **없는 변수는 자동 제외**되므로 보안상 안전.

## 10. 문제 해결

### `doppler run`이 변수를 주입하지 않음

```bash
# 현재 연결 확인
doppler configure

# 재설정
doppler setup
```

### 팀원이 특정 시크릿만 보이지 않음

대시보드 → Project Settings → Members에서 권한 확인. Free 플랜은 역할 분리 제한적.

### 오프라인에서 실행

```bash
# 시크릿을 파일로 저장
doppler secrets download --no-file --format env > .env.cache

# 이후 오프라인에서
set -a && source .env.cache && set +a
./gradlew bootRun
```

## 11. Doppler 도입 전/후 비교

| 항목 | 도입 전 | 도입 후 |
|------|--------|--------|
| 시크릿 공유 | Slack/노션/카톡 | Doppler 대시보드 |
| `.env` 파일 관리 | 수동 복사 + 팀원 동기화 | 불필요 (런타임 주입) |
| 변경 반영 | 팀원 모두 수동 갱신 | 즉시 자동 반영 |
| 감사 로그 | 없음 | Doppler Free 플랜 기본 제공 |
| 실수로 커밋 | `.gitignore` 의존 | 파일 자체 없음 |

## 12. 현재 파일 구조와의 관계

```
infra/
├── .env.dev.example      # dev 전체 템플릿 (Doppler import용)
├── .env.test.example     # test 템플릿
├── .env.prod.example     # prd 템플릿
├── dev/
│   ├── docker-compose.dev.yml
│   └── .env.example      # Docker Compose 전용 (기존 유지)
└── db/
    └── schema.sql
```

**정책:**
- `*.example` 파일들은 Git에 커밋 (공개 템플릿, 실제 값 없음)
- 실제 `.env`, `.env.dev` 등은 `.gitignore`로 차단
- Doppler 도입 후 `.env` 파일 생성/공유 불필요

## 13. 도입 작업 체크리스트

- [ ] Doppler 계정 생성 + 팀원 초대
- [ ] `storyzip` 프로젝트 + 3개 config 생성
- [ ] 관리자: `infra/.env.dev.example` 값 채워서 Doppler dev에 업로드
- [ ] 관리자: test / prd config도 동일하게 업로드
- [ ] 팀원: `doppler login` + 각 서비스 디렉토리에서 `doppler setup`
- [ ] 각 서비스 실행을 `doppler run` 방식으로 전환
- [ ] backend의 `spring-dotenv` 제거 여부 검토 (Doppler로 대체)
- [ ] GitLab CI에 Service Token 등록
- [ ] CI 파이프라인에 `doppler run` 적용
- [ ] `backend/.env.example`, `infra/dev/.env.example` 등 중복 템플릿 정리 (선택)
