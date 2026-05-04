# AI 서버 현황 + 수정 영향 범위 보고서

> **작성 시점**: 2026-05-04 (브랜치 `feat/S14P31F203-62_setEditor`, 기준 커밋 `1acf38a`)
> **작성 목적**: AI 서버(`ai/`) 로직 전면 수정 착수 전, 현재 시스템의 구조·파이프라인·외부 결합 지점을 한 문서로 정리한다. 향후 수정 작업의 단일 기준점으로 사용한다.
> **초점**: ① 현황(코드 기준) ② 수정 시 영향 범위(결합·리스크 포인트). 구체적 수정 계획은 별도 작업.
>
> **기존 문서와의 관계**: 본 문서는 기존 docs를 갱신·대체하지 않는다. 단, PR5(평문 컨텍스트 페이로드, 커밋 `f089e69` / `250c8c0`) 이후 변경된 흐름과 코드와 어긋난 기존 문서 기술을 본문에서 명시 정정한다. 참조 대상:
> - [ai-overview.md](ai-overview.md) — 팀 공유용 전체 그림
> - [ai-server-architecture.md](ai-server-architecture.md) — 아키텍처·엔드포인트 요약
> - [ai-runtime-pipeline-current.md](ai-runtime-pipeline-current.md) — 런타임 파이프라인 스냅샷
> - [AI_architecture2.md](AI_architecture2.md), [ai-data-pipeline.md](ai-data-pipeline.md), [ai-credit-policy.md](ai-credit-policy.md), [ai-erd.md](ai-erd.md), [ai-review-quality-report.md](ai-review-quality-report.md)

---

## 목차

