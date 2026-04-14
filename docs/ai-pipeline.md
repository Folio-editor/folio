# AI 파이프라인 구현 계획 (Day 3 ~ Day 9)

## 개요

- **스택**: FastAPI + Celery + Redis + PostgreSQL(pgvector)
- **목적**: 회차 저장 → 자동 청킹/임베딩/요약, RAG 기반 초안·검수·맞춤법 검사
- **기간**: Day 3 (04/16) ~ Day 9 (04/22)
- **참고**: [architecture.md](architecture.md), [service-spec.md](service-spec.md) §3.12, [infra.md](infra.md)

---

## 현행 스펙(service-spec.md §3.12)과의 차이

| 항목 | 기존 스펙 | 본 계획 |
|------|-----------|---------|
| 설정 충돌 / 톤 / 문장 제안 / 요약 | O | 유지 |
| RAG (pgvector 임베딩) | 미정 | **신규 도입** |
| 회차 저장 시 자동 파이프라인 | 미정 | **신규** |
| AI 초안 생성 (SSE 스트리밍) | 미정 | **신규** |
| AI 검수 (구조화 JSON) | 설정 충돌에 포함 | **전용 엔드포인트 분리** |
| 맞춤법 검사 (고유명사 인지) | 미정 | **신규** |

> 위 "신규" 항목은 기획/DBA 합의 대상.

---

## 기술 선택 근거: 왜 Celery인가

- **BullMQ는 Node.js 전용** → 현재 스택에 Node 서비스 없음 (Spring Boot + FastAPI)
- FastAPI가 AI 서버이므로 **Python 네이티브 큐**가 자연스러움
- [infra.md](infra.md)에 **Celery + Redis**가 이미 기본 인프라로 명시됨
- LangChain, tiktoken, pgvector(SQLAlchemy) 모두 Python 생태계

---

## 전체 파이프라인 흐름

```
┌─────────────┐   PATCH /api/episodes/{id}   ┌──────────────┐
│  Frontend   │ ───────────────────────────▶ │ Spring Boot  │
└─────────────┘                               └──────┬───────┘
                                      5s debounce    │
                                                     ▼
                                         POST /v1/pipelines/episode
                                                     │
                                                     ▼
                                              ┌──────────────┐
                                              │   FastAPI    │
                                              └──────┬───────┘
                                              enqueue│ chain
                                                     ▼
                                              ┌──────────────┐
                                              │    Redis     │
                                              └──────┬───────┘
                                                     ▼
                                      ┌──────────────────────────┐
                                      │     Celery Worker         │
                                      │  ① chunk-and-embed        │
                                      │  ② generate-summary       │
                                      │  ③ extract-items          │
                                      └──────────┬───────────────┘
                                                 ▼
                              PostgreSQL: episode_chunk / episode_summary
```

---

## Day 3 (04/16) — 청킹 + 임베딩 파이프라인

### Celery 큐 구조

- Celery app: `app.workers.celery_app`
- 큐 이름: `process-episode`
- 체인 구성:
  ```python
  from celery import chain
  chain(
      chunk_and_embed.s(episode_id),
      generate_summary.s(),
      extract_items.s(),
  ).apply_async(queue="process-episode")
  ```
- 재시도 정책:
  ```python
  @task(
      autoretry_for=(Exception,),
      max_retries=3,
      retry_backoff=True,
      retry_backoff_max=60,
      retry_jitter=True,
  )
  ```

### 청킹 구현

- 단락(`\n\n`) 기준 1차 분할
- 500 ~ 1,000 토큰 초과 단락 → 문장 기준 재분할
- 토큰 측정: `tiktoken` (모델에 맞는 인코딩)

### 임베딩 + pgvector 저장

- 배치 임베딩 호출 (OpenAI `text-embedding-3-small` 기본)
- 테이블 `episode_chunk` Upsert:
  ```sql
  INSERT INTO episode_chunk (episode_id, chunk_index, content, embedding, tokens)
  VALUES (...)
  ON CONFLICT (episode_id, chunk_index) DO UPDATE
  SET content = EXCLUDED.content,
      embedding = EXCLUDED.embedding,
      tokens = EXCLUDED.tokens;
  ```
- 인덱스: `ivfflat (embedding vector_cosine_ops)`

### Episode 저장 API 연동

