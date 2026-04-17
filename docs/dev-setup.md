# Folio - 개발 환경 세팅 가이드

## 프로젝트 구조

```
S14P31F203/
├── frontend/          # Electron 데스크탑 앱 + 웹 에디터 (코드 공유)
├── landing/           # 랜딩 페이지 (별도 React + Vite)
├── backend/           # Spring Boot (메인 백엔드)
├── ai/                # FastAPI (AI 서버)
├── infra/             # Docker 인프라
│   └── dev/           # 개발 환경 (PostgreSQL + Redis)
└── docs/              # 설계 문서
```

---

## 1. 사전 요구사항

| 도구 | 버전 | 용도 |
|------|------|------|
| Docker Desktop | latest | PostgreSQL, Redis 컨테이너 |
| Node.js | 24+ | 프론트엔드 런타임 |
| pnpm | 10+ | 프론트엔드 패키지 매니저 |
| Java | 21 | 백엔드 런타임 |
| Gradle | 8+ (wrapper 포함) | 백엔드 빌드 |
| Python | 3.12 | AI 서버 런타임 |
| Doppler CLI | latest | 환경변수 중앙 관리 (권장) |

### Doppler 초기 세팅

환경변수는 Doppler에서 통합 관리한다. 상세: [doppler-setup.md](doppler-setup.md)

```bash
# 설치 후 로그인
doppler login

# 각 서비스 디렉토리에서 연결 (최초 1회)
cd backend && doppler setup    # storyzip / dev
cd ai && doppler setup
cd frontend && doppler setup
cd infra/dev && doppler setup
```

이후 모든 실행 명령어 앞에 `doppler run -- ` 를 붙인다.

---

## 2. Docker 인프라 기동

개발 환경에서는 DB + Redis만 Docker로 실행. 앱은 로컬에서 직접 실행.

```bash
# 환경변수 파일 생성 (최초 1회)
cp infra/dev/.env.example infra/dev/.env

# 서비스 기동
docker compose -f infra/dev/docker-compose.dev.yml up -d

# 상태 확인
docker compose -f infra/dev/docker-compose.dev.yml ps
```

### Docker 서비스 목록

| 서비스 | 이미지 | 포트 | 설명 |
|--------|--------|------|------|
| postgresql | postgres:16-alpine | 5432 | 개발 DB (WAL logical 활성화) |
| redis | redis:7-alpine | 6379 | Celery broker, 캐시, 인증 |

### DB 초기화

- `infra/dev/init-db/init.sql`이 최초 기동 시 자동 실행 (DDL)
- 볼륨이 존재하면 재실행 안 됨 → DDL 변경 시 `down -v` 후 재기동

---

## 3. 프론트엔드 — Electron 데스크탑 앱 + 웹 에디터

### 기술 스택

| 기술 | 버전 | 역할 |
|------|------|------|
| Electron | 41 | 데스크탑 앱 |
| Electron Forge | latest | 빌드/패키징 |
| Vite | 6 | 번들러 |
| React | 19 | UI |
| TypeScript | 5.8+ | 타입 |
| TipTap | 3 | 에디터 |
| Zustand | 5 | 상태 관리 |
| Tailwind CSS | 4 | 스타일링 |
| shadcn/ui | latest | UI 컴포넌트 |

### 디렉토리 구조

```
frontend/src/
├── main/                    # Electron Main Process
│   ├── index.ts             # 앱 진입점
│   └── preload.ts           # contextBridge (보안)
│
├── renderer/                # Electron Renderer 진입점
│   ├── index.tsx
│   └── App.tsx              # MemoryRouter
│
├── web/                     # Web 에디터 진입점
│   ├── index.html
│   ├── index.tsx
│   └── App.tsx              # BrowserRouter
│
├── shared/                  # 공유 코드 (Electron + Web 100% 공유)
│   ├── components/
│   │   ├── ui/              # 원자 컴포넌트 (shadcn/ui)
│   │   ├── editor/          # TipTap 에디터 (7곳 공유)
│   │   ├── tree/            # 중첩 트리 (세계관/플롯/원고)
│   │   ├── tag/             # 태그 시스템
│   │   └── layout/          # 앱 셸, 사이드바, 패널
│   ├── features/            # 도메인별 기능 모듈
│   │   ├── workspace/       # 워크스페이스
│   │   ├── plan/            # 기획
│   │   ├── world-note/      # 세계관
│   │   ├── character/       # 등장인물
│   │   ├── plot/            # 플롯
│   │   ├── episode/         # 원고
│   │   ├── foreshadow/      # 복선
│   │   └── idea/            # 아이디어 아카이브
│   ├── stores/              # Zustand 스토어 (도메인별)
│   ├── hooks/               # 공통 훅
│   ├── types/               # 타입 정의
│   └── lib/                 # 유틸리티
│
├── platform/                # 플랫폼별 데이터 접근 계층
│   ├── electron/            # IPC → SQLite
│   └── web/                 # fetch → REST API
│
└── styles/
    └── global.css
```

