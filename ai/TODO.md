# AI 서버 구현 TODO

> 상위 스펙:
> - [docs/ai-erd.md](../docs/ai-erd.md) — 4개 AI 전용 테이블, RAG/MCP 분할
> - [docs/AI_architecture2.md](../docs/AI_architecture2.md) — 3기능 아키텍처
> - [docs/ai-data-pipeline.md](../docs/ai-data-pipeline.md) — Celery 파이프라인
> - [docs/ai-overview.md](../docs/ai-overview.md) — 팀 온보딩

> 스택: FastAPI + Celery + Redis + PostgreSQL(pgvector) + Anthropic/OpenAI

---

## 기능 개요 (최종 확정)

| # | 기능 | 트리거 | 모델 | 테이블 |
|---|------|--------|------|--------|
| ① | 회차 인덱싱 (+ 설정집 자동 추출) | 자동 저장 5초 → 디바운스 5초 | `text-embedding-3-small` + Claude Haiku | `episode_chunk`, `episode_summary`, `extraction_suggestion` |
| ② | 초안 생성 | 작가 버튼 (`POST /v1/drafts`) | Claude Sonnet 4.5 | SSE (DB 저장 없음) |
| ③ | 검수 (+ 맞춤법) | 작가 버튼 (`POST /v1/reviews`) | Claude Sonnet 4.5 | `ai_analysis` |

데이터 접근 분할:
- **RAG** — `episode`(본문): `episode_chunk` 벡터 검색
- **MCP** — `character`, `world_note`, `plan`, `plot`, `character_custom_field`: 툴 호출

---

## Phase 0 — 합의 / 사전 결정

- [x] AI ERD 확정 (4개 테이블, RAG+MCP 하이브리드)
- [x] 5초 디바운스 확정
- [x] 임포트는 일반 저장 흐름 N회 반복 (풀 프로필 생성 제외)
- [ ] `foreshadow` / `foreshadow_link` MVP 복원 여부
- [ ] pgvector × PowerSync 호환성 실증
- [ ] 임베딩 모델 확정 (`text-embedding-3-small` 유력)
- [ ] DB 마이그레이션 툴: Alembic 채택 여부

---

## Phase 1 — FastAPI + Celery 최소 배선

> 목표: 로직 없이 **비동기 구조만 먼저 살린다**.

### 1-1. 프로젝트 뼈대
- [x] `pyproject.toml` (Python 3.12)
- [x] `.env.example`, `.gitignore`, `.dockerignore`
- [x] `Dockerfile` (FastAPI) / `Dockerfile.worker` (Celery)

### 1-2. FastAPI
- [x] `app/main.py` + 라우터 등록
- [x] `app/config.py` — Pydantic Settings
- [x] `app/middleware/auth.py` — `X-Internal-Api-Key`
- [x] `app/api/v1/health.py` — `GET /v1/health`
- [x] `app/api/v1/_dev_ping.py` — Celery 연결 확인용 (dev only)

### 1-3. Celery
- [x] `app/celery_app.py` — 큐 3개 (`indexing`, `draft`, `review`)
- [x] `app/tasks/_ping.py` — 더미 태스크
- [ ] **확인**: `POST /v1/_dev/ping` → worker 로그 "pong"

### 1-4. 컨테이너 & Spring 연동 스모크
- [ ] `infra/dev/docker-compose.dev.yml`에 `ai-api`, `ai-worker`, `redis` 반영
- [ ] Spring `AiClient` 스텁: `GET /v1/health` 프로브
- [ ] Spring → FastAPI end-to-end 핑 성공

---

## Phase 2 — Day 3 (04/16): 청킹 + 임베딩

> 🟡 **SSAFY GMS 키 발급 전**: `EMBEDDING_PROVIDER=fake LLM_PROVIDER=fake`로 개발·테스트.
> Provider 추상화는 완료 ([app/services/embedder.py](app/services/embedder.py), [app/services/llm.py](app/services/llm.py), [app/services/providers.py](app/services/providers.py)).
> 키 도착 후 `openai`/`anthropic`으로 env만 전환 + 각 클래스 `NotImplementedError` 본체 구현.

### 2-1. DB
- [ ] `CREATE EXTENSION vector;`
- [ ] `episode_chunk` DDL + `UNIQUE(episode_id, chunk_index)` + `ivfflat`
- [ ] `app/db/session.py` — SQLAlchemy async + asyncpg
- [ ] `app/db/models/episode_chunk.py`

### 2-2. 청킹 서비스
- [ ] `app/services/chunker.py` — 단락 → 문장 분할, `tiktoken` 500~1,000 토큰
- [ ] 유닛 테스트 (짧은 본문 / 긴 단락 / 극단 케이스)

