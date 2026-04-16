# StoryZip 인프라

환경별 Docker Compose와 환경변수 템플릿을 관리한다.
환경변수는 **Doppler**를 통해 중앙 관리하는 것을 원칙으로 한다. 상세: [docs/doppler-setup.md](../docs/doppler-setup.md)

## 디렉토리

```
infra/
├── .env.dev.example          # 개발용 통합 환경변수 템플릿 (Doppler import용)
├── .env.test.example         # 테스트용 환경변수 템플릿
├── .env.prod.example         # 운영용 환경변수 템플릿
├── db/
│   ├── schema.sql            # DB 스키마 원본 (DDL)
│   └── powersync-init.sql    # PowerSync replication role + publication
├── dev/
│   ├── docker-compose.dev.yml    # PostgreSQL + Redis + MongoDB + PowerSync
│   └── .env.example              # Docker Compose 전용 (dev 인프라 기동만)
├── powersync/
│   └── sync-rules.yaml       # writer_id 기반 RLS sync rule
├── test/
│   └── docker-compose.test.yml   # PostgreSQL + Redis (CI/통합 테스트, tmpfs)
└── prod/
    └── docker-compose.prod.yml   # 백엔드 + PostgreSQL + Redis 풀스택
```

## 백엔드 프로필 매핑

| Compose | Spring 프로필 | DDL 정책 | Swagger | 비고 |
|---------|---------------|----------|---------|------|
| dev     | `dev`         | `update`     | ON  | 로컬 IDE 실행, DB/Redis만 컨테이너 |
| test    | `test`        | `create-drop`| OFF | 매 실행마다 초기화, tmpfs |
| prod    | `prod`        | `validate`   | OFF | 백엔드 포함 풀 컨테이너 |

## 개발 환경 (dev)

로컬 개발 시 PostgreSQL + Redis만 Docker로 기동. 앱은 로컬에서 직접 실행.

### 사전 요구사항

- Docker Desktop
- Node.js 24+ / pnpm 10+
- Java 21 / Gradle
- Python 3.12
- Doppler CLI (권장)

### 실행 (Doppler 사용 — 권장)

```bash
# 최초 1회: Doppler 로그인 + 프로젝트 연결
doppler login
cd infra/dev && doppler setup    # storyzip / dev 선택

# 1. 인프라 기동 (PostgreSQL + Redis)
doppler run -- docker compose -f infra/dev/docker-compose.dev.yml up -d

# 2. 백엔드 (별도 터미널)
cd backend && doppler run -- ./gradlew bootRun

# 3. AI 서버 (별도 터미널)
cd ai && doppler run -- uvicorn app.main:app --reload --port 8000

# 4. 프론트엔드 (별도 터미널)
cd frontend && doppler run -- pnpm dev

# 5. 웹 에디터 (별도 터미널, 선택)
cd frontend && doppler run -- pnpm dev:web

# 6. 랜딩 페이지 (별도 터미널, 선택)
cd landing && pnpm dev
```

### 실행 (기존 .env 방식 — Fallback)

Doppler 도입 전이거나 오프라인 환경:

```bash
# 1. 환경변수 파일 준비
cp infra/dev/.env.example infra/dev/.env
cp backend/.env.example backend/.env

# 2. 인프라 기동
docker compose -f infra/dev/docker-compose.dev.yml --env-file infra/dev/.env up -d

# 3. 백엔드 (spring-dotenv가 backend/.env 자동 로딩)
cd backend && ./gradlew bootRun

# 4. 나머지 동일
```

### 접속 정보

| 서비스 | 호스트 | 포트 | 기본 계정 |
|--------|--------|------|-----------|
| PostgreSQL | localhost | 5432 | storyzip / storyzip_dev |
| Redis | localhost | 6379 | - |
| MongoDB | (내부 전용) | - | - (PowerSync 메타 저장소) |
| PowerSync | localhost | 8090 | - (HS256 JWT 인증) |
| Spring Boot | localhost | 8080 | - |
| Swagger UI | localhost | 8080/swagger-ui.html | - |
| FastAPI | localhost | 8000 | - |
| 웹 에디터 | localhost | 5173 | - |
| 랜딩 페이지 | localhost | 5174 | - |