- Spring Boot `PATCH /api/episodes/{id}` 저장 시
- **5초 디바운스** 후 FastAPI `POST /v1/pipelines/episode` 호출
- 작가에게는 즉시 **"저장됨"** 반환, 파이프라인은 백그라운드 실행

### ✅ 완료 기준

회차 저장 → **30초 이내** `episode_chunk` 테이블에 데이터 적재 확인

---

## Day 4 (04/17) — 자동 요약 (Claude Haiku)

### 흐름

- 청크 수집 → FastAPI `POST /v1/episodes/{id}/summary` (Celery 태스크)
- 모델: `claude-haiku-4-5-20251001`

### 구조화 JSON 출력

```json
{
  "summary": "...",
  "characters": { "existing": ["..."], "new": ["..."] },
  "newTerms": ["..."],
  "foreshadowingCandidates": ["..."]
}
```

### 파싱 실패 처리

- JSON 파싱 실패 → 보정 재요청 1회
- 원문은 `episode_summary.raw_result`에 보존 (후 수동 검토용)

### 저장

- `episode_summary(is_approved=false, raw_result=<원문>)`

### 관리 API

- `GET  /api/episodes/{id}/summary` — 요약 조회
- `PATCH /api/episodes/{id}/summary` — 요약 수정 / 승인 (`is_approved=true`)

### ✅ 완료 기준

회차 저장 → **4분 이내** `episode_summary` 자동 생성, API로 조회 확인

---

## Day 5 (04/18) — RAG 컨텍스트 조립 엔진

### 입력

`work_id`, `writer_id`, `storyline`, `current_episode_num`

### 수집 소스 (토큰 예산)

| 소스 | 방식 | 예산 |
|------|------|------|
| 과거 승인 요약 | `episode_summary WHERE is_approved=true` | ~500 |
| 설정 노트 (의미 검색) | `ORDER BY embedding <=> $storyline_vec LIMIT 10` | ~3,000 |
| 집필 완료본 장면 | 최근 회차 3개 청크 | ~4,000~6,000 |
| 동일 세트 스토리 | 같은 `work_id` 설정 청크 | ~2,000 |
| 작가 동일 설정 타 작품 | `writer_id` 매칭 | ~500 |
| 시리즈 편집 가이드 | 템플릿 | ~4,000 |

### 최종 컨텍스트 (~28,000 토큰)

- 스토리라인 (사용자 입력)
- 스토리라인 세트 (작가 입력)
- 회차 기본 구조 (개요, 내용, 결말)
- 부가 정보 (줄거리, 장르, 분위기)
- 사용자 세트 (프로필, 장르, 분위기)

### ✅ 완료 기준

storyline 입력 → **28,000 토큰 이내** 컨텍스트 생성, 각 소스별 데이터 의도대로 연결 확인

---

## Day 6 (04/19) — AI 초안 생성 (SSE 스트리밍)

### 엔드포인트

`POST /v1/drafts`

### 흐름

1. 토큰 잔액 확인 (1,500 토큰 소요)
2. RAG 컨텍스트 조립 (Day 5 엔진)
3. `claude-sonnet-4-5` 호출 (`temperature=0.8`)
4. SSE 스트리밍 응답
5. 완료 후 토큰 차감 + 드래프트 DB 저장

### SSE 포맷

```
data: {"draftIndex": 0, "content": "..."}
data: {"draftIndex": 1, "content": "..."}
data: [DONE]
```

### FastAPI 구현

```python
from fastapi.responses import StreamingResponse

async def stream_draft(...):
    async for chunk in llm.astream(...):
        yield f"data: {json.dumps({...})}\n\n"
    yield "data: [DONE]\n\n"

return StreamingResponse(stream_draft(...), media_type="text/event-stream")
```

### 백업 유의

- LLM 응답 수신 중 중단 시 부분 저장
- "이어 쓰기" 지원 — 중단 지점부터 재호출

### ✅ 완료 기준

SSE 스트리밍으로 **2초 이내 첫 청크 수신**, 드래프트 저장 확인

---

## Day 7 (04/20) — AI 검수 API

### 엔드포인트

`POST /v1/reviews`

### 흐름

1. 토큰 잔액 확인 (500 토큰 소요)
2. 설정노트 + 과거 요약 짧은 조립
3. 검수 프롬프트 (JSON 출력) → `claude-sonnet-4-5`
4. 파싱 + 저장
5. 토큰 차감 (500)

