# StoryZip 인프라

환경별 Docker 컴포즈와 환경변수 템플릿을 관리한다.

## 디렉토리

```
infra/
├── .env.dev.example          # 개발용 환경변수 템플릿
├── .env.test.example         # 테스트용 환경변수 템플릿
├── .env.prod.example         # 운영용 환경변수 템플릿
├── dev/
│   ├── docker-compose.dev.yml    # PostgreSQL + Redis (개발용)
│   └── init-db/                  # 최초 기동 시 실행할 SQL
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
- Node.js 24+ / pnpm
- Java 21 / Gradle
- Python 3.12

### 실행

```bash
# 1. 인프라 환경변수 (Docker Compose 용)
cp infra/.env.dev.example infra/dev/.env

# 2. 백엔드 환경변수 (IDE/bootRun 용)
#    spring-dotenv 가 자동으로 로딩한다.
cp backend/.env.example backend/.env

# 3. 인프라 기동 (PostgreSQL + Redis)
docker compose -f infra/dev/docker-compose.dev.yml --env-file infra/dev/.env up -d

# 4. 백엔드 (별도 터미널) — backend/.env 가 자동 로딩됨
cd backend && ./gradlew bootRun

# 4. AI 서버 (별도 터미널)
cd ai && uvicorn app.main:app --reload --port 8000

# 5. 프론트엔드 등...
cd frontend && pnpm dev
```

### 접속 정보

| 서비스 | 호스트 | 포트 | 기본 계정 |
|--------|--------|------|-----------|
| PostgreSQL | localhost | 5432 | storyzip / storyzip_dev |
| Redis | localhost | 6379 | - |
| Spring Boot | localhost | 8080 | - |
| Swagger UI | localhost | 8080/swagger-ui.html | - |
| FastAPI | localhost | 8000 | - |

### 종료

```bash
docker compose -f infra/dev/docker-compose.dev.yml down       # 데이터 유지
docker compose -f infra/dev/docker-compose.dev.yml down -v    # 데이터 초기화
```

## 테스트 환경 (test)

CI 또는 통합 테스트용. 개발 DB와 격리하기 위해 포트를 5433/6380으로 분리하고 tmpfs를 써서
컨테이너 종료 시 데이터가 사라지도록 구성.

```bash
cp infra/.env.test.example infra/test/.env
docker compose -f infra/test/docker-compose.test.yml --env-file infra/test/.env up -d

cd backend && ./gradlew test \
  -Dspring.profiles.active=test \
  -DDB_PORT=5433 -DREDIS_PORT=6380
```

## 운영 환경 (prod)

백엔드까지 컨테이너로 띄우는 풀스택 구성.

```bash
# 1. 시크릿이 채워진 .env 준비 (절대 커밋 금지)
cp infra/.env.prod.example infra/prod/.env
vi infra/prod/.env  # 모든 __REPLACE_ME__ 교체

# 2. 백엔드 이미지 빌드 + 기동
docker compose -f infra/prod/docker-compose.prod.yml --env-file infra/prod/.env up -d --build
```

운영 컴포즈는:
- PostgreSQL 포트를 외부에 노출하지 않음 (백엔드 컨테이너 내부 통신만)
- Redis는 비밀번호 필수
- 백엔드는 actuator health check로 readiness 확인
- `restart: always`로 장애 시 자동 재기동

## DB 초기화

`infra/db/schema.sql`이 PostgreSQL 최초 기동 시 자동 실행됨.
이미 데이터가 있는 볼륨에서는 재실행되지 않음.
DDL을 다시 적용하려면 `down -v`로 볼륨 삭제 후 재기동.

- `docs/ddl.sql` — 문서 공유/ERD Cloud용 (참고용)
- `infra/db/schema.sql` — 실제 DB 초기화에 사용되는 원본
