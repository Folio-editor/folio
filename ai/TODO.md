# AI 서버 구현 TODO

> 상위 설계: [../docs/ai-pipeline.md](../docs/ai-pipeline.md)
> 스택: FastAPI + Celery + Redis + PostgreSQL(pgvector)

---

## Phase 0 — 합의 / 사전 결정

- [ ] 팀/기획 리뷰: RAG 도입, pgvector 추가, 스키마 신설(`episode_chunk`, `episode_summary`) 3건 승인
- [ ] 임베딩 모델 확정 (OpenAI `text-embedding-3-small` vs `voyage-3`)
- [ ] pgvector × PowerSync 논리 복제 호환성 검증
- [ ] 맞춤법 검사 호출 빈도 / 비용 상한 정책
- [ ] `episode_chunk` / `episode_summary` PowerSync 동기화 여부 (서버 전용 추천)

---

## Phase 1 — 최소 MVP (FastAPI + Redis + Celery 배선)

> 목표: AI 로직은 더미로 두고 **비동기 구조가 살아있는지** 먼저 확인

### 1-1. FastAPI 뼈대
- [ ] `ai/requirements.txt` 작성 (fastapi, uvicorn, celery, redis, pydantic-settings)
- [ ] `ai/app/main.py` — FastAPI 앱 + 라우터 등록
- [ ] `ai/app/config.py` — pydantic-settings (`REDIS_URL`, `INTERNAL_API_KEY`)
- [ ] `ai/app/routers/health.py` — `GET /health` → `{"status":"ok"}`
- [ ] **확인**: `uvicorn app.main:app --reload` → `curl localhost:8000/health` 200

### 1-2. Redis
- [ ] Redis 컨테이너 기동 (`docker run -d -p 6379:6379 redis:7-alpine`)
- [ ] **확인**: `redis-cli ping` → `PONG`

### 1-3. Celery 배선 (ping 수준)
- [ ] `ai/app/celery_app.py` — Celery 인스턴스 (broker/backend = Redis)
- [ ] `ai/app/tasks.py` — `ping_task(msg) -> str` (더미)
- [ ] `ai/app/routers/ping.py` — `POST /ping` → `.delay()`, `GET /ping/{task_id}` → 상태 조회
- [ ] Celery 워커 기동: `celery -A app.celery_app worker -l info`
- [ ] **확인**: POST /ping → task_id → worker 로그에 "pong" → GET /ping/{id} SUCCESS

### 1-4. 인증
- [ ] `ai/app/middleware/auth.py` — `X-Internal-Api-Key` 검증
- [ ] **확인**: 헤더 없으면 401, 있으면 통과

### 1-5. Docker
- [ ] `ai/Dockerfile` — FastAPI (uvicorn)
- [ ] `ai/Dockerfile.worker` — Celery worker
- [ ] `ai/.env.example`

### 1-6. Spring Boot 연동 스모크
- [ ] Spring에 FastAPI 호출 WebClient 추가
- [ ] 회차 저장 API → `POST /ping` 호출로 end-to-end 확인

---

## Phase 2 — Day 3 (04/16): 청킹 + 임베딩 파이프라인

### 2-1. DB 준비
- [ ] PostgreSQL: `CREATE EXTENSION vector;`
- [ ] Spring 마이그레이션: `episode_chunk` 테이블 + `ivfflat` 인덱스
- [ ] SQLAlchemy 모델 `ai/app/models/episode_chunk.py`

### 2-2. 청킹
- [ ] `ai/app/services/chunker.py`
  - [ ] 단락(`\n\n`) 분할
  - [ ] 500~1,000 토큰 초과 시 문장 재분할
  - [ ] `tiktoken` 연동
- [ ] 유닛 테스트: 짧은 본문 / 긴 단락 / 극단 케이스

### 2-3. 임베딩
- [ ] `ai/app/services/embedder.py` — OpenAI 임베딩 배치 호출
- [ ] 재시도 / 타임아웃

