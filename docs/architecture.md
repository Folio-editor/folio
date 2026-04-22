# Folio - 아키텍처 및 기술 스택 정의서

> 최종 업데이트: 2026-04-16 · 설계 단계를 지나 구현 진행 중 (auth / sync / payment 구현 완료)

## 서비스 개요

Folio는 스토리 작가, 소설가를 위한 원고 편집 서비스이다.
데스크탑 앱(Electron)과 웹 브라우저(React) 두 가지 플랫폼으로 제공된다.

### 핵심 기능
- 로컬 SQLite DB 기반의 원고 작성 및 편집 환경
- 챕터/에피소드/장면 단위의 체계적인 작품 구조 관리
- 오프라인 우선 동작, 네트워크 연결 시 클라우드 동기화
- AI 기반 작가 지원 기능 (설정 충돌 분석, 문장 제안 등)
- DOCX / PDF / TXT 내보내기

---

## 전체 시스템 아키텍처

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             클라이언트                                     │
│                                                                           │
│  ┌───────────────────────────────┐   ┌───────────────────────────────┐   │
│  │ 데스크탑 앱 (Electron Renderer) │   │ 웹 브라우저 (동일 코드베이스)    │   │
│  │  ├─ React 19 + TipTap 3       │   │  ├─ React 19 + TipTap 3       │   │
│  │  ├─ @powersync/web (wa-sqlite)│   │  ├─ @powersync/web (wa-sqlite)│   │
│  │  └─ Zustand 5 / shadcn / T4   │   │  └─ IndexedDB 기반 WASM SQLite│   │
│  │                               │   │                               │   │
│  │ Electron Main (Node.js)        │   │                               │   │
│  │  ├─ Google OAuth PKCE 플로우    │   │                               │   │
│  │  ├─ 토큰/디바이스 ID/게스트 ID    │   │  (OAuth: 표준 웹 리다이렉트)   │   │
│  │  └─ IPC (인증, 앱 제어)         │   │                               │   │
│  └───────────────┬───────────────┘   └──────────────┬────────────────┘   │
│                  │ 동기화 / REST                      │                    │
└──────────────────┼─────────────────────────────────── ┼───────────────────┘
                   ▼                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       서버 (Docker Compose)                                │
│                                                                           │
│  ┌─────────┐   ┌───────────────┐   ┌────────────────┐   ┌────────────┐   │
│  │ Nginx    │   │ PowerSync     │   │ Spring Boot 3.4 │   │ FastAPI   │   │
│  │ (프록시)  │──▶│ Service       │   │ (auth/sync/     │──▶│ (AI 중계) │   │
│  │          │   │ (Open Edition)│   │  payment)       │   │ [예정]     │   │
│  └─────┬────┘   └──────┬────────┘   └────────┬────────┘   └─────┬──────┘  │
│        │               │                     │                  │         │
│        ▼               ▼                     ▼                  ▼         │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │ React    │   │ MongoDB 7    │   │ PostgreSQL 16│   │ Redis 7       │    │
│  │ 웹 빌드   │   │ (싱크 버킷)   │◀──│ (원본 DB,    │   │ (JWT RT,      │    │
│  │          │   │ replica set  │   │  WAL replic.)│   │  세션 캐시)    │    │
│  └──────────┘   └──────────────┘   └──────────────┘   └──────────────┘    │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │ 모니터링 (예정): PLG (Promtail → Loki → Grafana) + Prometheus      │     │
│  └─────────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 구현 현황 요약

| 영역 | 상태 | 비고 |
|------|:----:|------|
| 인증 (Google OAuth + JWT) | ✅ | Electron Main / Spring Boot 양측 완료, 게스트 모드 포함 |
| 동기화 (SQLite ↔ PostgreSQL) | ✅ | PowerSync + 12개 도메인 테이블, `/api/v1/sync/upload` 구현 |
| 결제 (Toss Payments) | ✅ | 토큰 지갑/구독/웹훅 멱등 처리 완료 |
| 에디터 / UI 스캐폴드 | 🟡 | 10개 feature 모듈 골격, CRUD 스크린 일부 구현 |
| AI 중계 (Spring ↔ FastAPI) | ❌ | 패키지 스텁만 존재, 미구현 |
| 내보내기 (DOCX/PDF/TXT) | ❌ | 미구현 |
| 알림 | ❌ | 미구현 |
| 웹 플랫폼 분기 | ❌ | `platform/{electron,web}` 디렉터리 비어 있음 |