### 응답 스키마

```json
{
  "issues": [
    {
      "type": "setting_conflict | narration_conflict | tone_conflict",
      "severity": "high | medium | low",
      "description": "...",
      "location": "...",
      "suggestion": "..."
    }
  ],
  "newItems": [
    { "type": "character | term", "name": "...", "description": "..." }
  ]
}
```

### ✅ 완료 기준

설정 충돌 포함 원고 → **1건 이상 감지** 확인

---

## Day 8 (04/21) — 맞춤법 검사 API

### 엔드포인트

`POST /v1/spellcheck`

프런트에서 편집 중 **주기 호출** (디바운스).

### 흐름

1. `work_id`로 고유명사/용어 조회
   - 소스: `character`, `world_note`, `dictionary`
   - 허용 단어 집합 구성
2. 허용 단어 + 본문 → LLM 호출 (JSON 출력)
3. 오타 하이라이트 + 수정 제안 반환

### 특이사항

- **DB 저장 없음** (stateless)
- 설정방 등록 고유명사는 오타로 표시되지 않음

### ✅ 완료 기준

설정방에 등록된 고유명사가 맞춤법 오류로 표시되지 않는 것 확인

---

## Day 9 (04/22) — 파이프라인 안정화

### 실패 처리 계층

| 실패 유형 | 대응 |
|-----------|------|
| JSON 검증 실패 | 원문 보존 + 보정 재요청 1회 |
| LLM 타임아웃 | 3회 재시도 (exponential backoff) |
| Celery 태스크 실패 | `max_retries=3`, dead-letter 큐 기록 |
| 외부 API 5xx | 서킷브레이커 (60s 오픈) |

### 관측 (Prometheus + Loki)

- 태스크 성공/실패율, P95 지연, 토큰 사용량
- 회차 저장 → 요약 완료까지 end-to-end 시간 (**목표: 평균 ≤ 60s**)

### 비용 관리

- 모델별 단가 테이블 → `ai_analysis.tokens_used` 기반 집계
- 회차당 평균 비용 대시보드
- 환경별(dev/test/prod) 모델 구분 (dev는 Haiku 고정)

---

## 스키마 변경 (요약)

```sql
-- 신규
CREATE TABLE episode_chunk (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id      UUID NOT NULL REFERENCES episode(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    content         TEXT NOT NULL,
    embedding       VECTOR(1536) NOT NULL,
    tokens          INTEGER NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (episode_id, chunk_index)
);
CREATE INDEX ON episode_chunk USING ivfflat (embedding vector_cosine_ops);

CREATE TABLE episode_summary (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id      UUID NOT NULL UNIQUE REFERENCES episode(id) ON DELETE CASCADE,
    summary         TEXT NOT NULL,
    characters      JSONB,
    new_terms       JSONB,
    foreshadowing   JSONB,
    is_approved     BOOLEAN NOT NULL DEFAULT false,
    raw_result      TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);
```

---

## 의존성 / 환경

### Python 패키지

- `fastapi`, `uvicorn`, `celery`, `redis`
- `langchain`, `langchain-openai`, `langchain-anthropic`
- `tiktoken`
- `sqlalchemy`, `pgvector`, `psycopg[binary]`
- `pydantic-settings`, `structlog`, `starlette-exporter`

### 환경변수

- `OPENAI_API_KEY`, `CLAUDE_API_KEY`
- `REDIS_URL`
- `DATABASE_URL`
- `INTERNAL_API_KEY` (Spring ↔ FastAPI 공유 비밀)

### Docker

- `ai/Dockerfile` — FastAPI (uvicorn)
- `ai/Dockerfile.worker` — Celery worker

---

## 오픈 이슈

- [ ] pgvector 확장 설치가 PowerSync 논리 복제와 호환되는지 검증
- [ ] 임베딩 모델 확정 (OpenAI `text-embedding-3-small` vs. `voyage-3`)
- [ ] RAG 컨텍스트 28,000 토큰 예산 — Sonnet 4.5 입력 한도 내 OK, 출력 여유 재확인
- [ ] Day 8 맞춤법 검사 호출 빈도 / 비용 상한 정책
- [ ] `episode_chunk` / `episode_summary` 테이블 동기화 대상 여부 (서버 전용 vs. PowerSync 동기화)