### 2-3. 임베딩 서비스
- [ ] `app/services/embedder.py` — OpenAI `text-embedding-3-small` 배치 호출
- [ ] 재시도(`tenacity`) + 타임아웃

### 2-4. Celery 태스크
- [ ] `app/tasks/chunk_and_embed.py` — `@task(autoretry_for, max_retries=3, retry_backoff=True)`
- [ ] UPSERT `episode_chunk` (chunk_index UNIQUE)

### 2-5. 엔드포인트
- [ ] `POST /v1/pipelines/episode` → Celery `chord` 등록, 202 Accepted
- [ ] Spring 5초 디바운스 → 이 엔드포인트 호출
- [ ] **완료 기준**: 회차 저장 → 30초 내 `episode_chunk` 적재 확인

---

## Phase 3 — Day 4 (04/17): 요약 + 설정집 자동 추출

### 3-1. DB
- [ ] `episode_summary` DDL (UNIQUE episode_id)
- [ ] `extraction_suggestion` DDL (UNIQUE work_id+entity_type+suggested_name)
- [ ] 모델: `app/db/models/episode_summary.py`, `extraction_suggestion.py`

### 3-2. LLM 클라이언트
- [ ] `app/services/llm.py` — Anthropic / OpenAI 통합 클라이언트
- [ ] 프롬프트 템플릿은 일단 **코드에 하드코딩** (`app/prompts/summary.py`, `extract.py`)

### 3-3. 태스크
- [ ] `app/tasks/generate_summary.py` — Haiku 호출 + JSON 검증 + 보정 재요청 1회 + `raw_result` 보존
- [ ] `app/tasks/extract_items.py` — summary의 엔티티 → `extraction_suggestion` UPSERT
- [ ] 오케스트레이션: `chord([chunk_and_embed, chain(generate_summary, extract_items)])`

### 3-4. 승인 API (Spring 쪽)
- [ ] `GET /api/extraction-suggestions?work_id=` (검토 UI)
- [ ] `POST /api/extraction-suggestions/{id}/confirm` → character/world_note 이관
- [ ] `POST /api/extraction-suggestions/{id}/reject`
- [ ] **완료 기준**: 저장 → 1~3분 내 요약 + 추출 후보 적재

---

## Phase 4 — Day 5 (04/18): MCP 툴 & RAG 조립 엔진

### 4-1. MCP 툴 (읽기 전용, `WriterContext` 강제 주입)
- [ ] `app/mcp/context.py` — `WriterContext(writer_id, work_id)`
- [ ] `app/mcp/tools/plan.py` — `get_plan()`
- [ ] `app/mcp/tools/plot.py` — `get_plot()`
- [ ] `app/mcp/tools/character.py` — `list_characters()`, `get_character(name)`
- [ ] `app/mcp/tools/world_note.py` — `list_world_notes(tags)`, `get_world_note(name)`
- [ ] `app/mcp/tools/episode_search.py` — `search_episode_chunks(query, k)` (pgvector)
- [ ] `app/mcp/registry.py` — Anthropic `tools` 파라미터용 JSONSchema 등록부

### 4-2. RAG 사전 조립기
- [ ] `app/services/rag.py` — 고정 재료(plan/plot/최근요약/벡터검색) 조립
- [ ] 토큰 예산 계산 (상한: 초안 ≤ 28,000, 검수 ≤ 20,000)
- [ ] **완료 기준**: 샘플 요청 → 조립된 컨텍스트의 토큰 수 로깅 OK

---

## Phase 5 — Day 6 (04/19): 초안 생성 SSE (RAG + MCP)

- [ ] `app/api/v1/drafts.py` — `POST /v1/drafts`
- [ ] 흐름:
  - [ ] 토큰 잔액 확인 (Spring 위임)
  - [ ] RAG 사전 조립 (episode 부분)
  - [ ] Anthropic tool_use 루프 (최대 3회, MCP 툴)
  - [ ] `StreamingResponse(media_type="text/event-stream")`
  - [ ] `data: {"draftIndex":0,"content":"..."}` / `data: [DONE]`
- [ ] Spring이 SSE 프록시 + 완료 후 토큰 차감
- [ ] **완료 기준**: 2초 내 첫 청크 수신

---

## Phase 6 — Day 7 (04/20): 검수 (+ 맞춤법)

- [ ] `app/api/v1/reviews.py` — `POST /v1/reviews`
- [ ] 흐름:
  - [ ] 이번 원고에서 언급된 고유명사 추출 (Haiku)
  - [ ] MCP 툴로 언급 항목 풀 조회 + 나머지 간략 목록
  - [ ] 고유명사 whitelist(맞춤법) = `character.name` + `world_note.name`
  - [ ] Sonnet 호출, JSON 출력
  - [ ] 응답 스키마: `issue.type ∈ {setting_conflict, tone_conflict, narration_conflict, spelling}`