### 종료

```bash
docker compose -f infra/dev/docker-compose.dev.yml down       # 데이터 유지
docker compose -f infra/dev/docker-compose.dev.yml down -v    # 데이터 초기화
```

## 테스트 환경 (test)

CI 또는 통합 테스트용. 개발 DB와 격리하기 위해 포트를 5433/6380으로 분리하고 tmpfs를 써서
컨테이너 종료 시 데이터가 사라지도록 구성.

```bash
# Doppler 방식
doppler run --config test -- docker compose -f infra/test/docker-compose.test.yml up -d
doppler run --config test -- ./gradlew test -Dspring.profiles.active=test

# 또는 기존 방식
cp infra/.env.test.example infra/test/.env
docker compose -f infra/test/docker-compose.test.yml --env-file infra/test/.env up -d
```

## 운영 환경 (prod)

백엔드까지 컨테이너로 띄우는 풀스택 구성.

```bash
# Doppler 방식 (권장)
doppler run --config prd -- docker compose -f infra/prod/docker-compose.prod.yml up -d --build

# 또는 시크릿 파일 다운로드 방식
doppler secrets download --config prd --no-file --format env > infra/prod/.env
docker compose -f infra/prod/docker-compose.prod.yml --env-file infra/prod/.env up -d --build
rm infra/prod/.env   # 사용 후 즉시 삭제
```

운영 컴포즈 특징:
- PostgreSQL 포트를 외부에 노출하지 않음 (백엔드 컨테이너 내부 통신만)
- Redis는 비밀번호 필수
- 백엔드는 actuator health check로 readiness 확인
- `restart: always`로 장애 시 자동 재기동

## DB 스키마

- `docs/ddl.sql` — 문서 공유/ERD Cloud용 참고
- `infra/db/schema.sql` — 실제 DB 초기화에 사용되는 원본 (01-)
- `infra/db/powersync-init.sql` — PowerSync replication role + publication (02-)

두 파일 모두 PostgreSQL 최초 기동 시 자동 실행됨.
이미 데이터가 있는 볼륨에서는 재실행되지 않음.
DDL을 다시 적용하려면 `down -v`로 볼륨 삭제 후 재기동.

**기존 dev 환경에 PowerSync를 처음 추가하는 경우:**
기존 `storyzip-pgdata-dev` 볼륨에는 `powersync_repl` role과 publication이 없으므로 아래 중 하나 수행:
- 데이터 초기화 허용 시: `docker compose down -v` 후 `up -d`
- 데이터 유지 시: `docker exec -i storyzip-postgresql-dev psql -U storyzip -d storyzip < infra/db/powersync-init.sql`

## PowerSync

- 서비스: `journeyapps/powersync-service` (Open Edition, 무료)
- 메타 저장소: MongoDB (`storyzip-mongo-dev`, 내부 통신만)
- 인증: dev는 HS256 공유 시크릿(`JWT_SECRET`) — Spring Boot Access Token 재사용
- sync rule: `infra/powersync/sync-rules.yaml` (writer_id 기반 RLS)

헬스체크:
```bash
curl http://localhost:8090/probes/liveness
curl http://localhost:8090/probes/readiness
```

Replication 상태 확인:
```bash
docker exec -it storyzip-postgresql-dev psql -U storyzip -d storyzip -c \
  "SELECT slot_name, plugin, active FROM pg_replication_slots;"
docker exec -it storyzip-postgresql-dev psql -U storyzip -d storyzip -c \
  "SELECT tablename FROM pg_publication_tables WHERE pubname='powersync';"
```

## Doppler 시크릿 import

최초 1회 관리자가 수행:

```bash
# dev 환경
cp infra/.env.dev.example infra/.env.dev
# → 실제 값 채우기
cd infra && doppler setup   # project: storyzip, config: dev
doppler secrets upload .env.dev
rm .env.dev
```

test, prd도 동일하게. 자세한 가이드: [docs/doppler-setup.md](../docs/doppler-setup.md)