---

## 백엔드

### Spring Boot (Java 21, Spring Boot 3.4.0)

패키지 구성 ([backend/src/main/java/com/storyzip/](../backend/src/main/java/com/storyzip/)):

| 패키지 | 상태 | 역할 |
|--------|:----:|------|
| `auth` | ✅ | Google OAuth PKCE, JWT 발급·검증·갱신, Redis 기반 RT 회전, 디바이스별 로그아웃 |
| `sync` | ✅ | 12개 도메인 엔티티, `/api/v1/sync/upload` (FK 깊이 정렬, PATCH skip 로직) |
| `payment` | ✅ | Toss Payments, 토큰 지갑/거래, 웹훅 멱등 (`payment_event`) |
| `ai` | ⏳ | 예외 클래스만 존재, FastAPI 중계 미구현 |
| `export` | ⏳ | 패키지 스텁 |
| `notification` | ⏳ | 패키지 스텁 |
| `common` / `config` | ✅ | Security(Stateless JWT), CORS, Redis, springdoc OpenAPI 2.7.0 |

**Spring Boot는 도메인 데이터 CRUD API를 만들지 않는다.** 동기화는 PowerSync가 자동 처리하며, 서버는 `sync/upload` 업스트림 및 서버 전용 데이터(인증·결제·로그)만 REST로 제공한다.

주요 의존성: JJWT 0.12.6, springdoc-openapi 2.7.0, Spring Data JPA, Spring Data Redis.

### PostgreSQL 16

- 서버 원본 DB — 동기화되는 모든 도메인 데이터 저장소
- 서버 전용 데이터: 인증, 결제(`payment_event`, `token_wallet`, `token_transaction`), 감사 로그
- JSONB: Plan의 `genres`, `moods` 등 태그 배열
- **PowerSync 연동**: `wal_level=logical` + `max_replication_slots=4` + `max_wal_senders=4`, 전용 `powersync_repl` 역할 및 publication
- 초기 스키마: [infra/db/schema.sql](../infra/db/schema.sql), [infra/db/powersync-init.sql](../infra/db/powersync-init.sql)

### MongoDB 7 (PowerSync 싱크 버킷 스토리지)

PowerSync는 change streams를 사용하므로 **replica set** (`rs0`) 구성이 필수. 도메인 DB가 아니라 PowerSync가 클라이언트별 싱크 버킷을 보관하는 저장소.

### Redis 7

- JWT Refresh Token 회전 저장소 (디바이스 ID별 키)
- 향후 세션/Rate Limit 캐시

### FastAPI (AI 서버) — 예정

| 항목 | 설명 |
|------|------|
| 런타임 | Python 3.12, FastAPI, Celery + Redis broker (예정) |
| 역할 | OpenAI / Claude 등 외부 AI API 중계, 프롬프트 템플릿, 비동기 처리 |
| 현재 | [ai/](../ai/) 디렉터리에 README만 존재, 코드 미구현 |

Spring Boot에서 분리하는 이유: Python AI 생태계(LangChain 등) 활용, AI 서버 독립 스케일링, 프롬프트/모델 교체 시 메인 백엔드 영향 차단.

---

## 프론트엔드

### 패키지 / 번들러

| 기술 | 버전 | 역할 |
|------|------|------|
| Electron | 41.2.0 | 데스크탑 앱 프레임워크 |
| Electron Forge | 7.11.1 | 빌드, 패키징, 배포 |
| Vite | 6.x | 번들러 (Forge 플러그인 + `vite.web.config.ts`) |
| pnpm | 10.33.0 | 패키지 매니저 |

### Electron 프로세스 구조

