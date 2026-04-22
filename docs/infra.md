# Folio - 인프라 설계서

## 개요

EC2 단일 서버에 Docker Compose로 전체 서비스를 운영한다.
환경변수는 Doppler로 중앙 관리하며, GitLab CI/CD로 Blue/Green 무중단 배포를 수행한다.

---

## 1. Docker 환경 분리

개발(dev), 통합테스트(test), 프로덕션(prod) 세 가지 Docker 환경을 분리 운영한다.

| 환경 | 목적 | Docker 대상 | 앱 실행 방식 |
|------|------|-------------|-------------|
| **dev** | 로컬 개발 | DB, Redis, MongoDB, PowerSync | 로컬 직접 실행 (HMR) |
| **test** | 통합 테스트 (CI) | DB, PowerSync + 앱 전체 | 컨테이너 내 실행 |
| **prod** | 프로덕션 배포 | 전체 (Blue/Green) | 컨테이너 이미지 |

---

### 1.1 개발 환경 (dev)

로컬 개발 시 인프라 의존 서비스(DB, PowerSync)만 Docker로 기동하고, 앱은 로컬에서 직접 실행한다.

**Docker로 띄우는 서비스:**

| 서비스 | 포트 | 설명 |
|--------|------|------|
| PostgreSQL | 5432 | 개발용 DB (logical replication 활성화) |
| Redis | 6379 | Refresh Token 저장소 |
| MongoDB | (내부 전용) | PowerSync 메타 저장소 |
| PowerSync | 8090 | 동기화 엔진 (Open Edition) |

**인증 방식:** dev는 HS256 공유 시크릿(`JWT_SECRET`) — Spring Boot가 발급한 Access Token을 PowerSync가 그대로 검증한다. prod 직전에 RS256/JWKS로 전환 예정.

**로컬에서 직접 실행하는 서비스:**

| 서비스 | 도구 | 설명 |
|--------|------|------|
| Electron (프론트) | `pnpm dev` | HMR, 빠른 피드백 |
| React Web (프론트) | `pnpm dev:web` | HMR |
| Spring Boot (백엔드) | IntelliJ / `./gradlew bootRun` | 디버깅 용이 |
| FastAPI (AI) | `uvicorn` / PyCharm | 디버깅 용이 |

**개발 흐름:**

```
# 1. 인프라 서비스 기동
doppler run -- docker compose -f infra/dev/docker-compose.dev.yml up -d

# 2. 프론트엔드 개발 (별도 터미널)
doppler run -- pnpm dev

# 3. 백엔드 개발 (별도 터미널)
doppler run -- ./gradlew bootRun
```

---

### 1.2 통합테스트 환경 (test)

CI에서 프론트 ↔ 백엔드 ↔ DB ↔ PowerSync 전체 연동을 검증한다.
실제 배포 이미지와 동일한 환경에서 테스트한다.

**Docker로 띄우는 서비스:**

| 서비스 | 설명 |
|--------|------|
| postgresql-test | 테스트 전용 DB (격리, 매 실행마다 초기화) |
| powersync-test | 동기화 엔진 |
| spring-boot-test | 백엔드 (빌드된 이미지) |
| fastapi-test | AI 서버 (빌드된 이미지) |

**통합테스트 흐름:**

```
1. docker compose -f infra/test/docker-compose.test.yml up -d
2. DB 마이그레이션 + 시드 데이터 적용
3. 백엔드 API 통합 테스트 실행
4. 프론트엔드 E2E 테스트 실행 (Playwright, 추후)
5. docker compose -f infra/test/docker-compose.test.yml down -v
   (볼륨 포함 정리 → 다음 실행 시 깨끗한 상태 보장)
```

**격리 원칙:**
- 테스트 DB는 매 실행마다 초기화 (볼륨 삭제)
- 테스트 환경은 프로덕션/개발 DB에 영향 없음
- CI 파이프라인에서만 실행 (로컬 실행도 가능)

---

### 1.3 프로덕션 환경 (prod)

EC2 서버에서 모든 서비스를 컨테이너로 운영한다.
앱 서비스(spring-boot, fastapi, react-web)는 Blue/Green 이중 구성으로 무중단 배포한다.

**서비스 구성:**

| 구분 | 서비스 | 배포 시 교체 여부 |
|------|--------|:-:|
| 공유 (고정) | Nginx | X (reload만) |
| | PostgreSQL | X |
| | PowerSync | X |
| 앱 (교체) | Spring Boot | O |
| | FastAPI | O |
| | React Web | O |
| 모니터링 (고정) | Promtail, Loki, Grafana, Prometheus | X |

---

## 2. 무중단 배포 (Blue/Green)

### 포트 매핑

```
                Blue     Green
spring-boot     8081     8082
fastapi         8091     8092
react-web       3001     3002
```

### 배포 흐름

