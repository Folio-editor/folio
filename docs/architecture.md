# StoryZip - 아키텍처 및 기술 스택 정의서

## 서비스 개요

StoryZip은 스토리 작가, 소설가를 위한 원고 편집 서비스이다.
데스크탑 앱(IDE)과 웹 브라우저 두 가지 플랫폼으로 제공된다.

### 핵심 기능
- 로컬 SQLite DB 기반의 원고 작성 및 편집 환경
- 챕터/장면 단위의 체계적인 작품 구조 관리
- 오프라인 우선 동작, 네트워크 연결 시 클라우드 동기화
- AI 기반 작가 지원 기능 (설정 충돌 분석, 문장 제안 등)
- DOCX/PDF/TXT 내보내기

---

## 전체 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                        클라이언트                                     │
│                                                                      │
│  ┌──────────────────────┐          ┌──────────────────────┐         │
│  │ 데스크탑 앱 (Electron) │          │ 웹 브라우저 (React)    │         │
│  │  ├─ React + TipTap   │          │  ├─ React + TipTap   │         │
│  │  ├─ SQLite (로컬)     │          │  └─ REST API 직접    │         │
│  │  └─ PowerSync SDK    │          │                      │         │
│  └──────────┬───────────┘          └──────────┬───────────┘         │
│             │ 동기화                            │ API 호출            │
└─────────────┼──────────────────────────────────┼────────────────────┘
              │                                  │
              ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  서버 (Docker Compose)                                │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   Nginx       │  │  PowerSync   │  │  React+Vite  │              │
│  │ (리버스 프록시) │  │ Open Edition │  │  (웹 프론트)  │              │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘              │
│         │                 │                                          │
│         ▼                 ▼                                          │
│  ┌──────────────┐  ┌──────────────┐                                 │
│  │ Spring Boot  │  │ PostgreSQL   │                                 │
│  │ (메인 백엔드)  │  │ (클라우드 DB) │                                 │
│  └──────┬───────┘  └──────────────┘                                 │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────┐                                                   │
│  │  FastAPI      │                                                   │
│  │ (AI 서버)     │──→ OpenAI / Claude API                           │
│  └──────────────┘                                                   │
│                                                                      │
│  ┌──────────────────────────────────────────┐                       │
│  │ 모니터링 (PLG + Prometheus)                │                       │
│  │  Promtail → Loki → Grafana              │                       │
│  │  Prometheus (메트릭 수집)                  │                       │
│  └──────────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 백엔드

### Spring Boot (메인 백엔드)

| 역할 | 설명 |
|------|------|
| 인증 | Google OAuth 2.0, JWT 발급/검증/갱신 |
| 결제/구독 | Toss Payments 연동, 토큰 지갑 관리 |
| 파일 관리 | 이미지 업로드 (S3), 내보내기 파일 생성 |
| 알림 | 시스템/결제/구독/사용량 알림 |
| AI 중계 | FastAPI AI 서버로 요청 전달, 토큰 차감 |
| 감사 로그 | 사용자 행동 기록 |

**Spring Boot는 데이터 CRUD API를 만들지 않는다.** 데이터 동기화는 PowerSync가 자동 처리.

### PostgreSQL (클라우드 DB)

| 역할 | 설명 |
|------|------|
| 서버 원본 DB | 모든 동기화 데이터의 서버 측 저장소 |
| 서버 전용 데이터 | 인증, 결제, 로그, AI 분석 등 |
| JSONB 지원 | Plan의 genres, moods 등 태그 배열 검색 |
| PowerSync 연동 | 논리 복제 (logical replication) 활성화 필요 |

### FastAPI (AI 서버)

| 역할 | 설명 |
|------|------|
| AI API 호출 | OpenAI, Claude 등 외부 AI API 호출 |
| 프롬프트 처리 | 템플릿 기반 프롬프트 구성 및 실행 |
| 비동기 처리 | 응답 시간이 긴 AI 요청의 비동기 처리 |

Spring Boot에서 분리하는 이유:
- Python AI 생태계 (LangChain 등) 활용
- AI 서버 독립 스케일링 가능
- AI 모델/프롬프트 변경 시 메인 백엔드 영향 없음

---

## 프론트엔드

### 데스크탑 앱 (Electron)

| 기술 | 버전 | 역할 |
|------|------|------|
| Electron | v41 | 데스크탑 앱 프레임워크 |
| Electron Forge | latest | 빌드, 패키징, 배포 도구 |
| Vite | v8 | 번들러 (Electron Forge 플러그인) |

#### Electron 프로세스 구조
```
┌─────────────────────────────────────────────┐
│ Main Process (Node.js)                      │
│  ├─ better-sqlite3 (로컬 SQLite DB)         │
│  ├─ PowerSync Node.js SDK (동기화)           │
│  ├─ IPC 핸들러 (DB CRUD, 내보내기)            │
│  ├─ electron-updater (자동 업데이트)          │
│  └─ keytar (OS 자격증명 저장소)              │
├─────────────────────────────────────────────┤
│ Preload Script (contextBridge)              │
│  └─ 안전한 API만 renderer에 노출             │
├─────────────────────────────────────────────┤
│ Renderer Process (React)                    │
│  ├─ TipTap 에디터                           │
│  ├─ Zustand 상태 관리                        │
│  └─ shadcn/ui 컴포넌트                       │
└─────────────────────────────────────────────┘
```