```
┌─────────────────────────────────────────────────────────────┐
│ Main Process (Node.js)                                      │
│  frontend/src/main/                                         │
│   ├─ index.ts              (앱 부트스트랩, BrowserWindow)    │
│   ├─ preload.ts            (contextBridge API 정의)         │
│   └─ auth/                                                  │
│       ├─ googleOAuth.ts    (외부 브라우저 OAuth + 콜백 수신) │
│       ├─ oauthServer.ts    (loopback 서버, state 검증)       │
│       ├─ pkce.ts           (code_verifier/challenge 생성)    │
│       ├─ tokenStore.ts     (AT/RT 영속화)                    │
│       ├─ tokenRefreshScheduler.ts (만료 전 자동 갱신)         │
│       ├─ deviceId.ts       (머신별 UUID, RT 키로 사용)        │
│       ├─ guestId.ts        (비로그인 게스트 식별자)           │
│       └─ lastWriterStore.ts (마지막 로그인 계정)              │
├─────────────────────────────────────────────────────────────┤
│ Preload (contextIsolation ON, nodeIntegration OFF)          │
├─────────────────────────────────────────────────────────────┤
│ Renderer Process (React)                                    │
│  frontend/src/renderer/                                     │
│   ├─ App.tsx, index.tsx                                     │
│   └─ sync/                                                  │
│       ├─ db.ts             (@powersync/web + wa-sqlite)      │
│       └─ connector.ts      (JWT fetcher, upload 콜백)        │
│  frontend/src/shared/                                       │
│   ├─ sync/schema.ts        (공유 스키마 — 웹/데스크탑 공통)   │
│   ├─ features/…            (10개 도메인 모듈)                 │
│   ├─ components/           (editor, layout, tag, tree, ui)   │
│   ├─ stores/, hooks/, lib/, types/                           │
│   └─ …                                                       │
└─────────────────────────────────────────────────────────────┘
```

> 주의: 로컬 DB는 `better-sqlite3` + `@powersync/node`가 아니라 **렌더러에서 `@powersync/web` + `@journeyapps/wa-sqlite` (WASM)** 로 동작한다. 덕분에 Electron과 웹이 동일한 PowerSync 스택을 공유한다. Main은 DB를 보지 않고 인증·윈도우 관리만 담당.

### 통신 경로

| 대상 | 방식 | API |
|------|------|-----|
| 데이터 CRUD | 렌더러의 PowerSync SQLite (읽기/쓰기) → PowerSync 서버 자동 동기화 | Spring 구현 불필요 |
| 업스트림 쓰기 | Connector → `POST /api/v1/sync/upload` | `sync.controller` |
| 인증 | Electron Main(OAuth) / 웹(리다이렉트) → Spring `auth.*` | ✅ |
| 결제 | 렌더러 → Spring `payment.*` | ✅ |
| AI 기능 | 렌더러 → Spring `ai` → FastAPI | ⏳ |

### Feature 모듈 ([frontend/src/shared/features/](../frontend/src/shared/features/))

`auth`, `character`, `episode`, `foreshadow`, `idea`, `idea-archive`, `plan`, `plot`, `workspace`, `world-note` — 총 10개.
대부분 List/Edit 스크린이 스캐폴드되어 있으며 세부 로직은 진행 중.

### 웹 브라우저 (React)

동일한 `src/shared/`, `src/renderer/`(→ web 진입점) 코드를 공유. `vite.web.config.ts` 로 별도 번들. `frontend/src/platform/{electron,web}` 분기 레이어는 예약되어 있으나 현재 비어 있음 — 공유 코드 자체가 플랫폼 독립적이기 때문에 당장 필요하지 않음.

| 구분 | 데스크탑 | 웹 |
|------|---------|-----|
| 실행 엔진 | Electron Renderer | 브라우저 탭 |
| 로컬 DB | wa-sqlite (Electron 내장 Chromium) | wa-sqlite (IndexedDB 기반) |
| OAuth 플로우 | 외부 브라우저 + loopback 콜백 | 서버 리다이렉트 |
| 오프라인 지원 | ✅ | ✅ (브라우저 저장 한도 내) |
| 개발 우선순위 | 1순위 | 2순위 |

### 공유 UI/UX 스택