```
1. 현재 활성 색상 확인 (예: blue가 live)
2. 새 Docker 이미지 pull (CI에서 빌드한 이미지)
3. Doppler에서 prd 환경 시크릿 가져오기
4. Green 컨테이너 기동
   docker compose -f docker-compose.yml -f docker-compose.green.yml up -d
5. 헬스체크 (각 서비스 /health 엔드포인트, 최대 60초 대기)
6. Nginx upstream을 green으로 전환 + reload
   cp nginx/upstream-green.conf nginx/upstream-active.conf
   docker compose exec nginx nginx -s reload
7. Blue 컨테이너 종료
   docker compose -f docker-compose.blue.yml down
8. active-color 파일을 green으로 업데이트
```

### Nginx upstream 설정

```nginx
# upstream-blue.conf
upstream backend {
    server spring-boot-blue:8080;
}
upstream ai {
    server fastapi-blue:8000;
}
upstream frontend {
    server react-web-blue:80;
}

# upstream-green.conf
upstream backend {
    server spring-boot-green:8080;
}
upstream ai {
    server fastapi-green:8000;
}
upstream frontend {
    server react-web-green:80;
}
```

### Nginx 라우팅

```
https://storyzip.com
  ├─ /                 → frontend (React Web)
  ├─ /api/auth/*       → backend (Spring Boot)
  ├─ /api/payment/*    → backend
  ├─ /api/ai/*         → backend → FastAPI
  ├─ /api/export/*     → backend
  └─ /sync/*           → PowerSync
```

### 롤백

- 이전 색상 컨테이너 재기동 + Nginx upstream 복원
- 이전 이미지 태그를 보관하여 즉시 롤백 가능

---

## 3. Doppler 환경변수 관리

모든 환경변수는 Doppler에서 중앙 관리한다. `.env` 파일은 사용하지 않는다.

### 환경 구성

| Doppler 환경 | 용도 | 사용처 |
|-------------|------|--------|
| `dev` | 로컬 개발 | 개발자 PC (`doppler run`) |
| `test` | CI 통합테스트 | GitLab CI 파이프라인 |
| `prd` | 프로덕션 | EC2 배포 서버 |

### 관리 대상 시크릿

| 카테고리 | 키 예시 |
|----------|---------|
| DB | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` |
| JWT | `JWT_SECRET`, `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY` |
| OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| AI | `OPENAI_API_KEY`, `CLAUDE_API_KEY` |
| 결제 | `TOSS_SECRET_KEY`, `TOSS_CLIENT_KEY` |
| PowerSync | `POWERSYNC_URL`, `POWERSYNC_PUBLIC_KEY` |
| S3 | `AWS_ACCESS_KEY`, `AWS_SECRET_KEY`, `S3_BUCKET` |
| 앱 | `APP_PORT`, `CORS_ORIGINS`, `LOG_LEVEL` |

### 사용 방법

**개발자 로컬:**
```bash
# 초기 1회 설정
doppler setup    # 프로젝트 선택 → dev 환경 선택

# 환경변수 주입하여 실행
doppler run -- pnpm dev
doppler run -- ./gradlew bootRun
doppler run -- docker compose -f docker-compose.dev.yml up -d
```

**CI/CD 파이프라인:**
```bash
# GitLab CI Variables에 DOPPLER_TOKEN (Service Token) 등록
# 파이프라인에서 시크릿 다운로드
doppler secrets download --project storyzip --config prd --no-file --format env > .env
docker compose --env-file .env up -d
```

### .env 파일 정책

- `.env`, `.env.dev`, `.env.prod` 등 파일 **사용하지 않음**
- `.gitignore`에 `.env*` 추가 (실수 방지)
- 모든 환경변수는 Doppler 단일 소스에서 관리

---

## 4. GitLab CI/CD

### Runner

EC2 서버에 GitLab Runner를 자체 호스팅한다.

| 항목 | 설정 |
|------|------|
| 설치 위치 | EC2 배포 서버 |
| Executor | Docker |
| 태그 | `deploy` |

배포 서버에 직접 접근이 필요하므로 self-hosted runner를 사용한다.

### 파이프라인 단계

```yaml
stages:
  - test           # 단위 테스트 + 린트
  - build          # Docker 이미지 빌드
  - integration    # 통합 테스트
  - deploy         # 무중단 배포
```

### 브랜치별 실행 범위

| 브랜치 | test | build | integration | deploy |
|--------|:----:|:-----:|:-----------:|:------:|
| feature/* (MR) | O | X | X | X |
| develop | O | O | O | X |
| master | O | O | O | O |

### .gitlab-ci.yml

```yaml
variables:
  DOCKER_REGISTRY: ${CI_REGISTRY}
  IMAGE_TAG: ${CI_COMMIT_SHORT_SHA}

stages:
  - test
  - build
  - integration
  - deploy

# ────────────────────────────────────────
# Test (단위 테스트 + 린트)
# ────────────────────────────────────────

test-frontend:
  stage: test
  image: node:22-alpine
  script:
    - corepack enable && pnpm install --frozen-lockfile
    - pnpm lint
    - pnpm test
  rules:
    - if: $CI_MERGE_REQUEST_ID
    - if: $CI_COMMIT_BRANCH =~ /^(develop|master)$/

test-backend:
  stage: test
  image: gradle:8-jdk21
  script:
    - cd backend && ./gradlew test
  rules:
    - if: $CI_MERGE_REQUEST_ID
    - if: $CI_COMMIT_BRANCH =~ /^(develop|master)$/