- [ ] `ai_analysis` INSERT (기존 테이블 활용)
- [ ] **완료 기준**:
  - [ ] 설정 충돌 1건 이상 감지
  - [ ] 고유명사 whitelist 단어는 오타로 표시되지 않음

---

## Phase 7 — Day 8 (04/21): 임포트 + `ai_job`

### 7-1. DB
- [ ] `ai_job` DDL (+ `celery_task_id`)

### 7-2. 임포트 파이프라인
- [ ] Spring: `POST /api/works/{id}/import` (.txt/.docx/.md 파서)
- [ ] 회차 분리 → `episode` N개 INSERT
- [ ] FastAPI: `POST /v1/pipelines/import` → 회차 N개 일반 파이프라인 재사용
- [ ] 매 회차 `ai_job` INSERT/UPDATE
- [ ] **완료 기준**: 100화 임포트 → 프로그레스 폴링으로 42/100 확인

### 7-3. `ai_job` 조회
- [ ] `GET /v1/jobs?work_id=` (Spring)
- [ ] 알림 연동: 완료 시 `notification` INSERT

---

## Phase 8 — Day 9 (04/22): 안정화

### 8-1. 실패 처리
- [ ] JSON 검증 실패 → 보정 재요청 1회 + `raw_result` 보존
- [ ] LLM 타임아웃 → 재시도 3회 + exponential backoff
- [ ] Celery 태스크 실패 → `ai_job.status='failed'` + `error_message`
- [ ] 외부 API 5xx → 서킷브레이커 (60s 오픈)

### 8-2. 관측
- [ ] `structlog` 구조화 로깅 → Loki
- [ ] `starlette-exporter` / Celery exporter → Prometheus
- [ ] 메트릭: 태스크 성공/실패율, P95 지연, 토큰 사용량
- [ ] 저장→요약 end-to-end 시간 (목표 평균 ≤ 60s)

### 8-3. 비용
- [ ] 모델별 단가 테이블 (도입 시 `ai_prompt_template`에 이식)
- [ ] 회차당 평균 비용 대시보드
- [ ] dev 환경은 Haiku 고정

---

## 디렉터리 최종 목표

```
ai/
├── pyproject.toml
├── .env.example
├── Dockerfile
├── Dockerfile.worker
├── app/
│   ├── main.py
│   ├── config.py
│   ├── celery_app.py
│   ├── api/v1/
│   │   ├── health.py
│   │   ├── _dev_ping.py         # Phase 1
│   │   ├── pipelines.py         # Phase 2
│   │   ├── drafts.py            # Phase 5
│   │   └── reviews.py           # Phase 6
│   ├── tasks/
│   │   ├── _ping.py             # Phase 1
│   │   ├── chunk_and_embed.py   # Phase 2
│   │   ├── generate_summary.py  # Phase 3
│   │   └── extract_items.py     # Phase 3
│   ├── mcp/
│   │   ├── context.py
│   │   ├── registry.py
│   │   └── tools/
│   │       ├── plan.py
│   │       ├── plot.py
│   │       ├── character.py
│   │       ├── world_note.py
│   │       └── episode_search.py
│   ├── services/
│   │   ├── chunker.py
│   │   ├── embedder.py
│   │   ├── llm.py
│   │   └── rag.py
│   ├── prompts/
│   │   ├── summary.py
│   │   ├── extract.py
│   │   ├── draft.py
│   │   └── review.py
│   ├── db/
│   │   ├── session.py
│   │   └── models/
│   │       ├── episode_chunk.py
│   │       ├── episode_summary.py
│   │       ├── extraction_suggestion.py
│   │       └── ai_job.py
│   ├── schemas/                 # Pydantic DTO
│   ├── middleware/auth.py
│   └── core/
│       ├── exceptions.py
│       └── logging.py
└── tests/
```

---

## 진행 원칙

1. **Phase 1 배선 완료 전에는 LLM 로직 금지** — 더미 태스크로 시작
2. **각 Phase 완료 기준 체크 후 다음 Phase 진입**
3. **환경변수는 Doppler** — 코드에 키 하드코딩 금지
4. **MCP 툴의 `writer_id` / `work_id`는 서버가 강제 주입** — LLM 생성값 무시
5. **커밋 단위**: Phase 소단계 1개 = 커밋 1개

---

## 다음 작업 (Phase 1 마무리)

1. Redis 기동 (`docker compose up redis`)
2. `uvicorn app.main:app --reload` + `curl /v1/health` 200 확인
3. `celery -A app.celery_app worker -Q indexing -l info` 기동
4. `POST /v1/_dev/ping` → worker 로그 "pong:hello" 확인
5. Spring 쪽 `AiClient` 스텁 작성 + end-to-end 연동

이 5개 끝나면 Phase 2 진입.
