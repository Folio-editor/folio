# StoryZip 인프라

## 개발 환경 (dev)

로컬 개발 시 PostgreSQL + Redis만 Docker로 기동. 앱은 로컬에서 직접 실행.

### 사전 요구사항

- Docker Desktop
- Node.js 24+ / pnpm
- Java 21 / Gradle
- Python 3.12

### 전체 실행 흐름

```bash
# 1. Docker 인프라 기동 (PostgreSQL + Redis)
docker compose -f infra/dev/docker-compose.dev.yml up -d

# 2. 백엔드 (별도 터미널)
cd backend && ./gradlew bootRun --args='--spring.profiles.active=dev'

# 3. AI 서버 (별도 터미널)
cd ai && uvicorn app.main:app --reload --port 8000

# 4. 프론트엔드 - Electron 데스크탑 (별도 터미널)
cd frontend && pnpm dev

# 5. 프론트엔드 - 웹 에디터 (별도 터미널, 선택)
cd frontend && pnpm dev:web

# 6. 랜딩 페이지 (별도 터미널, 선택)
cd landing && pnpm dev
```

### 접속 정보

| 서비스 | 호스트 | 포트 | 기본 계정 |
|--------|--------|------|-----------|
| PostgreSQL | localhost | 5432 | storyzip / storyzip_dev |
| Redis | localhost | 6379 | - |
| Spring Boot | localhost | 8080 | - |
| FastAPI | localhost | 8000 | - |
| Electron | - | - | GUI 앱 |
| 웹 에디터 | localhost | 5173 | - |
| 랜딩 페이지 | localhost | 5174 | - |

### 종료

```bash
# 서비스 종료 (데이터 유지)
docker compose -f infra/dev/docker-compose.dev.yml down

# 서비스 종료 + 데이터 초기화
docker compose -f infra/dev/docker-compose.dev.yml down -v
```

### DB 초기화

`infra/dev/init-db/init.sql`이 PostgreSQL 최초 기동 시 자동 실행됨.
이미 데이터가 있는 볼륨에서는 재실행되지 않음.
DDL을 다시 적용하려면 `down -v`로 볼륨 삭제 후 재기동.

### 구조

```
infra/
└── dev/
    ├── docker-compose.dev.yml      # PostgreSQL + Redis
    ├── .env.example                # 환경변수 템플릿
    └── init-db/
        └── init.sql                # docs/ddl.sql 기반
```