# ────────────────────────────────────────
# Build (Docker 이미지)
# ────────────────────────────────────────

.build-template:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
  rules:
    - if: $CI_COMMIT_BRANCH =~ /^(develop|master)$/

build-spring:
  extends: .build-template
  script:
    - docker build -f infra/dockerfiles/Dockerfile.spring -t $DOCKER_REGISTRY/spring-boot:$IMAGE_TAG ./backend
    - docker push $DOCKER_REGISTRY/spring-boot:$IMAGE_TAG

build-fastapi:
  extends: .build-template
  script:
    - docker build -f infra/dockerfiles/Dockerfile.fastapi -t $DOCKER_REGISTRY/fastapi:$IMAGE_TAG ./ai
    - docker push $DOCKER_REGISTRY/fastapi:$IMAGE_TAG

build-web:
  extends: .build-template
  script:
    - docker build -f infra/dockerfiles/Dockerfile.web -t $DOCKER_REGISTRY/react-web:$IMAGE_TAG ./frontend
    - docker push $DOCKER_REGISTRY/react-web:$IMAGE_TAG

# ────────────────────────────────────────
# Integration (통합 테스트)
# ────────────────────────────────────────

integration-test:
  stage: integration
  tags:
    - deploy
  before_script:
    - doppler secrets download --project storyzip --config test --no-file --format env > .env
  script:
    - docker compose --env-file .env -f infra/test/docker-compose.test.yml up -d
    - bash infra/scripts/health-check.sh
    - docker compose -f infra/test/docker-compose.test.yml exec spring-boot-test ./gradlew integrationTest
  after_script:
    - docker compose -f infra/test/docker-compose.test.yml down -v
  rules:
    - if: $CI_COMMIT_BRANCH =~ /^(develop|master)$/

# ────────────────────────────────────────
# Deploy (무중단 배포)
# ────────────────────────────────────────

deploy-production:
  stage: deploy
  tags:
    - deploy
  before_script:
    - doppler secrets download --project storyzip --config prd --no-file --format env > .env
  script:
    - cd /opt/storyzip
    - bash infra/scripts/deploy.sh $IMAGE_TAG
  rules:
    - if: $CI_COMMIT_BRANCH == "master"
  environment:
    name: production
```

---

## 5. 디렉토리 구조

### 프로젝트 저장소

```
infra/
├── dev/
│   └── docker-compose.dev.yml         # 개발용 (PostgreSQL, PowerSync)
├── test/
│   └── docker-compose.test.yml        # 통합테스트용 (DB + 앱 전체)
├── prod/
│   ├── docker-compose.yml             # 공유 서비스 (Nginx, DB, PowerSync, 모니터링)
│   ├── docker-compose.blue.yml        # Blue 앱 인스턴스
│   ├── docker-compose.green.yml       # Green 앱 인스턴스
│   ├── nginx/
│   │   ├── nginx.conf
│   │   ├── upstream-blue.conf
│   │   └── upstream-green.conf
│   ├── prometheus/
│   │   └── prometheus.yml
│   └── promtail/
│       └── promtail.yml
├── dockerfiles/
│   ├── Dockerfile.spring              # Spring Boot 멀티스테이지 빌드
│   ├── Dockerfile.fastapi             # FastAPI
│   └── Dockerfile.web                 # React Web (Vite 빌드 → Nginx 서빙)
└── scripts/
    ├── deploy.sh                      # 무중단 배포 스크립트
    └── health-check.sh                # 헬스체크 스크립트
```

### EC2 서버

```
/opt/storyzip/
├── infra/                             # Git clone 또는 CI/CD 배포
├── data/                              # 영속 데이터 (Docker 볼륨)
│   ├── postgresql/
│   ├── loki/
│   └── grafana/
└── active-color                       # 현재 활성 색상 (blue 또는 green)
```

---

## 6. SSL

Let's Encrypt + Certbot을 사용한다.

- Nginx 컨테이너에 Certbot 인증서/챌린지 디렉토리 볼륨 마운트
- 초기 발급: `certbot certonly --webroot -w /var/www/certbot -d storyzip.com`
- 자동 갱신: cron 또는 별도 certbot 컨테이너로 주기적 갱신
- 인증서 경로: `/etc/letsencrypt/live/storyzip.com/`

```
infra/prod/
├── certbot/
│   ├── conf/          # 인증서 저장 (볼륨)
│   └── www/           # ACME 챌린지 (볼륨)
```

---

## 7. 모니터링

### PLG 스택 (로그)

```
Spring Boot ──┐
FastAPI ──────┤── Promtail → Loki → Grafana (로그 대시보드)
PostgreSQL ───┤
PowerSync ────┘
```

### Prometheus (메트릭)

```
Spring Boot ──┐
FastAPI ──────┤── Prometheus → Grafana (메트릭 대시보드)
PostgreSQL ───┘
```

- Spring Boot: `/actuator/prometheus` 엔드포인트 노출
- 임계값 초과 시 Grafana Alert 연동