1. [개요와 작성 배경](#1-개요와-작성-배경)
2. [시스템 컨텍스트](#2-시스템-컨텍스트)
3. [AI 서버 디렉토리 구조와 진입점](#3-ai-서버-디렉토리-구조와-진입점)
4. [외부 의존성·환경변수·배포](#4-외부-의존성환경변수배포)
5. [API 엔드포인트 매트릭스](#5-api-엔드포인트-매트릭스)
6. [핵심 파이프라인 4종 상세](#6-핵심-파이프라인-4종-상세)
7. [공통 빌딩블록](#7-공통-빌딩블록)
8. [보안 모델 (Plan C 옵션 1)](#8-보안-모델-plan-c-옵션-1)
9. [데이터 모델](#9-데이터-모델)
10. [운영·관측](#10-운영관측)
11. [Backend ↔ AI 통신 정책](#11-backend--ai-통신-정책)
12. [수정 시 영향 범위 분석](#12-수정-시-영향-범위-분석)
13. [결합도가 높은 지점 / 리스크 포인트 (Top 5)](#13-결합도가-높은-지점--리스크-포인트-top-5)
14. [로컬 실행·검증 가이드](#14-로컬-실행검증-가이드)

---

## 1. 개요와 작성 배경

Folio AI 서버는 FastAPI(웹 API) + Celery(비동기 큐) 두 프로세스로 구성된 Python 마이크로서비스이며, Spring Boot 백엔드가 내부 시크릿(`X-Internal-Api-Key`)으로만 호출한다. 사용자(작가)에게 노출되는 기능은 **초안 생성 / 원고 검수 / 회차 인덱싱(자동) / 설정 추출(스크립트)** 4가지이고, 모든 요청은 클라이언트 → Spring → FastAPI 순서로 흐른다 (Frontend가 AI 서버를 직접 호출하는 경로는 없다).

이 문서는 곧 진행될 AI 서버 로직 전면 수정 작업의 사전 분석이다. 코드 라인 단위로 검증한 사실만 적었으며, 기존 docs와 어긋나는 부분은 본문에서 표시한다.

---

## 2. 시스템 컨텍스트

### 2.1 3-tier 구성

```
┌──────────────────────┐                          ┌────────────────────────┐
│  Frontend            │   POST /api/v1/ai/drafts (SSE) / reviews (JSON)   │  Backend (Spring Boot)│
│  (Web · Electron)    │ ───────────────────────► │  AiController          │
│  apiClient.streamSSE │                          │  ↓ AiClient            │
│  apiClient.post      │                          │  ↓ EpisodeIndex        │
│                      │                          │     Debouncer (5s)     │
└──────────────────────┘                          └─────────┬──────────────┘
                                                            │
                                                            │ X-Internal-Api-Key
                                                            ▼
                                                  ┌───────────────────────┐
                                                  │  AI Server (FastAPI)  │
                                                  │  :8000  /v1/*         │
                                                  │                       │
                                                  │  - drafts (SSE)       │
                                                  │  - reviews (JSON)     │
                                                  │  - pipelines/episode  │
                                                  │  - extract-settings   │
                                                  │  - health, _dev/ping  │
                                                  └─┬──────────────┬──────┘
                                                    │              │
                       ┌────────────────────────────┘              └──────────────┐
                       ▼                                                          ▼
              ┌────────────────────┐                                  ┌──────────────────────┐
              │  Celery Worker     │  ──── Redis (broker DB1) ────►   │  Anthropic Claude     │
              │  (Dockerfile.      │                                  │  Sonnet/Haiku/Opus    │
              │   worker)          │                                  └──────────────────────┘
              │  app.tasks.*       │
              └─────────┬──────────┘                                  ┌──────────────────────┐
                        │                                             │  OpenAI (Embedding)   │
                        ▼                                             │  text-embedding-3-sm  │
              ┌──────────────────────┐                                └──────────────────────┘
              │  PostgreSQL          │
              │  + pgvector(1536d)   │  ◄────── AI 서버 직접 SELECT (벡터 검색·타임라인만)
              │  + Spring 동기화      │  ◄────── 평문은 클라이언트 페이로드로 전달 (PR5)
              └──────────────────────┘
```

### 2.2 외부 의존성 한눈에

| 종류 | 대상 | 용도 | 토글 |
|------|------|------|------|
| LLM | Anthropic Claude (Sonnet 4.6 / Haiku 4.5 / Opus 4.7) | 초안·검수·요약·설정추출 | `LLM_PROVIDER` (`fake`/`anthropic`) |
| Embedding | OpenAI `text-embedding-3-small` (1536 차원) | 벡터 검색용 | `EMBEDDING_PROVIDER` (`fake`/`openai`) |
| RDB | PostgreSQL + `pgvector` 확장 | 청크 벡터, 요약, 추출 제안 | `DATABASE_URL` 또는 `DB_*` |
| Cache/Queue | Redis (DB 0/1/2 분리) | 세션·Celery broker·Celery backend | `REDIS_URL` 또는 `REDIS_*` |
| 배포 | Docker (FastAPI + 별도 Worker 이미지) | 운영 | `Dockerfile`, `Dockerfile.worker` |

기본값은 `LLM_PROVIDER=fake`, `EMBEDDING_PROVIDER=fake`. **`fake`로 두면 실제 LLM/임베딩 호출 없이 결정론적 더미 응답이 돌아온다** ([ai/app/services/llm.py:74-137](../ai/app/services/llm.py#L74-L137), [ai/app/services/embedder.py:28-46](../ai/app/services/embedder.py#L28-L46)).

---

## 3. AI 서버 디렉토리 구조와 진입점

### 3.1 디렉토리 (실제 코드 기준)

```
ai/
├── app/
│   ├── main.py                    # FastAPI 앱 진입점·라우터 등록·예외 마스킹
│   ├── config.py                  # Pydantic Settings (env 매핑·prod fail-fast)
│   ├── celery_app.py              # Celery 설정 + task_routes
│   ├── api/v1/
│   │   ├── health.py              # GET  /v1/health (공개)
│   │   ├── pipelines.py           # POST /v1/pipelines/episode
│   │   ├── drafts.py              # POST /v1/drafts (SSE)
│   │   ├── reviews.py             # POST /v1/reviews
│   │   ├── extract_settings.py    # POST /v1/extract-settings
│   │   └── _dev_ping.py           # GET/POST /v1/_dev/ping (dev 전용)
│   ├── services/
│   │   ├── llm.py                 # LLMProvider · FakeLLM · AnthropicLLM
│   │   ├── rag.py                 # assemble_context (40K 토큰 예산)
│   │   ├── providers.py           # get_llm() / get_embedder() 팩토리
│   │   ├── embedder.py            # FakeEmbedder · OpenAIEmbedder
│   │   ├── chunker.py             # 500~1000 토큰 청킹 (cl100k_base)
│   │   ├── tokenizer_compat.py    # tiktoken/대체 호환 레이어
│   │   ├── settings_loader.py     # 인물/세계관 포맷팅 (PR5 페이로드 입력)
│   │   ├── text_extractor.py      # TipTap JSON → 평문 (검수용 [N] 줄번호 부착)
│   │   ├── repetition_detector.py # 결정론 반복 표현 검출
│   │   ├── structural_validators.py # 회차 메타 참조·요일 충돌 검출
│   │   └── timeline_extractor.py  # 회차별 시간 흐름 누적
│   ├── tasks/
│   │   ├── _ping.py               # ping_task (스모크용)
│   │   ├── chunk_and_embed.py     # 회차 청킹 + 임베딩 + UPSERT
│   │   ├── generate_summary.py    # ※ 현재 호출처 없음 (코드만 존재)
│   │   └── extract_items.py       # ※ 현재 호출처 없음 (체인용)
│   ├── schemas/
│   │   └── ai_context_payload.py  # PR5 평문 페이로드 DTO
│   ├── db/
│   │   ├── session.py             # AsyncSession 팩토리
│   │   ├── base.py                # DeclarativeBase
│   │   └── models/                # episode_chunk · episode_summary · extraction_suggestion · ai_job
│   ├── middleware/
│   │   └── auth.py                # X-Internal-Api-Key 검증
│   ├── mcp/                       # Claude tool_use 통합 (현재 비활성)
│   │   ├── registry.py
│   │   ├── context.py             # WriterContext
│   │   └── tools/                 # character / episode_search / plan / plot / world_note
│   ├── core/
│   │   └── logging.py             # structlog JSON / SDK 로거 강등
│   └── tests/
├── pyproject.toml
├── requirements.txt
├── .env.example
├── Dockerfile                     # uvicorn (port 8000)
└── Dockerfile.worker              # celery worker
```

### 3.2 진입점 동작 ([ai/app/main.py](../ai/app/main.py))

1. `configure_logging()` ([ai/app/main.py:14](../ai/app/main.py#L14))
2. **prod 환경 fail-fast**: `LANGCHAIN_VERBOSE` / `LANGCHAIN_DEBUG` / `OPENAI_LOG` / `ANTHROPIC_LOG` 가 켜져 있으면 RuntimeError. SDK 디버그 로그가 prompt/응답을 stdout으로 흘릴 위험을 차단 ([ai/app/main.py:18-27](../ai/app/main.py#L18-L27))
3. `GZipMiddleware(minimum_size=1024)` — **응답만 압축**. 요청 압축은 ASGI 표준 부재로 미적용 ([ai/app/main.py:31-35](../ai/app/main.py#L31-L35))
4. `prometheus-fastapi-instrumentator` 인스트루먼트 (자동 expose는 막고, 인증 걸린 `/metrics` 라우트를 별도 등록) ([ai/app/main.py:41-52](../ai/app/main.py#L41-L52))
5. **전역 예외 핸들러**: 모든 unhandled exception을 `{"detail": "internal server error"}`로 마스킹. 메시지에 RAG context가 echo될 위험 차단 ([ai/app/main.py:61-70](../ai/app/main.py#L61-L70))
6. 라우터 등록: `health` (공개) → `pipelines`, `drafts`, `reviews`, `extract_settings` (각 라우터에 `Depends(require_internal_api_key)`) → dev에서만 `_dev_ping` ([ai/app/main.py:73-83](../ai/app/main.py#L73-L83))

---

## 4. 외부 의존성·환경변수·배포

### 4.1 핵심 의존성 ([ai/pyproject.toml](../ai/pyproject.toml))

| 패키지 | 버전 | 용도 |
|--------|------|------|
| fastapi / uvicorn | 0.115+ / 0.32+ | 웹 서버 |
| anthropic | 0.40+ | Claude API |
| openai | 1.54+ | 임베딩 (선택) |
| celery[redis] / redis | 5.4+ / 5.0+ | 비동기 큐 |
| sqlalchemy[asyncio] / asyncpg | 2.0+ / 0.29+ | 비동기 DB |
| pgvector | 0.3+ | 벡터 컬럼 |
| pydantic / pydantic-settings | 2.9+ / 2.5+ | 데이터·설정 검증 |
| prometheus-fastapi-instrumentator | 7.0+ | 메트릭 |

### 4.2 환경변수 ([ai/app/config.py](../ai/app/config.py))

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `APP_ENV` (alias `DOPPLER_ENVIRONMENT`) | `dev` | `prod` 시 `DB_*`/`REDIS_*` 누락 fail-fast |
| `INTERNAL_API_KEY` | `change-me` | Spring ↔ FastAPI 공유 시크릿 |
| `ANTHROPIC_API_KEY` (alias `CLAUDE_API_KEY`) | `""` | Claude 호출 |
| `ANTHROPIC_BASE_URL` | (unset) | 빈 문자열은 자동 unset (Doppler 호환) |
| `OPENAI_API_KEY` | `""` | 임베딩용 |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | 1536 차원 |
| `CLAUDE_SONNET_MODEL` | `claude-sonnet-4-6` | 초안(기본) / 검수 |
| `CLAUDE_HAIKU_MODEL` | `claude-haiku-4-5-20251001` | `generate_json` 기본 모델 |
| `CLAUDE_OPUS_MODEL` | `claude-opus-4-7` | 초안(`model=opus`) |
| `LLM_PROVIDER` | `fake` | `fake` / `anthropic` |
| `EMBEDDING_PROVIDER` | `fake` | `fake` / `openai` |
| `DATABASE_URL` 또는 `DB_HOST/DB_PORT/DB_NAME/DB_USERNAME/DB_PASSWORD` | localhost dev | postgresql+asyncpg |
| `REDIS_URL` 또는 `REDIS_HOST/REDIS_PORT/REDIS_PASSWORD` | localhost dev | DB 0 캐시·DB 1 broker·DB 2 backend 자동 분리 |
| `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` | `redis://...` DB 1/2 | broker/backend (자동 합성) |

### 4.3 Celery 큐 라우팅 ([ai/app/celery_app.py:35-40](../ai/app/celery_app.py#L35-L40))

```python
task_routes={
    "app.tasks.ping_task":     {"queue": "indexing"},
    "app.tasks.chunk_and_embed":{"queue": "indexing"},
    "app.tasks.generate_draft":{"queue": "draft"},   # ⚠ 정의된 task 없음 (leftover)
    "app.tasks.run_review":    {"queue": "review"},  # ⚠ 정의된 task 없음 (leftover)
}
```

> **현황 정정**: 기존 [ai-server-architecture.md](ai-server-architecture.md) 와 [ai-overview.md](ai-overview.md) 에는 `generate_summary_task → extract_items_task` 체인이 인덱싱에서 자동 실행되는 것처럼 기술되어 있으나, 실제 [ai/app/api/v1/pipelines.py:73](../ai/app/api/v1/pipelines.py#L73)은 `chunk_and_embed_task.apply_async(args=args)`만 호출하고 chain을 만들지 않는다. 또한 [ai/app/celery_app.py:9-13](../ai/app/celery_app.py#L9-L13)의 `include` 목록에도 `generate_summary` / `extract_items`는 빠져있다. **현재 인덱싱 파이프라인은 청크/임베딩까지만 동작하며, 회차 요약과 추출 제안은 코드만 존재할 뿐 실행되지 않는다.** 이는 수정 작업 시 우선 의사결정이 필요한 항목이다.

> **leftover 라우팅**: `generate_draft`, `run_review`라는 이름의 Celery task는 코드 어디에도 정의되어 있지 않다. drafts·reviews는 모두 라우터에서 동기적으로 LLM을 호출한다 ([drafts.py:147](../ai/app/api/v1/drafts.py#L147), [reviews.py:371](../ai/app/api/v1/reviews.py#L371)). 라우팅 룰만 남아있는 dead code.

### 4.4 Docker 배포

- `Dockerfile` — `python:3.13-slim` + `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- `Dockerfile.worker` — Celery worker용 별도 이미지 (큐 prefetch 1, ack-late)
- `worker_redirect_stdouts=False`, `worker_hijack_root_logger=False` ([ai/app/celery_app.py:33-34](../ai/app/celery_app.py#L33-L34)) — print/exception이 Celery 자체 로거에 흡수되어 본문이 노출되는 사고 차단

---

## 5. API 엔드포인트 매트릭스

| 메소드 | 경로 | 인증 | 호출 주체 | 입력 (요약) | 출력 (요약) | 동기/비동기 | SLA (Spring 측) |
|--------|------|------|----------|--------------|--------------|--------------|----------------|
| GET | `/v1/health` | — | Spring `AiClient.health()` | (없음) | `{status: "ok"}` | 동기 | 2s |
| POST | `/v1/pipelines/episode` | `X-Internal-Api-Key` | Spring `EpisodeIndexDebouncer` | `EpisodePipelineRequest` (episode_id, work_id, writer_id, content) | 202 + `{task_id, status, reason}` (시그니처 동일 시 `skipped`) | 비동기 (Celery 적재) | 2s |
| POST | `/v1/drafts` | `X-Internal-Api-Key` | Spring `AiClient.streamDraft()` | `DraftRequest` (+ `AiContextPayload`) | SSE: `{type:"chunk",content}` ... `{type:"done", episode_id, total_length, usage}` | 동기 스트림 | 60s WARN / 5분 timeout |
| POST | `/v1/reviews` | `X-Internal-Api-Key` | Spring `AiClient.requestReview()` | `ReviewRequest` (+ `AiContextPayload`) | `{issues[], summary, score, usage}` | 동기 JSON | 30s WARN / 3분 timeout |
| POST | `/v1/extract-settings` | `X-Internal-Api-Key` | 스크립트/내부 도구 | `ExtractSettingsRequest` (work_id, content) | `ExtractSettingsResponse` | 동기 JSON | (Spring 측 호출처 없음) |
| GET | `/metrics` | `X-Internal-Api-Key` | Prometheus 스크레이퍼 | (없음) | Prometheus 텍스트 | 동기 | — |
| POST | `/v1/_dev/ping` | `X-Internal-Api-Key` (dev 전용) | Spring `AiClient.enqueuePing()` | `{msg}` | 202 + `{task_id}` | 비동기 | 2s |
| GET | `/v1/_dev/ping/{task_id}` | `X-Internal-Api-Key` (dev 전용) | Spring `AiClient.getPingResult()` | (없음) | `{task_id, status, result}` | 동기 | 2s |

> **인증 미적용 라우트**: `/v1/health`만 공개. `/`도 인증 없이 노출되지만 단순 서비스명 echo다 ([ai/app/main.py:86-88](../ai/app/main.py#L86-L88)).

---

## 6. 핵심 파이프라인 4종 상세

각 파이프라인을 **요청 → 검증 → 컨텍스트 수집 → 프롬프트 → LLM → 후처리 → 응답** 순으로 추적한다.

### 6.1 회차 인덱싱 — `POST /v1/pipelines/episode`

#### 시퀀스

```
[Frontend 자동저장]
       ▼
[Spring AiController(저장 핸들러)] ──► [EpisodeIndexDebouncer.schedule(episodeId, workId, writerId)]
                                                                         │
                                                          5초 디바운스 (마지막 저장 후)
                                                                         ▼
                                                         [aiClient.triggerEpisodePipeline()]
                                                                         │  POST /v1/pipelines/episode (X-Internal-Api-Key)
                                                                         ▼
                                                  [FastAPI pipelines.trigger_episode_pipeline]
                                                  ① extract_plain_text → chunk_text → SHA256 시그니처
                                                  ② DB SELECT 기존 episode_chunk → 시그니처 동일 시 skipped 반환
                                                  ③ 다르면 chunk_and_embed_task.apply_async()
                                                                         │
                                                                         ▼
                                                  [Celery worker · indexing 큐]
                                                  · DELETE 기존 chunks (episode_id 기준)
                                                  · embed_batch (OpenAI / Fake)
                                                  · INSERT episode_chunk (content + Vector(1536) + token_count)
```

#### 핵심 파일·라인

- 디바운스: [backend/.../EpisodeIndexDebouncer.java:24-44](../backend/src/main/java/com/storyzip/ai/service/EpisodeIndexDebouncer.java#L24-L44) — `DEBOUNCE_SECONDS=5`, `ConcurrentHashMap<UUID, ScheduledFuture<?>>`로 episode별 타이머 관리, 새 이벤트 도착 시 이전 타이머 취소
- 시그니처 비교: [ai/app/api/v1/pipelines.py:42-67](../ai/app/api/v1/pipelines.py#L42-L67) — 청크 결과를 정렬·JSON 직렬화한 SHA256 비교로 본문 무변경 시 임베딩 호출을 건너뜀
- Celery 태스크: [ai/app/tasks/chunk_and_embed.py:60-66](../ai/app/tasks/chunk_and_embed.py#L60-L66) — `autoretry_for=(Exception,) max_retries=3 retry_backoff=True`
- 본문 로깅 차단: [ai/app/tasks/chunk_and_embed.py:68-76](../ai/app/tasks/chunk_and_embed.py#L68-L76) — content 본문은 length만 기록

#### 현재 미연결 영역 (수정 시 결정 필요)

- `generate_summary_task` ([ai/app/tasks/generate_summary.py](../ai/app/tasks/generate_summary.py)) 와 `extract_items_task` ([ai/app/tasks/extract_items.py](../ai/app/tasks/extract_items.py)) 는 정의되어 있으나 **호출하는 곳이 없다**. 인덱싱이 회차 요약·추출 제안까지 자동 생성하는 기능은 현재 사실상 비활성 상태.

### 6.2 초안 생성 — `POST /v1/drafts` (SSE)

#### 시퀀스

```
[Frontend "초안 생성" 클릭]
       ▼
[apiClient.streamSSE('/api/v1/ai/drafts', body, onChunk, onDone)]
       ▼
[Spring AiController.generateDraft]
  · authentication.getName() = writerId (UUID)
  · model 기본 'sonnet' / 'opus'면 OPUS_MIN_CREDITS(70) 사전 체크, 아니면 SONNET_MIN_CREDITS(38)
  · ensureBalance(writerId, minCredits) — 부족 시 402 INSUFFICIENT_TOKEN
  · DraftRequest 빌드 (writerId 주입, AiContextPayload pass-through)
  · SseEmitter(5분 timeout)
  · aiClient.streamDraft(request, emitter, onDone=deductFromUsage)
       ▼
[Spring AiClient.streamDraft (가상 스레드 + JDK HttpClient)]
  · TraceContextFilter.wrapMdc로 MDC 상속
  · POST /v1/drafts (5분 timeout)
  · SSE line 단위 readLine → 'data: ' 접두 추출
  · 'done' 이벤트 파싱 → usage 캡처 (다운스트림 send 실패해도 끝까지 drain)
       ▼
[FastAPI drafts._generate_sse]
  · rag_mode = 'draft_opus' if model=='opus' else 'draft_sonnet'
  · assemble_context(payload, work_id, writer_id, storyline, current_episode_num, mode)
  · system_prompt = SYSTEM_PROMPT(275줄) + "\n# 참조 자료\n" + context
  · user_prompt = "이번 회차 방향: {storyline}" + (user_prompt 있으면 추가) + 마무리
  · llm.generate_stream(system, user, model_override=opus_model if opus else None, max_tokens=4200)
  · 매 chunk마다 yield + asyncio.sleep(0.05)  # 클라이언트 UI 시뮬레이션
  · 완료 시 done 이벤트 (episode_id, total_length, usage)
       ▼
[Spring AiController onDone]
  · deductFromUsage(writerId, model, usage, "AI_DRAFT_<episodeId>", referenceId)
  · creditCalculator.calcCredits(model, in, out) → tokenWalletService.use()
```

#### 핵심 파일·라인

- 라우터: [ai/app/api/v1/drafts.py:172-182](../ai/app/api/v1/drafts.py#L172-L182) — `StreamingResponse(media_type="text/event-stream", X-Accel-Buffering: no)`
- 시스템 프롬프트: [ai/app/api/v1/drafts.py:37-106](../ai/app/api/v1/drafts.py#L37-L106) (한국어, 275줄 — 필수 원칙·설정 준수·서술 기법·금지 사항·인물 관계·중심 인물·분량)
- 모델 선택: [ai/app/api/v1/drafts.py:113-114](../ai/app/api/v1/drafts.py#L113-L114) (`is_opus = req.model.strip().lower() == "opus"`)
- 토큰 한도: [ai/app/api/v1/drafts.py:108](../ai/app/api/v1/drafts.py#L108) `DRAFT_MAX_TOKENS = 4200` (※ [ai-runtime-pipeline-current.md](ai-runtime-pipeline-current.md) 의 "stream 기본 8000"은 코드와 다름)
- Spring SSE 릴레이: [backend/.../AiClient.java:146-239](../backend/src/main/java/com/storyzip/ai/client/AiClient.java#L146-L239)
- 크레딧 차감: [backend/.../AiController.java:147-172](../backend/src/main/java/com/storyzip/ai/controller/AiController.java#L147-L172) — usage 비어있거나 in/out 합 0이면 차감 skip

### 6.3 원고 검수 — `POST /v1/reviews` (JSON)

#### 시퀀스

```
[Frontend "검수" 클릭]
       ▼
[Spring AiController.reviewEpisode]
  · ensureBalance(writerId, REVIEW_MIN_CREDITS=29)
  · ReviewRequest(workId, writerId, episodeId, content, episodeNumber, AiContextPayload)
       ▼
[Spring AiClient.requestReview (3분 timeout)]
  · POST /v1/reviews
  · 비-200 응답 시 status + bodyLen만 로그 (RAG context echo 차단)
       ▼
[FastAPI reviews.review_episode]
  · review_query = extract_plain_text(req.content)[:3000]   # 벡터 쿼리용
  · context = assemble_context(payload, ..., mode='review')
  · cleaned_content = extract_numbered_text(req.content)    # 줄 앞 [N] 부착
  · retrospect_markers = find_retrospect_markers(plain)     # 회상 시간 표지
  · user_prompt = 컨텍스트 + (회상 마커 블록) + 검수 대상 원고
  · llm.generate_json(REVIEW_SYSTEM_PROMPT, user_prompt, REVIEW_SCHEMA_HINT,
                       model_override=settings.claude_sonnet_model, max_tokens=8000)
  · _normalize_review_result → (type, lines) 시그니처로 중복 issue 제거
  · detect_repetitions(cleaned) → _merge_repetitions   # 한국어 반복은 결정론으로 대체
  · detect_structural_issues(cleaned) → 메타 회차 참조·날짜-요일 충돌 추가
  · _compute_score(issues) → critical -10, warning -5, info -2 (LLM score 무시)
  · usage 첨부
       ▼
[Spring AiController]
  · usage 있으면 'sonnet' 모델로 사후 차감
```

#### 핵심 파일·라인

- 라우터: [ai/app/api/v1/reviews.py:332-417](../ai/app/api/v1/reviews.py#L332-L417)
- 시스템 프롬프트: [ai/app/api/v1/reviews.py:31-206](../ai/app/api/v1/reviews.py#L31-L206) — 6가지 검수 항목, 캐릭터/세계관 체크리스트(`[C번호]` / `[W번호]`로 한 명/한 항목씩 점검 강제), 절대 지적 금지 리스트
- 응답 스키마: [ai/app/api/v1/reviews.py:209-223](../ai/app/api/v1/reviews.py#L209-L223)
- 결정론 점수: [ai/app/api/v1/reviews.py:236-247](../ai/app/api/v1/reviews.py#L236-L247) (`_SCORE_PENALTIES = {"critical":10,"warning":5,"info":2}`)
- MCP 경로 비활성: [ai/app/api/v1/reviews.py:20-25](../ai/app/api/v1/reviews.py#L20-L25), [ai/app/api/v1/reviews.py:400-415](../ai/app/api/v1/reviews.py#L400-L415) — 비용 절감으로 주석 처리, 설정집 크기 분기 시 재활성 가능
- 결정론 후처리: [ai/app/services/repetition_detector.py](../ai/app/services/repetition_detector.py), [ai/app/services/structural_validators.py](../ai/app/services/structural_validators.py), [ai/app/services/timeline_extractor.py](../ai/app/services/timeline_extractor.py)

### 6.4 설정 추출 — `POST /v1/extract-settings`

#### 특이사항

- **Spring 호출처 없음**: 사용자 플로우에 미포함, AI 개발/스크립트 전용 ([ai/app/api/v1/extract_settings.py:1-7](../ai/app/api/v1/extract_settings.py#L1-L7))
- **PR5 페이로드 입력 아님**: 자체 DB 직접 SELECT (`character`, `world_note`) 유지. v1 암호문(`v1:` 접두) 행은 `_is_ciphertext`로 필터링
- LLM은 model override 없음 → `generate_json` 기본 모델인 **Haiku** 사용
- 응답: `new_characters`, `updated_characters`, `new_world_notes`, `updated_world_notes`, `foreshadowing` + `usage`

#### 핵심 파일·라인

- 라우터: [ai/app/api/v1/extract_settings.py:165-187](../ai/app/api/v1/extract_settings.py#L165-L187)
- DB 직접 SELECT: [ai/app/api/v1/extract_settings.py:125-162](../ai/app/api/v1/extract_settings.py#L125-L162) — `character LEFT JOIN character_note(kind='personality')`, `world_note`
- 암호문 가드: [ai/app/api/v1/extract_settings.py:120-122](../ai/app/api/v1/extract_settings.py#L120-L122)

---

## 7. 공통 빌딩블록

### 7.1 LLM Provider — [ai/app/services/llm.py](../ai/app/services/llm.py)

```
LLMProvider (ABC)
├── FakeLLM           : 결정론 더미 응답 (테스트·로컬)
└── AnthropicLLM      : Claude Messages API 비동기 클라이언트
```

세 메소드:
- `generate_json(system, user, schema_hint, *, model_override=None, max_tokens=2000)` — 기본 모델 **Haiku**, `temperature=0.2` (Opus 4.7은 temperature 미지정), `_JSON_ONLY_SUFFIX`를 system 끝에 자동 부착, `_strip_code_block` + `json.loads`
- `generate_stream(system, user, model_override=None, max_tokens=4000)` — 기본 모델 **Sonnet**, `temperature=0.7`, **저수준 스트리밍**(`messages.create(stream=True)`) 사용. SDK 고수준 헬퍼는 일부 프록시(GMS 등)의 이벤트 순서 차이로 RuntimeError를 일으키므로 우회 ([ai/app/services/llm.py:220-223](../ai/app/services/llm.py#L220-L223))
- `generate_with_tools(system, user, tools, tool_executor)` — Claude tool_use 루프 (최대 10회). 현재 검수에서 호출되지 않음

토큰 사용량:
- 모든 메소드가 `last_usage = {input_tokens, output_tokens}` 갱신
- 스트리밍은 `message_start.usage.input_tokens` + `message_delta.usage.output_tokens`로 누적
- input이 0이면 `chunker.count_tokens(system) + count_tokens(user)`로 로컬 근사 ([ai/app/services/llm.py:252-257](../ai/app/services/llm.py#L252-L257))

Provider 팩토리: [ai/app/services/providers.py:25-37](../ai/app/services/providers.py#L25-L37) — `LLM_PROVIDER` env로 선택. `unknown` 값이면 `ValueError`

### 7.2 RAG 컨텍스트 — [ai/app/services/rag.py](../ai/app/services/rag.py)

`assemble_context(payload, work_id, writer_id, storyline, current_episode_num, mode='draft') -> str`

**토큰 예산**: `TOKEN_BUDGET = 40_000` ([ai/app/services/rag.py:46](../ai/app/services/rag.py#L46))

**모드별 정책** ([ai/app/services/rag.py:51-66](../ai/app/services/rag.py#L51-L66)):

| 모드 | recent_raw 한도 | vector_search 한도 | foreshadows | timeline | 트리밍 보호 |
|------|------------------|---------------------|-------------|----------|--------------|
| `draft` (하위호환) | 4 | 15 | ✗ | ✗ | — |
| `draft_sonnet` | 2 | 10 | ✗ | ✗ | — |
| `draft_opus` | 4 | 15 | ✗ | ✗ | — |
| `review` | 1 | 5 | ✓ | ✓ | `characters`, `world_notes` |

> **현황 정정**: [ai-runtime-pipeline-current.md](ai-runtime-pipeline-current.md) §4 의 "draft recent_raw 4 / review recent_raw 2" 표기는 코드와 다르다. 실제는 위 표대로 모드 4종이며 review는 1.

**섹션 구성** (조립 후 마크다운 헤더 부착):
1. `## 작품 정보` — `payload.work_meta`
2. `## 등장인물` — `[C번호]` 라벨 + 헤더(성별/나이) + notes + custom_fields ([ai/app/services/rag.py:168-208](../ai/app/services/rag.py#L168-L208))
3. `## 세계관 설정` — `[W번호]` 라벨 + 본문 300자 트렁크
4. `## 복선/떡밥` — review 모드만
5. `## 회차별 시간 흐름` — review 모드만 (DB 직접 SELECT, 평문 예외 영역)
6. `## 스토리라인` — `payload.plots`
7. `## 최근 회차 원문` — `payload.recent_episodes` 끝에서 limit개
8. `## 관련 과거 장면` — pgvector 코사인 유사도 검색

**벡터 검색** ([ai/app/services/rag.py:292-358](../ai/app/services/rag.py#L292-L358)):
- 쿼리 임베딩 생성 (`get_embedder().embed_batch([storyline])`)
- `episode_chunk` JOIN `episode` — 현재 이후 회차 제외, recent_raw 포함 화 제외
- `oversample = limit * MAX_CHUNKS_PER_EPISODE(3)` 끌어와 화당 최대 3개로 후처리
- 결과: `\n---\n` join

**트리밍** ([ai/app/services/rag.py:361-422](../ai/app/services/rag.py#L361-L422)):
- 우선순위 낮은 순서: `vector_search` → `foreshadows` → `world_notes` → `characters`
- 1차: 절반으로 축소 → 2차: 섹션 제거. `recent_raw`와 `protected_keys`는 보호

### 7.3 임베딩 + 청킹

- 임베딩: [ai/app/services/embedder.py](../ai/app/services/embedder.py) — `EMBEDDING_DIM=1536`, `OPENAI_BATCH_LIMIT=2048`. FakeEmbedder는 SHA256 시드로 결정론 정규화 벡터 생성
- 청킹: [ai/app/services/chunker.py](../ai/app/services/chunker.py) — `MIN_TOKENS=500`, `MAX_TOKENS=1000`, 단락 경계 우선 → 초과 시 문장 분할 → 마지막 청크가 너무 짧으면 직전과 합침
- 토큰 카운터: `cl100k_base` (tiktoken 호환 레이어 [ai/app/services/tokenizer_compat.py](../ai/app/services/tokenizer_compat.py))

### 7.4 결정론 후처리

| 모듈 | 역할 |
|------|------|
| [ai/app/services/repetition_detector.py](../ai/app/services/repetition_detector.py) | 한국어 어절 반복 카운팅 (LLM 카운트 한계 보완) |
| [ai/app/services/structural_validators.py](../ai/app/services/structural_validators.py) | 메타 회차 참조(`N화의 ~`), 날짜-요일 불일치 |
| [ai/app/services/timeline_extractor.py](../ai/app/services/timeline_extractor.py) | 회차별 시간 표지 누적 + 본문 회상 마커 추출 |
| [ai/app/services/text_extractor.py](../ai/app/services/text_extractor.py) | TipTap JSON → 평문 (검수용 `[N]` 줄 번호 포함 변형 제공) |

### 7.5 PR5 평문 페이로드 — [ai/app/schemas/ai_context_payload.py](../ai/app/schemas/ai_context_payload.py)

```
AiContextPayload
├── work_meta:        WorkMetaPayload (title, author_name, description, status)
├── characters:       list[CharacterPayload (id, name, gender, age, notes[], custom_fields[])]
├── world_notes:      list[WorldNotePayload (name, content)]
├── foreshadows:      list[ForeshadowPayload (title, status, importance, content)]
├── plots:            list[PlotPayload (title, content)]
└── recent_episodes:  list[RecentEpisodePayload (sort_order, title, content)]
```

**3-side 동일성 필수**: 클라이언트 `useAiContextPayload` 훅(복호화) → Spring `AiContextPayload` DTO(pass-through, 검사·로깅 없음 [AiController.java:58-59](../backend/src/main/java/com/storyzip/ai/controller/AiController.java#L58-L59)) → FastAPI `AiContextPayload` Pydantic 모델. 한 곳만 변경하면 직렬화가 깨진다.

### 7.6 MCP (현재 비활성)

- [ai/app/mcp/registry.py](../ai/app/mcp/registry.py) + [ai/app/mcp/tools/](../ai/app/mcp/tools/) 에 `get_plan` / `get_plot` / `list_characters` / `get_character` / `list_world_notes` / `get_world_note` / `search_episode_chunks` 등록
- `WriterContext`로 writer_id·work_id 강제 주입 → 툴 쿼리 범위 제한 전제
- 검수에서 `generate_with_tools` 경로는 비용 절감 목적으로 주석 처리 ([ai/app/api/v1/reviews.py:400-415](../ai/app/api/v1/reviews.py#L400-L415))

---

## 8. 보안 모델 (Plan C 옵션 1)

### 8.1 데이터 흐름

```
[Frontend (Electron · Web)]
   · KEK + work_key 로컬 보관 (frontend-encryption-guide.md 참조)
   · work / character / character_note / character_custom_field /
     world_note / plot / foreshadow / 최근 episode 본문을 평문화
   · AiContextPayload 직렬화 → HTTPS body
       │
       ▼
[Spring Backend]
   · pass-through (검사·로깅·영속화 없음)
   · X-Internal-Api-Key + body 그대로 전송
       │
       ▼
[FastAPI]
   · 메모리에서만 사용 → 로깅·DB 저장 일절 금지
   · vector_search(episode_chunk) + timeline 만 DB 직접 SELECT (평문 예외 영역)
   · settings_loader, rag.assemble_context 모두 페이로드 입력만 받는 순수 함수
```

### 8.2 보안 가드 (코드)

| 위치 | 동작 |
|------|------|
| [ai/app/main.py:18-27](../ai/app/main.py#L18-L27) | prod에서 `LANGCHAIN_*`, `OPENAI_LOG`, `ANTHROPIC_LOG` 켜져있으면 RuntimeError |
| [ai/app/main.py:61-70](../ai/app/main.py#L61-L70) | 모든 unhandled exception을 generic message로 마스킹 (RAG context echo 차단) |
| [ai/app/celery_app.py:24-34](../ai/app/celery_app.py#L24-L34) | Celery 로그 포맷에서 args/kwargs 치환자 제거, stdout 가로채기 비활성 |
| [ai/app/tasks/chunk_and_embed.py:68-76](../ai/app/tasks/chunk_and_embed.py#L68-L76) | content는 length만 기록 |
| [ai/app/api/v1/extract_settings.py:120-122](../ai/app/api/v1/extract_settings.py#L120-L122) | v1 암호문 행 자동 필터링 |
| [backend/.../AiClient.java:267-274](../backend/src/main/java/com/storyzip/ai/client/AiClient.java#L267-L274) | 비-200 응답 body 미로깅 (status + length만) |

### 8.3 평문 예외 영역

PR5에서 평문 페이로드로 옮기지 않은 두 영역:

1. **벡터 검색 청크** (`episode_chunk.content`) — DB에 평문으로 저장됨. 클라이언트 페이로드로 옮기면 페이로드가 폭발(전 회차의 모든 청크)하므로 PR5 범위 외
2. **타임라인** (검수 모드) — 검수 대상 이전 모든 회차의 시간 표지 추출. `episode.content`가 v1 암호문이면 markers 매칭이 빈 결과로 fallback ([ai/app/services/rag.py:131-135](../ai/app/services/rag.py#L131-L135))

---

## 9. 데이터 모델

### 9.1 AI 서버 ORM 모델 ([ai/app/db/models/](../ai/app/db/models/))

| 테이블 | 키 | 컬럼 (요약) | 비고 |
|--------|-----|-------------|------|
| `episode_chunk` | id (uuid) + UNIQUE(episode_id, chunk_index) | episode_id, work_id, writer_id, chunk_index, content (평문), `embedding Vector(1536)`, token_count | PR5 평문 예외 영역. CASCADE delete |
| `episode_summary` | id + UNIQUE(episode_id) | summary, is_confirmed, model_used, raw_result | **현재 미사용** (generate_summary_task 호출처 없음) |
| `extraction_suggestion` | id + UNIQUE(work_id, entity_type, suggested_name) | entity_type, suggested_name, payload(JSONB), status, confirmed_target_id | **현재 미사용** (extract_items_task 호출처 없음) |
| `ai_job` | id | writer_id, work_id, episode_id, job_type, status, error_message | **코드 내 INSERT 호출 없음** (정의만 존재) |

### 9.2 AI 서버가 SELECT하는 다른 테이블

- `episode` — RAG 벡터 검색 시 `JOIN episode e ON e.id = ec.episode_id` 로 `sort_order` 필터에만 사용. content는 SELECT하지 않음
- `character`, `character_note`, `world_note` — `extract-settings` 엔드포인트에서만 SELECT (스크립트 전용). drafts/reviews는 PR5 페이로드로 대체

### 9.3 Spring 측 동기화 책임

작품/회차/인물/세계관/플롯/복선의 **마스터 데이터는 Spring이 소유**한다. AI 서버는 인덱싱 결과(`episode_chunk`)만 INSERT한다. 자세한 ERD는 [ai-erd.md](ai-erd.md) 참조.

---

## 10. 운영·관측

### 10.1 로깅 ([ai/app/core/logging.py](../ai/app/core/logging.py))

- prod: structlog 기반 JSON (Loki/Promtail 수집)
- dev: console 포맷
- SDK 로거(`anthropic`, `openai`)는 WARNING 강등 (프롬프트 유출 방지)
- 모든 본문 콘텐츠는 length·ID만 기록

### 10.2 메트릭

- `prometheus-fastapi-instrumentator`로 자동 카운터·히스토그램 수집 ([ai/app/main.py:41-43](../ai/app/main.py#L41-L43))
- `/metrics` 엔드포인트는 인증 필수 (자동 expose 차단)
- 제외: `/metrics`, `/v1/health`

### 10.3 Celery 안정성 ([ai/app/celery_app.py:15-41](../ai/app/celery_app.py#L15-L41))

- `task_acks_late=True` + `worker_prefetch_multiplier=1` → 워커 graceful shutdown 시 메시지 유실 방지
- `chunk_and_embed_task` 재시도: 최대 3회, exponential backoff
- `task_track_started=True` → 태스크 시작 시점도 backend에 기록

### 10.4 Spring 측 외부 호출 로깅

- `ExternalCallLogger.measure(SYSTEM_AI, op, slaMs, lambda)` — SLA 초과 시 `[EXT_SLOW]` 로그
- 마커: `[EXT_START] / [EXT_OK] / [EXT_SLOW] / [EXT_FAIL]` ([backend/.../AiClient.java](../backend/src/main/java/com/storyzip/ai/client/AiClient.java) 전반)

---

## 11. Backend ↔ AI 통신 정책

### 11.1 SLA · 타임아웃

| 엔드포인트 | Spring SLA (WARN) | HTTP timeout | 비고 |
|-----------|-------------------|---------------|------|
| `/v1/health` | 2s | (RestClient default) | `AiClientProperties.connectTimeout=3s`, `readTimeout=10s` |
| `/v1/pipelines/episode` | 2s | 10s | Celery 적재만 |
| `/v1/_dev/ping` (POST/GET) | 2s | 10s | dev 전용 |
| `/v1/reviews` | 30s | 3분 | LLM 1회 호출 |
| `/v1/drafts` (SSE) | 60s | 5분 | 가상 스레드, 다운스트림 끊겨도 업스트림 drain |

출처: [backend/.../AiClient.java:46-51](../backend/src/main/java/com/storyzip/ai/client/AiClient.java#L46-L51), [backend/.../AiClient.java:162](../backend/src/main/java/com/storyzip/ai/client/AiClient.java#L162), [backend/.../AiClient.java:255](../backend/src/main/java/com/storyzip/ai/client/AiClient.java#L255), [backend/.../AiClientProperties.java:17-18](../backend/src/main/java/com/storyzip/ai/client/AiClientProperties.java#L17-L18)

### 11.2 사전 크레딧 차단 + 사후 차감 ([backend/.../AiController.java:43-45, 79-103, 138-172](../backend/src/main/java/com/storyzip/ai/controller/AiController.java#L43))

| 작업 | 사전 추정 잔액 (보수적) | 사후 정산 |
|------|-------------------------|-----------|
| Draft Sonnet | 38 credits | usage in/out → `creditCalculator.calcCredits('sonnet', in, out)` |
| Draft Opus | 70 credits | 동일 ('opus') |
| Review | 29 credits | 동일 ('sonnet'으로 차감) |

usage가 비어있거나 in+out 합 0이면 차감 skip + WARN.

### 11.3 에러 매핑

| 시나리오 | Spring ErrorCode |
|---------|------------------|
| AI 서버 unreachable | `AI_SERVER_UNAVAILABLE` |
| 응답 파싱 실패 / 비-200 | `AI_RESPONSE_INVALID` |
| 인터럽트 / timeout | `AI_REQUEST_TIMEOUT` (review 한정) |
| 잔액 부족 | `INSUFFICIENT_TOKEN` (402, 사전 차단) |
| 사후 차감 실패 | 로그만 (사용자에게 노출 안 됨) |

---

## 12. 수정 시 영향 범위 분석

전면 수정 작업 시 다음 7개 축을 항상 점검해야 한다.

### 12.1 API 계약 (Spring DTO ↔ FastAPI Pydantic)

- **영향 파일**:
  - Spring: `backend/src/main/java/com/storyzip/ai/client/dto/*` (DraftRequest, ReviewRequest, EpisodePipelineRequest, AiContextPayload …)
  - FastAPI: [ai/app/api/v1/drafts.py:26-36](../ai/app/api/v1/drafts.py#L26-L36), [ai/app/api/v1/reviews.py:226-233](../ai/app/api/v1/reviews.py#L226-L233), [ai/app/api/v1/pipelines.py:29-39](../ai/app/api/v1/pipelines.py#L29-L39), [ai/app/api/v1/extract_settings.py:63-75](../ai/app/api/v1/extract_settings.py#L63-L75)
- **위험**: Spring 쪽은 Java record라 직렬화가 자동(snake_case ↔ camelCase 매핑은 Jackson 설정 의존). 한 쪽 필드 추가/삭제 시 다른 쪽 5xx 즉시 발생
- **대응**: 한 PR 안에서 양쪽 동시 수정. 통합 테스트(Spring → FastAPI 실제 호출) 권장

### 12.2 인증 (`INTERNAL_API_KEY`)

- 코드: [ai/app/middleware/auth.py:6-11](../ai/app/middleware/auth.py#L6-L11), [ai/app/config.py:32](../ai/app/config.py#L32), [backend/.../AiClient.java:44](../backend/src/main/java/com/storyzip/ai/client/AiClient.java#L44)
- 변경 시 양쪽 환경변수 동시 배포 필요. Doppler 사용 시 한 변수 한 번만 갱신하면 두 서비스에 전파됨
- 키 로테이션 전략 부재 — 하드 컷오버만 가능

### 12.3 `AiContextPayload` 스키마 (3-side)

- **3곳 동시 수정 필수**:
  1. Frontend `useAiContextPayload` 훅 (복호화 + 직렬화)
  2. Spring `AiContextPayload` record (pass-through DTO)
  3. FastAPI `AiContextPayload` Pydantic ([ai/app/schemas/ai_context_payload.py](../ai/app/schemas/ai_context_payload.py))
- 한 곳 누락 시 직렬화 실패 또는 silent drop. `extra="ignore"`가 기본이므로 필드 추가는 silent 통과되지만, **필드 삭제/이름 변경은 즉시 깨진다**
- 페이로드 크기는 28~40K 토큰(수십~수백 KB). 압축은 응답에만 적용 ([ai/app/main.py:31-35](../ai/app/main.py#L31-L35)) — 요청 본문이 더 커지면 별도 합의 필요

### 12.4 Celery 큐 라우팅

- 코드: [ai/app/celery_app.py:35-40](../ai/app/celery_app.py#L35-L40)
- 큐 이름 변경 시: ① 워커 재배포 (`-Q indexing,...`) ② 기존 미처리 메시지(이전 큐 이름) 처리 정책 ③ Spring은 큐 이름을 모르므로 영향 없음
- **현재 dead route 정리 권장**: `generate_draft`, `run_review`는 정의된 task가 없는 leftover

### 12.5 DB 스키마 (pgvector)

- `episode_chunk.embedding`은 `Vector(1536)` 고정 ([ai/app/db/models/episode_chunk.py:21](../ai/app/db/models/episode_chunk.py#L21)) — `text-embedding-3-small` 차원에 맞춤
- 임베딩 모델 교체 시:
  - 차원 변경 → 컬럼 ALTER + 인덱스 재구축 + 기존 벡터 전량 invalidate
  - 모델만 교체 (동일 차원) → 의미 공간이 달라지므로 **기존 벡터 모두 재계산 필요**. 일관성을 위해 `chunk_and_embed_task` 일괄 재실행 잡 필요
- `episode_summary`, `extraction_suggestion`, `ai_job`은 현재 INSERT 호출 없음 → 활성화 시 마이그레이션·UPSERT 충돌 검증 필요

### 12.6 프롬프트 (코드 내 인라인)

- 위치:
  - Draft: [ai/app/api/v1/drafts.py:37-106](../ai/app/api/v1/drafts.py#L37-L106) (SYSTEM_PROMPT 275줄)
  - Review: [ai/app/api/v1/reviews.py:31-206](../ai/app/api/v1/reviews.py#L31-L206) (REVIEW_SYSTEM_PROMPT 206줄 + 절차 지시)
  - Summary: [ai/app/tasks/generate_summary.py:20-33](../ai/app/tasks/generate_summary.py#L20-L33) (현재 미호출)
  - Extract Settings: [ai/app/api/v1/extract_settings.py:29-52](../ai/app/api/v1/extract_settings.py#L29-L52)
- 모두 **별도 템플릿 파일 없이 라우터 모듈에 인라인**. 변경 시 회귀 테스트 자동화 부재 → 수동 정성 평가 필요
- 검수 결과는 [ai-review-quality-report.md](ai-review-quality-report.md)에 정성 평가 기록 — 프롬프트 수정 시 동일 케이스로 재평가 필요

### 12.7 보안 정책 (Plan C 옵션 1)

- 깨지면 사용자 평문이 ① 로그 ② DB ③ stdout ④ 외부 SDK 디버그로 새어나갈 수 있음
- 변경 시 보안 리뷰 필수 영역:
  - 새 라우터 추가 → `Depends(require_internal_api_key)` 누락 여부
  - 새 로그 추가 → content/payload 본문이 들어가는지
  - 새 SDK 디버그 환경변수 → `_danger_envs` 목록 갱신 ([ai/app/main.py:19](../ai/app/main.py#L19))
  - 새 예외 클래스 → 메시지에 RAG context echo 위험
  - DB SELECT 추가 → 클라이언트 평문 페이로드로 옮길지, 아니면 평문 예외 영역으로 인정할지

---

## 13. 결합도가 높은 지점 / 리스크 포인트 (Top 5)

> 전면 수정 시 가장 먼저 의사결정이 필요한 5개 지점.

### 🔴 #1 — 인덱싱 파이프라인의 끊긴 체인

**상태**: `chunk_and_embed_task`만 호출되고 `generate_summary_task` / `extract_items_task`는 정의만 존재 ([ai/app/api/v1/pipelines.py:73](../ai/app/api/v1/pipelines.py#L73), [ai/app/celery_app.py:9-13](../ai/app/celery_app.py#L9-L13)). `episode_summary`·`extraction_suggestion` 테이블에 데이터가 쌓이지 않는다.

**의사결정 필요**: 두 태스크를 ① 살릴지(체인 연결 + Celery include 추가 + 비용 검토) ② 폐기할지(코드·테이블·DDL 정리). [ai-overview.md](ai-overview.md) 등 다수 문서가 동작 전제로 기술되어 있으므로 결정 후 docs 일괄 정리 필요.

### 🔴 #2 — 프롬프트가 라우터 코드에 인라인

**위치**: [drafts.py:37-106](../ai/app/api/v1/drafts.py#L37-L106), [reviews.py:31-206](../ai/app/api/v1/reviews.py#L31-L206)

**문제**: ① 프롬프트 변경이 코드 PR과 섞여 history 추적 어려움 ② A/B 비교 불가 ③ 회귀 테스트 자동화 어려움

**의사결정 필요**: 별도 `prompts/` 디렉토리(현재 비어있음)로 분리할지, 인라인 유지하되 버전 라벨만 부여할지

### 🟡 #3 — `task_routes`의 dead routes

**상태**: `app.tasks.generate_draft`, `app.tasks.run_review` 라우팅 룰만 있고 task 정의는 없음 ([ai/app/celery_app.py:38-39](../ai/app/celery_app.py#L38-L39))

**위험**: 미래에 동명 task가 우연히 추가되면 의도치 않은 큐로 라우팅됨

**대응**: 단순 삭제 or `# TODO: future use`로 명시

### 🟡 #4 — `AiContextPayload` 3-side 스키마

**위치**: 클라이언트 훅 + Spring record + Pydantic 모델

**위험**: 한 쪽만 수정 시 검수/초안이 silent fail 또는 5xx. 페이로드는 평문이라 디버깅 시 로깅도 못함

**대응**: 스키마 변경 시 ① 세 곳 동시 PR ② 통합 테스트(실제 평문 페이로드로 라운드트립) ③ field별 nullability 명시

### 🟡 #5 — 임베딩 모델·차원 고정

**위치**: [episode_chunk.embedding = Vector(1536)](../ai/app/db/models/episode_chunk.py#L21), [EMBEDDING_DIM = 1536](../ai/app/services/embedder.py#L15)

**위험**: 모델/차원 교체 시 기존 벡터 전량 무효화. 작가별로 회차 수십~수백 화의 청크가 쌓여있어 재계산 비용·시간 큼

**대응**: 교체 시 ① 마이그레이션 plan ② backfill job 정의 ③ 점진 전환(이중 컬럼) vs 컷오버 결정

---

## 14. 로컬 실행·검증 가이드

### 14.1 의존성 기동

```bash
# 1. PostgreSQL + pgvector + Redis (docker-compose 또는 로컬 설치)
docker compose up -d postgres redis

# 2. AI 서버 + 워커
cd ai
pip install -e .[dev]
export LLM_PROVIDER=fake EMBEDDING_PROVIDER=fake INTERNAL_API_KEY=dev-key
uvicorn app.main:app --reload --port 8000

# 별도 터미널 — Celery worker
celery -A app.celery_app worker -Q indexing -l info
```

### 14.2 스모크 테스트

```bash
# health (인증 없음)
curl http://localhost:8000/v1/health
# → {"status":"ok"}

# Celery 라운드트립
TASK_ID=$(curl -s -X POST http://localhost:8000/v1/_dev/ping \
  -H "X-Internal-Api-Key: dev-key" -H "Content-Type: application/json" \
  -d '{"msg":"hi"}' | jq -r '.task_id')

curl http://localhost:8000/v1/_dev/ping/$TASK_ID \
  -H "X-Internal-Api-Key: dev-key"
# → {"task_id":"...","status":"SUCCESS","result":"pong:hi"}
```

### 14.3 자동 테스트

```bash
cd ai
pytest app/tests -v
```

### 14.4 통합 검증 (Spring ↔ FastAPI)

- Spring 측 `application.yml`의 `ai.client.base-url`을 `http://localhost:8000`으로
- `ai.client.internal-api-key`를 위 `INTERNAL_API_KEY`와 동일하게
- Spring 부팅 후 Frontend에서 자동저장 → `EpisodeIndexDebouncer` 로그 → 5초 후 `/v1/pipelines/episode` 호출 확인

### 14.5 PR5 페이로드 라운드트립 확인

- LLM_PROVIDER=fake 상태에서 `POST /v1/drafts` 호출 → SSE chunk 4~5개 + done 이벤트가 정상 수신되는지
- AI 서버 로그에 본문 평문이 일절 찍히지 않는지 (`grep "리운\|content"` 등으로 확인)

---

## 부록 A — 기존 docs 대비 코드 정정 요약

본 문서 작성 중 코드와 어긋나는 기존 docs 기술을 발견한 항목:

| 위치 | 기존 docs 기술 | 코드 실제 |
|------|---------------|-----------|
| [ai-server-architecture.md §Celery](ai-server-architecture.md) | `generate_summary_task → extract_items_task` 체인 동작 | `pipelines.py:73`은 `chunk_and_embed`만 호출. 두 태스크는 호출처 없음 |
| [ai-overview.md §4.1](ai-overview.md) | 인덱싱이 요약·추출까지 자동 수행 | 동일하게 미연결 |
| [ai-runtime-pipeline-current.md §3](ai-runtime-pipeline-current.md) | `generate_stream` max_tokens 8000 | [llm.py:62, 110](../ai/app/services/llm.py#L62) 기본 4000, drafts에서 4200 override |
| [ai-runtime-pipeline-current.md §4](ai-runtime-pipeline-current.md) | `mode=draft` recent_raw=4, `mode=review` recent_raw=2 | `draft_sonnet=2`, `draft_opus=4`, `review=1` ([rag.py:51-56](../ai/app/services/rag.py#L51-L56)) |
| [ai-overview.md §3](ai-overview.md) | `character_embedding`, `world_note_embedding` 테이블 사용 | AI 서버 ORM 모델·코드 어디에도 없음. 현재는 `episode_chunk`만 |
| [ai-runtime-pipeline-current.md §4](ai-runtime-pipeline-current.md) | RAG 총 예산 28K | [rag.py:46](../ai/app/services/rag.py#L46) `TOKEN_BUDGET = 40_000` |

수정 작업 시 위 정정 사항도 함께 반영해 docs 일괄 갱신 권장.