### 2-4. Celery 태스크 체인
- [ ] `ai/app/tasks/chunk_and_embed.py`
- [ ] `ai/app/tasks/generate_summary.py` (빈 껍데기)
- [ ] `ai/app/tasks/extract_items.py` (빈 껍데기)
- [ ] `chain(chunk_and_embed.s(), generate_summary.s(), extract_items.s())`
- [ ] 재시도: `max_retries=3, retry_backoff=True`

### 2-5. 엔드포인트
- [ ] `POST /v1/pipelines/episode` → 체인 등록, 202 Accepted
- [ ] `GET /v1/pipelines/tasks/{task_id}` → 상태 조회

### 2-6. Spring 연동
- [ ] `PATCH /api/episodes/{id}` 저장 후 5초 디바운스 → FastAPI 호출
- [ ] **완료 기준**: 회차 저장 → 30초 이내 `episode_chunk` 적재

---

## Phase 3 — Day 4 (04/17): 자동 요약 (Claude Haiku)

- [ ] `episode_summary` 테이블 마이그레이션
- [ ] `ai/app/services/llm_factory.py` — LangChain ChatAnthropic/ChatOpenAI 생성
- [ ] `ai/app/prompts/summary.py` — 프롬프트 템플릿
- [ ] `tasks/generate_summary.py` 실제 구현
  - [ ] Claude Haiku 호출 (`claude-haiku-4-5-20251001`)
  - [ ] JSON 파싱 + 검증
  - [ ] 실패 시 보정 재요청 1회 + `raw_result` 보존
- [ ] 관리 API
  - [ ] `GET /v1/episodes/{id}/summary`
  - [ ] `PATCH /v1/episodes/{id}/summary` (수정/승인)
- [ ] **완료 기준**: 회차 저장 → 4분 이내 `episode_summary` 생성

---

## Phase 4 — Day 5 (04/18): RAG 컨텍스트 조립 엔진

- [ ] `ai/app/services/rag/` 디렉터리
- [ ] 수집기 6종
  - [ ] `approved_summaries.py` (~500 토큰)
  - [ ] `world_notes_semantic.py` — pgvector 유사도 검색 (~3,000 토큰)
  - [ ] `recent_episode_chunks.py` (~4,000~6,000 토큰)
  - [ ] `same_work_settings.py` (~2,000 토큰)
  - [ ] `writer_other_works.py` (~500 토큰)
  - [ ] `series_guide.py` (~4,000 토큰)
- [ ] `ai/app/services/rag/assembler.py` — 토큰 예산 관리 (최대 28,000)
- [ ] **완료 기준**: storyline 입력 → 28K 토큰 이내 컨텍스트 출력

---

## Phase 5 — Day 6 (04/19): AI 초안 생성 (SSE 스트리밍)

- [ ] `POST /v1/drafts`
- [ ] 토큰 잔액 확인 (1,500 토큰) — Spring이 선검증
- [ ] RAG 컨텍스트 조립
- [ ] `claude-sonnet-4-5` 호출 (temperature=0.8)
- [ ] `StreamingResponse(media_type="text/event-stream")` + async generator
  - [ ] `data: {"draftIndex":0,"content":"..."}`
  - [ ] `data: [DONE]`
- [ ] 완료 후 토큰 차감 + 드래프트 DB 저장
- [ ] "이어 쓰기" 지원
- [ ] **완료 기준**: 2초 이내 첫 청크 수신

---

## Phase 6 — Day 7 (04/20): AI 검수 API

- [ ] `POST /v1/reviews`
- [ ] 토큰 잔액 확인 (500 토큰)
- [ ] 짧은 RAG 컨텍스트 (설정노트 + 최근 요약)
- [ ] 검수 프롬프트 (JSON 출력)
- [ ] `claude-sonnet-4-5` 호출
- [ ] 응답 스키마 검증
  ```
  issues: [{type, severity, description, location, suggestion}]
  newItems: [{type, name, description}]
  ```