### 빌드 분기

| 명령어 | 대상 | 라우터 | 데이터 계층 |
|--------|------|--------|-----------|
| `pnpm dev` | Electron 데스크탑 앱 | MemoryRouter | platform/electron/ |
| `pnpm dev:web` | 웹 에디터 (브라우저) | BrowserRouter | platform/web/ |

shared/의 모든 코드가 양쪽에서 100% 공유됨. 진입점과 데이터 계층만 분기.

### 실행

```bash
cd frontend
pnpm install

# Electron 데스크탑 앱
pnpm dev

# 웹 에디터
pnpm dev:web
# → http://localhost:5173
```

### 스크립트

| 명령어 | 설명 |
|--------|------|
| `pnpm dev` | Electron 앱 개발 모드 |
| `pnpm dev:web` | 웹 에디터 개발 모드 |
| `pnpm build:web` | 웹 에디터 프로덕션 빌드 |
| `pnpm lint` | ESLint 실행 |
| `pnpm format` | Prettier 포맷팅 |
| `pnpm test` | Vitest 테스트 |
| `pnpm make` | Electron 배포 빌드 |

### 보안 설정 (Electron)

- `contextIsolation: true` — 렌더러 프로세스 격리
- `nodeIntegration: false` — Node.js API 직접 접근 차단
- `contextBridge` — 허용된 API만 렌더러에 노출

---

## 4. 랜딩 페이지

에디터와 완전히 분리된 마케팅 페이지. 에디터 의존성(TipTap, Zustand 등) 없음.

### 기술 스택

- React 19 + Vite 6 + TypeScript + Tailwind CSS 4

### 실행

```bash
cd landing
pnpm install
pnpm dev
# → http://localhost:5174
```

### 배포 시 Nginx 라우팅

```
storyzip.com/           → landing 빌드 (정적)
storyzip.com/editor     → frontend 웹 빌드 (SPA)
storyzip.com/api/*      → backend
```

---

## 5. 백엔드 (Spring Boot)

> 상세: [backend/README.md](../backend/README.md)

| 항목 | 값 |
|------|-----|
| Java | 21 |
| Spring Boot | 3.4 |
| 빌드 | Gradle Kotlin DSL |
| DB | PostgreSQL (localhost:5432) |
| 캐시 | Redis (localhost:6379) |

```bash
cd backend
./gradlew bootRun --args='--spring.profiles.active=dev'
# → http://localhost:8080
```

---

## 6. AI 서버 (FastAPI)

> 상세: [ai/README.md](../ai/README.md)

| 항목 | 값 |
|------|-----|
| Python | 3.12 |
| 프레임워크 | FastAPI |
| 비동기 큐 | Celery + Redis |

```bash
cd ai
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000
```

---

## 7. 전체 통신 구조 (개발 환경)

```
[Electron/React] ──HTTP──→ [Spring Boot :8080] ──HTTP──→ [FastAPI :8000]
   localhost                    localhost                   localhost
        │                          │                          │
        │                          ├──→ [PostgreSQL :5432]    │
        │                          ├──→ [Redis :6379]         │
        └──→ [SQLite(로컬)]         │                          └──→ [Redis :6379]
                                   └──→ [Redis :6379]

[Landing :5174] — 정적 페이지, 백엔드 통신 없음 (개발 환경)
```

모든 서비스가 localhost에서 동작. 클라우드 서버와 통신하지 않음.

---

## 8. 서비스 종료

```bash
# Docker 인프라 종료 (데이터 유지)
docker compose -f infra/dev/docker-compose.dev.yml down

# Docker 인프라 종료 + 데이터 초기화 (볼륨 삭제)
docker compose -f infra/dev/docker-compose.dev.yml down -v
```