#### 통신 경로
| 대상 | 방식 | API 구현 |
|------|------|----------|
| 데이터 CRUD | IPC → SQLite → PowerSync 자동 동기화 | 불필요 |
| 인증 | REST API → Spring Boot | 필요 |
| AI 기능 | REST API → Spring Boot → FastAPI | 필요 |
| 결제 | REST API → Spring Boot | 필요 |

### 웹 브라우저 (React)

데스크탑 앱과 동일한 React 코드베이스를 공유. 데이터 접근 계층만 분기.

| 구분 | 데스크탑 | 웹 |
|------|---------|-----|
| 데이터 접근 | IPC → SQLite | REST API → PostgreSQL |
| 오프라인 | 지원 | 미지원 |
| 개발 순서 | 1순위 | 2순위 |

### 공유 UI/UX 기술 스택

| 기술 | 버전 | 역할 |
|------|------|------|
| React | 19 | UI 프레임워크 |
| TypeScript | 5.8 | 정적 타입 |
| TipTap | 3 | 리치 텍스트 에디터 (ProseMirror 기반) |
| Zustand | 5 | 상태 관리 |
| Immer | 10 | 불변 상태 업데이트 |
| shadcn/ui | latest | UI 컴포넌트 (Radix 기반) |
| Tailwind CSS | 4 | 스타일링 |
| React Router | 7 | 라우팅 (데스크탑: MemoryRouter, 웹: BrowserRouter) |

### TipTap 확장

| 패키지 | 용도 |
|--------|------|
| `@tiptap/starter-kit` | 기본 서식 (볼드, 이탤릭, 헤딩, 리스트 등) |
| `@tiptap/extension-character-count` | 글자수/단어수 카운트 |
| `@tiptap/extension-placeholder` | 플레이스홀더 |
| `@tiptap/extension-highlight` | 하이라이트 |
| `@tiptap/extension-typography` | 스마트 따옴표, em-dash |
| `@tiptap/extension-underline` | 밑줄 |
| `@tiptap/extension-text-align` | 텍스트 정렬 |
| `@tiptap/extension-color` | 텍스트 색상 |
| `@tiptap/extension-image` | 이미지 삽입 |
| `@tiptap/extension-link` | 하이퍼링크 |

### UI 보조 라이브러리

| 패키지 | 용도 |
|--------|------|
| `@radix-ui/*` | 접근성 프리미티브 (dialog, dropdown, tabs 등) |
| `lucide-react` | 아이콘 |
| `@dnd-kit/core`, `@dnd-kit/sortable` | 챕터/장면 드래그앤드롭 정렬 |
| `react-resizable-panels` | 리사이즈 가능한 패널 레이아웃 |
| `cmdk` | 커맨드 팔레트 (Ctrl+K) |
| `sonner` | 토스트 알림 |
| `date-fns` | 날짜 포맷 |
| `clsx`, `tailwind-merge`, `class-variance-authority` | CSS 유틸리티 |

### Electron Main Process 패키지

| 패키지 | 용도 |
|--------|------|
| `better-sqlite3` | 로컬 SQLite DB (동기식, 고성능) |
| `@powersync/node` | PowerSync Node.js SDK |
| `electron-store` | 앱 수준 설정 저장 (창 위치, 최근 프로젝트) |
| `electron-updater` | 자동 업데이트 |
| `electron-rebuild` | 네이티브 모듈 Electron용 재빌드 |
| `docx` | DOCX 내보내기 |
| `pdfkit` | PDF 내보내기 |
| `keytar` | OS 자격증명 저장소 (인증 토큰) |

### 코드 공유 전략

```
frontend/src/
  main/              ← Electron Main Process
  renderer/          ← Electron Renderer 진입점 (MemoryRouter)
  web/               ← Web 에디터 진입점 (BrowserRouter)
  shared/            ← 공유 코드 (에디터, UI, 상태 관리, 비즈니스 로직)
    components/      ← ui/, editor/, tree/, tag/, layout/
    features/        ← 도메인별 기능 모듈 (workspace, plan, episode 등)
    stores/          ← Zustand 스토어
    hooks/           ← 공통 훅
    types/           ← TypeScript 타입
    lib/             ← 유틸리티
  platform/
    electron/        ← IPC → SQLite
    web/             ← fetch → REST API
```

### 프로젝트 분리

```
S14P31F203/
├── frontend/        ← Electron 데스크탑 앱 + 웹 에디터 (코드 공유)
├── landing/         ← 랜딩 페이지 (별도 React + Vite, 에디터 의존성 없음)
├── backend/         ← Spring Boot
├── ai/              ← FastAPI
├── infra/           ← Docker 인프라
└── docs/            ← 설계 문서
```