| 기술 | 버전 | 역할 |
|------|------|------|
| React | 19 | UI 프레임워크 |
| TypeScript | 5.8 | 정적 타입 |
| TipTap | 3 | 리치 텍스트 에디터 |
| Zustand | 5 | 상태 관리 |
| Immer | 10 | 불변 업데이트 |
| shadcn/ui | latest | Radix 기반 컴포넌트 |
| Tailwind CSS | 4.2 | 스타일링 (`@tailwindcss/vite`) |
| React Router DOM | 7 | 라우팅 |
| @powersync/react | 1.10 | React 훅 바인딩 |
| @powersync/web | 1.37 | 브라우저/Electron용 SDK |
| @dnd-kit | core 6 / sortable 10 | 챕터·장면 DnD |
| lucide-react | 0.400 | 아이콘 |
| sonner | 2 | 토스트 |
| date-fns | 4 | 날짜 포맷 |

TipTap 확장: starter-kit, character-count, placeholder, highlight, typography, underline, text-align, color, image, link.

### 내보내기 구현 (예정)

렌더러에서 직접 처리 or Main IPC 선택은 미확정. DOCX / PDF / TXT → 1순위, EPUB → 추후.

---

## 인프라

> 상세 설계는 [infra.md](infra.md), PowerSync 설정은 [powersync.md](powersync.md) 참조

### 환경 구성

| 환경 | 경로 | 도커 대상 | 앱 실행 |
|------|------|-----------|---------|
| dev | [infra/dev/docker-compose.dev.yml](../infra/dev/docker-compose.dev.yml) | PostgreSQL + Redis + MongoDB + PowerSync | 로컬 IDE 직접 실행 |
| test | [infra/test/docker-compose.test.yml](../infra/test/docker-compose.test.yml) | 인프라 + 앱 전체 | 컨테이너 |
| prod | [infra/prod/docker-compose.prod.yml](../infra/prod/docker-compose.prod.yml) | 전체 (Blue/Green 예정) | 컨테이너 이미지 |

### 핵심 인프라 구성

| 항목 | 기술 |
|------|------|
| 서버 | EC2 단일 서버 |
| 컨테이너 오케스트레이션 | Docker Compose |
| 배포 전략 | Blue/Green 무중단 배포 (예정) |
| CI/CD | GitLab CI/CD (self-hosted runner) |
| 환경변수 | Doppler (dev / test / prd) |
| SSL | Let's Encrypt + Certbot (예정) |
| 모니터링 | PLG + Prometheus (예정) |

### 프로덕션 컨테이너 (계획)