- [ ] 토큰 차감 (500)
- [ ] **완료 기준**: 설정 충돌 포함 원고 → 1건 이상 감지

---

## Phase 7 — Day 8 (04/21): 맞춤법 검사 API

- [ ] `POST /v1/spellcheck`
- [ ] `work_id`로 허용 단어 조회 (`character`, `world_note`, `dictionary`)
- [ ] LLM 호출 (JSON 출력)
- [ ] 오타 하이라이트 + 수정 제안 반환
- [ ] DB 저장 없음 (stateless)
- [ ] **완료 기준**: 설정방 고유명사 → 오타로 표시되지 않음

---

## Phase 8 — Day 9 (04/22): 파이프라인 안정화

### 8-1. 실패 처리
- [ ] JSON 검증 실패 → 원문 보존 + 보정 재요청 1회
- [ ] LLM 타임아웃 → 3회 재시도 (exponential backoff)
- [ ] Celery 태스크 실패 → DLQ (dead-letter queue) 기록
- [ ] 외부 API 5xx → 서킷브레이커 (60s 오픈)

### 8-2. 관측
- [ ] Prometheus 계측 (`starlette-exporter`)
  - [ ] 태스크 성공/실패율
  - [ ] P95 지연
  - [ ] 토큰 사용량
- [ ] Loki 구조화 로깅 (`structlog`)
- [ ] Grafana 대시보드: end-to-end 저장→요약 시간 (목표 ≤ 60s)

### 8-3. 비용 관리
- [ ] 모델별 단가 테이블
- [ ] `ai_analysis.tokens_used` 기반 회차당 평균 비용 집계
- [ ] 환경별 모델 구분 (dev는 Haiku 고정)

---

## 디렉터리 최종 목표

```
ai/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── celery_app.py
│   ├── api/v1/
│   │   ├── health.py
│   │   ├── pipelines.py
│   │   ├── summary.py
│   │   ├── drafts.py
│   │   ├── reviews.py
│   │   └── spellcheck.py
│   ├── tasks/
│   │   ├── chunk_and_embed.py
│   │   ├── generate_summary.py
│   │   └── extract_items.py
│   ├── services/
│   │   ├── chunker.py
│   │   ├── embedder.py
│   │   ├── llm_factory.py
│   │   └── rag/
│   ├── prompts/
│   ├── models/               # SQLAlchemy
│   ├── schemas/              # Pydantic DTO
│   ├── middleware/
│   │   ├── auth.py
│   │   └── logging.py
│   └── core/
│       ├── exceptions.py
│       └── observability.py
├── tests/
├── Dockerfile
├── Dockerfile.worker
├── requirements.txt
├── .env.example
└── README.md
```

---

## 진행 원칙

1. **Phase 1(MVP 배선) 완료 전에는 AI 로직 작성 금지** — 더미로 시작
2. **각 Phase 완료 기준 충족 후 다음 Phase 진입** — 체크박스 미통과 시 넘어가지 않기
3. **환경변수는 Doppler로** — 코드에 키 하드코딩 절대 금지 ([docs/architecture.md](../docs/architecture.md) §보안)
4. **테스트**: 각 서비스 모듈은 LLM 모킹(`langchain_core.language_models.fake`)으로 유닛테스트 작성
5. **커밋 단위**: Phase 소단계 1개 = 커밋 1개

---

## 오늘 당장 할 일 (Phase 1-1 ~ 1-3)

1. `ai/requirements.txt` 작성
2. `ai/app/main.py` + `/health` 엔드포인트
3. Redis 컨테이너 기동
4. `celery_app.py` + `ping_task`
5. `POST /ping` → worker 로그에 "pong" 확인

여기까지 되면 **비동기 구조가 산 것** — 이후 모든 AI 기능은 이 배선 위에 얹힘.