랜딩 페이지와 웹 에디터는 완전히 분리. Nginx에서 경로로 구분:
- `storyzip.com/` → landing (정적 마케팅)
- `storyzip.com/editor` → frontend 웹 빌드 (SPA 에디터)

---

## 로컬 DB (SQLite)

| 항목 | 설명 |
|------|------|
| 저장소 | 로컬 SQLite 단일 DB 파일 |
| 원고 포맷 | TipTap JSON (TEXT 컬럼에 저장) |
| 동기화 | PowerSync가 로컬 SQLite ↔ 서버 PostgreSQL 자동 동기화 |
| 오프라인 우선 | 모든 읽기/쓰기는 로컬 SQLite에서 즉시 처리 |
| WAL 모드 | 활성화 (동시 읽기/쓰기 성능 향상) |

---

## 인프라

> 상세 설계는 [infra.md](infra.md) 참조

### 핵심 구성

| 항목 | 기술 |
|------|------|
| 서버 | EC2 단일 서버 |
| 컨테이너 | Docker Compose |
| 배포 전략 | Blue/Green 무중단 배포 |
| CI/CD | GitLab CI/CD (self-hosted runner) |
| 환경변수 | Doppler (dev / test / prd) |
| SSL | Let's Encrypt + Certbot |
| 모니터링 | PLG 스택 (로그) + Prometheus (메트릭) → Grafana |

### Docker 환경 분리

| 환경 | 목적 | Docker 대상 | 앱 실행 방식 |
|------|------|-------------|-------------|
| dev | 로컬 개발 | DB, Redis만 | 로컬 직접 실행 (HMR) |
| test | 통합 테스트 (CI) | DB, PowerSync + 앱 전체 | 컨테이너 내 실행 |
| prod | 프로덕션 배포 | 전체 (Blue/Green) | 컨테이너 이미지 |

### 서버 컨테이너 구성 (프로덕션)

| 컨테이너 | 이미지 | 역할 |
|----------|--------|------|
| nginx | nginx:alpine | 리버스 프록시, SSL 종단, 정적 파일 서빙 |
| spring-boot | 자체 빌드 | 메인 백엔드 (인증, 결제, 파일 관리) |
| fastapi | 자체 빌드 | AI 서버 (프롬프트 처리, AI API 호출) |
| postgresql | postgres:16 | 클라우드 DB |
| powersync | powersync/service | SQLite ↔ PostgreSQL 동기화 엔진 (무료) |
| react-web | 자체 빌드 (Vite) | 웹 프론트엔드 |
| promtail | grafana/promtail | 로그 수집 |
| loki | grafana/loki | 로그 저장 |
| grafana | grafana/grafana | 대시보드 |
| prometheus | prom/prometheus | 메트릭 수집 |

### CI/CD 파이프라인

```
test → build → integration → deploy
```

| 브랜치 | test | build | integration | deploy |
|--------|:----:|:-----:|:-----------:|:------:|
| feature/* (MR) | O | X | X | X |
| develop | O | O | O | X |
| master | O | O | O | O |

---

## 보안

### Electron 보안 모델
- Context Isolation 활성화
- nodeIntegration 비활성화
- Preload Script + contextBridge로 안전한 API만 renderer에 노출
- IPC: `ipcMain.handle` + `ipcRenderer.invoke` 패턴

### API 보안
- JWT 토큰 기반 인증 (Access Token + Refresh Token)
- Rate Limiting (무차별 대입 공격 방지)
- 파일 업로드 시 확장자/MIME 타입 검사
- AI API 키는 서버에서만 관리 (클라이언트 미노출)

### 데이터 보안
- PowerSync RLS (Row Level Security) — writer_id 기반 데이터 격리
- OAuth 토큰은 OS 자격증명 저장소(keytar)에 보관
- 회원 탈퇴 시 개인정보 마스킹/파기

---

## 자동 저장

- 디바운스 자동 저장 (마지막 키입력 후 2초)
- 주기적 전체 저장 (60초)
- 앱 종료 전 최종 저장 (`before-quit`)
- SQLite WAL 모드 활성화

---

## 내보내기 지원

| 포맷 | 우선순위 |
|------|----------|
| DOCX | 1순위 (출판사 제출) |
| PDF | 1순위 (인쇄/검토) |
| TXT | 1순위 (웹소설 플랫폼 업로드) |
| EPUB | 추후 확장 |

---

## 개발 도구

| 도구 | 용도 |
|------|------|
| pnpm | 패키지 매니저 |
| ESLint v9 + @typescript-eslint | 린팅 |
| Prettier + prettier-plugin-tailwindcss | 코드 포맷팅 |
| Vitest | 테스트 프레임워크 |
| @testing-library/react | 컴포넌트 테스트 |
| husky + lint-staged | pre-commit 훅 |