| 컨테이너 | 이미지 | 역할 |
|----------|--------|------|
| nginx | nginx:alpine | 리버스 프록시, SSL, 정적 서빙 |
| spring-boot | 자체 빌드 | 메인 백엔드 |
| fastapi | 자체 빌드 | AI 서버 |
| postgresql | postgres:16-alpine | 원본 DB (WAL logical replication) |
| mongo | mongo:7 (rs0) | PowerSync 싱크 버킷 |
| redis | redis:7-alpine | RT 저장소 / 캐시 |
| powersync | journeyapps/powersync-service | 동기화 엔진 |
| react-web | 자체 빌드 (Vite) | 웹 에디터 |
| promtail / loki / grafana / prometheus | grafana/* · prom/* | 로그·메트릭 |

### CI/CD 파이프라인

```
test → build → integration → deploy
```

| 브랜치 | test | build | integration | deploy |
|--------|:----:|:-----:|:-----------:|:------:|
| feature/* (MR) | O | X | X | X |
| develop | O | O | O | X |
| master | O | O | O | O |

### 프로젝트 레이아웃

```
S14P31F203/
├── frontend/   — Electron 데스크탑 + 웹 에디터 (단일 코드베이스)
├── landing/    — 랜딩 페이지 (React + Vite, 에디터와 독립)
├── backend/    — Spring Boot 3.4 (Java 21)
├── ai/         — FastAPI (README only, 미구현)
├── infra/      — docker-compose (dev/test/prod), db/, powersync/
└── docs/       — 설계/구현 문서
```

Nginx 경로 분기:
- `storyzip.com/` → landing
- `storyzip.com/editor` → frontend 웹 빌드

---

## 로컬 DB (SQLite via wa-sqlite)

| 항목 | 설명 |
|------|------|
| 구현체 | `@journeyapps/wa-sqlite` (WASM) — Electron·웹 공용 |
| 관리 주체 | `@powersync/web` SDK — 스키마/마이그레이션/쿼리 |
| 원고 포맷 | TipTap JSON (TEXT) |
| 동기화 | PowerSync가 로컬 ↔ PostgreSQL 자동 동기화 |
| 오프라인 우선 | 모든 읽기/쓰기 로컬 SQLite에 즉시 커밋 후 업스트림 전송 |

---

## 보안

### Electron 보안 모델
- Context Isolation 활성화
- `nodeIntegration` 비활성화
- Preload + `contextBridge`로 안전한 API만 renderer에 노출
- IPC: `ipcMain.handle` + `ipcRenderer.invoke`
- OAuth: 외부 브라우저 + loopback redirect (앱 내 웹뷰 미사용)

### API 보안
- JWT Access Token + Refresh Token, RT는 Redis에 디바이스 ID별 저장 (회전)
- 디바이스 ID 기반 로그아웃 / 강제 만료
- Rate Limiting (예정)
- 파일 업로드 시 확장자/MIME 검사 (예정)
- AI API 키는 서버에서만 관리 (클라이언트 미노출)

### 데이터 보안
- PowerSync sync-rules로 `writer_id` 기반 데이터 격리
- OAuth 토큰은 앱 로컬 저장소(`tokenStore`) 관리 — 향후 OS 자격증명 저장소 연동 검토
- 회원 탈퇴 시 개인정보 마스킹/파기 (예정)

---

## 자동 저장

- 디바운스 자동 저장 (마지막 키입력 후 **5초**) — AI 인덱싱 디바운스와 동일 간격으로 통일
- 주기적 전체 저장 (60초)
- 앱 종료 전 최종 저장 (`before-quit`)
- PowerSync 업스트림 큐 (오프라인 복구 포함)

---

## 내보내기 지원

| 포맷 | 우선순위 | 상태 |
|------|:-------:|:----:|
| DOCX | 1순위 (출판사 제출) | ⏳ |
| PDF | 1순위 (인쇄/검토) | ⏳ |
| TXT | 1순위 (웹소설 플랫폼) | ⏳ |
| EPUB | 추후 확장 | — |

---

## 개발 도구

| 도구 | 용도 |
|------|------|
| pnpm 10 | 패키지 매니저 |
| ESLint v9 + typescript-eslint 8 | 린팅 |
| Prettier 3 + prettier-plugin-tailwindcss | 포맷팅 |
| Vitest 3 + @testing-library/react 16 | 테스트 |
| Husky + lint-staged | pre-commit 훅 (루트 관리) |
| Doppler | 환경변수 (dev/test/prd 분리) |

---

## 관련 문서

| 문서 | 설명 |
|------|------|
| [service-spec.md](service-spec.md) | 기능 명세, 엔드포인트, 토큰 차감 정책 |
| [backend-implementation.md](backend-implementation.md) | Spring Boot 구현 상세 (auth/sync/payment) |
| [powersync.md](powersync.md) | PowerSync 통합 가이드 (JWT, FK 정렬, PATCH skip, 새 테이블 4단계) |
| [sync-frontend.md](sync-frontend.md) / [sync-backend.md](sync-backend.md) | 동기화 프론트/백 패턴 |
| [auth-frontend.md](auth-frontend.md) / [auth-implementation.md](auth-implementation.md) | OAuth·JWT 구현 |
| [payment-implementation.md](payment-implementation.md) | Toss Payments, 토큰 경제 |
| [erd.md](erd.md) / [ddl.sql](ddl.sql) | 데이터 모델 |
| [infra.md](infra.md) | 인프라·배포 |
| [dev-setup.md](dev-setup.md) / [doppler-setup.md](doppler-setup.md) | 개발 환경 세팅 |
| [jira-epics.md](jira-epics.md) / [future-ideas.md](future-ideas.md) | 작업 관리·로드맵 |
