# Folio AI 서버 아키텍처

## 개요

Folio AI 서버는 **FastAPI** 기반의 Python 서비스로, Spring Boot 백엔드에서 내부 API로 호출한다. 원고 자동 생성, 리뷰, 설정 추출, 벡터 검색 등의 AI 기능을 제공한다.

```
┌──────────────┐     X-Internal-Api-Key      ┌──────────────┐
│  Spring Boot │ ──────────────────────────→  │   FastAPI     │
│  (백엔드)     │  POST /v1/drafts (SSE)      │   (AI 서버)   │
│              │  POST /v1/reviews            │              │
│              │  POST /v1/pipelines/episode   │   Port 8000  │
│              │  POST /v1/extract-settings    │              │
└──────┬───────┘                              └──────┬───────┘
       │                                             │
       │  공유 PostgreSQL                             │  Anthropic API (Claude)
       ├──────────────────────────────────────────────┤  OpenAI API (Embedding)
       │                                             │
       └──── Redis (Celery 비동기 태스크 큐) ──────────┘
```

## 기술 스택

| 구성 요소 | 기술 |
|----------|------|
| 프레임워크 | FastAPI + Uvicorn |
| LLM | Anthropic Claude (Sonnet 4.6 / Haiku 4.5 / Opus 4.7) |
| 임베딩 | OpenAI text-embedding-3-small (1536차원) |
| 벡터 DB | PostgreSQL + pgvector |
| 비동기 DB | SQLAlchemy AsyncIO + asyncpg |
| 태스크 큐 | Celery + Redis |
| 인증 | X-Internal-Api-Key 헤더 (Spring과 공유 시크릿) |

## 디렉토리 구조

```
ai/
├── app/
│   ├── main.py                    # FastAPI 앱 진입점
│   ├── config.py                  # 환경 변수 설정 (Pydantic Settings)
│   ├── api/v1/                    # API 엔드포인트
│   │   ├── health.py              # GET  /v1/health
│   │   ├── drafts.py              # POST /v1/drafts (SSE 스트리밍)
│   │   ├── reviews.py             # POST /v1/reviews (JSON)
│   │   ├── pipelines.py           # POST /v1/pipelines/episode (비동기)
│   │   ├── extract_settings.py    # POST /v1/extract-settings (JSON)
│   │   └── _dev_ping.py           # 개발용 Celery 핑
│   ├── services/                  # 비즈니스 로직
│   │   ├── rag.py                 # RAG 컨텍스트 조립 엔진
│   │   ├── settings_loader.py     # 설정집 로더 (인물/세계관)
│   │   ├── text_extractor.py      # TipTap JSON → 평문 변환
│   │   ├── llm.py                 # LLM 프로바이더 (Anthropic/Fake)
│   │   ├── embedder.py            # 임베딩 프로바이더 (OpenAI/Fake)
│   │   ├── chunker.py             # 텍스트 청킹 + 토큰 카운팅
│   │   └── providers.py           # 프로바이더 팩토리
│   ├── tasks/                     # Celery 비동기 태스크
│   │   ├── celery_app.py          # Celery 설정
│   │   ├── chunk_and_embed.py     # 청킹 + 임베딩 태스크
│   │   ├── generate_summary.py    # 에피소드 요약 생성
│   │   └── extract_items.py       # 설정 추출 제안
│   ├── db/                        # DB 연결 + ORM 모델
│   │   ├── session.py             # AsyncSession 팩토리
│   │   ├── base.py                # DeclarativeBase
│   │   └── models/                # SQLAlchemy 모델
│   │       ├── episode_chunk.py   # 벡터 검색용 청크
│   │       ├── episode_summary.py # 에피소드 요약 캐시
│   │       ├── extraction_suggestion.py # AI 제안 엔티티
│   │       └── ai_job.py          # AI 작업 추적
│   ├── middleware/
│   │   └── auth.py                # X-Internal-Api-Key 검증
│   └── mcp/                       # MCP 도구 (현재 비활성)
│       ├── registry.py            # 도구 등록부
│       ├── context.py             # WriterContext
│       └── tools/                 # 개별 도구 구현
└── tests/                         # 테스트
```

## API 엔드포인트

### 1. 원고 자동 생성 — `POST /v1/drafts`

**SSE 스트리밍** 응답. 작가의 작품 컨텍스트를 기반으로 다음 회차 원고를 생성한다.

```
요청:
{
  "work_id": "uuid",
  "writer_id": "uuid",
  "episode_id": "uuid",
  "storyline": "이번 회차 방향",
  "current_episode_num": 5,
  "model": "sonnet",        // "sonnet" | "opus"
  "user_prompt": "추가 지시"  // 선택
}

응답 (SSE stream):
data: {"type": "chunk", "content": "글 내용..."}
data: {"type": "chunk", "content": "계속..."}
data: {"type": "done", "episode_id": "uuid", "total_length": 6000, "usage": {...}}
```

**내부 흐름:**
1. `assemble_context()` — RAG 엔진으로 40,000 토큰 컨텍스트 조립
2. 시스템 프롬프트 + 컨텍스트 + 사용자 요청을 Claude에 전달
3. SSE로 생성 결과를 실시간 스트리밍

### 2. 원고 리뷰 — `POST /v1/reviews`

작성된 원고를 설정과 비교하여 모순/오류를 찾는다.

```
요청:
{
  "work_id": "uuid",
  "writer_id": "uuid",
  "episode_id": "uuid",
  "content": "TipTap JSON (원고 내용)",
  "episode_number": 5
}

응답:
{
  "issues": [
    {
      "type": "setting_conflict",
      "severity": "critical",
      "location": "문제 구절",
      "description": "설명",
      "reference": "설정 참조",
      "suggestion": "수정 제안"
    }
  ],
  "summary": "요약",
  "score": 85,
  "usage": {"input_tokens": 1200, "output_tokens": 500}
}
```

**이슈 타입:** `setting_conflict`, `narration_conflict`, `time_conflict`, `tone_conflict`, `context_conflict`

### 3. 인덱싱 파이프라인 — `POST /v1/pipelines/episode`

에피소드 내용을 청킹+임베딩하여 벡터 검색 인덱스를 구축한다. **Celery 비동기 태스크**로 처리.

```
요청:
{
  "episode_id": "uuid",
  "work_id": "uuid",
  "writer_id": "uuid",
  "content": "에피소드 원문"
}

응답 (HTTP 202):
{
  "task_id": "celery-task-id",
  "status": "accepted",
  "reason": null
}
```

**내부 흐름:**
1. 콘텐츠 해시 비교 — 변경 없으면 `skipped` 반환
2. Celery 태스크 큐잉: 텍스트 → 청크(500~1000 토큰) → OpenAI 임베딩 → `episode_chunk` 테이블 저장

### 4. 설정 추출 — `POST /v1/extract-settings`

원고에서 새로운 인물/세계관 설정을 자동 감지한다.

```
요청:
{
  "work_id": "uuid",
  "writer_id": "uuid",
  "content": "원고 텍스트"
}

응답:
{
  "new_characters": [{"name": "...", "description": "..."}],
  "updated_characters": [{"name": "...", "field": "...", "change": "..."}],
  "new_world_notes": [{"name": "...", "description": "..."}],
  "updated_world_notes": [...],
  "foreshadowing": [...],
  "usage": {"input_tokens": N, "output_tokens": N}
}
```

### 5. 헬스체크 — `GET /v1/health`

```
응답: {"status": "ok"}
```

## RAG 컨텍스트 엔진 (`rag.py`)

원고 생성/리뷰 시 LLM에 제공할 컨텍스트를 조립한다. 40,000 토큰 예산 내에서 우선순위 기반으로 트리밍.

```
컨텍스트 구성 (우선순위 높은 순):
┌─────────────────────────────────────────┐
│ 1. 작품 메타데이터    (~500 토큰)        │  제목, 작가, 설명
│ 2. 등장인물 설정      (~2,000~5,000)    │  이름, 성별, 나이, 성격, 노트
│ 3. 세계관 설정        (~2,000~5,000)    │  세계관 노트
│ 4. 복선/떡밥          (~500~1,000)      │  미회수 복선
│ 5. 스토리라인         (~500~1,000)      │  플롯 + 이번 회차 방향
│ 6. 최근 회차 원문     (~10,000~15,000)  │  최근 2~4화 전체 원문
│ 7. 벡터 검색 결과     (~1,500~3,000)    │  유사 과거 장면 (pgvector)
└─────────────────────────────────────────┘

트리밍 순서 (예산 초과 시):
  벡터 검색 → 복선 → 세계관 → 인물 순으로 축소/제거
  최근 원문은 최우선 보존
```

### 데이터 소스

| 데이터 | 테이블 | 소유자 |
|--------|--------|--------|
| 작품 정보 | `work` | Spring (동기화) |
| 인물 | `character` + `character_note` | Spring (동기화) |
| 세계관 | `world_note` | Spring (동기화) |
| 복선 | `foreshadow` | Spring (동기화) |
| 플롯 | `plot` | Spring (동기화) |
| 에피소드 원문 | `episode` | Spring (동기화) |
| 벡터 청크 | `episode_chunk` | AI (인덱싱) |
| 에피소드 요약 | `episode_summary` | AI (요약 생성) |
| 추출 제안 | `extraction_suggestion` | AI (설정 추출) |

## Celery 비동기 태스크

```
Redis (Broker)
  ├── indexing 큐
  │   ├── chunk_and_embed_task   # 에피소드 청킹 + 벡터 임베딩
  │   └── ping_task              # 개발용
  ├── draft 큐 (미구현)
  └── review 큐 (미구현)
```

### chunk_and_embed_task

```
에피소드 원문 → extract_plain_text (TipTap JSON → 평문)
  → chunk_text (500~1000 토큰 단위 분할)
  → embed_batch (OpenAI text-embedding-3-small)
  → DB: DELETE 기존 chunks → INSERT 새 chunks
```

### generate_summary_task → extract_items_task (체인)

```
에피소드 원문 → Claude Haiku로 요약 생성
  → episode_summary 테이블 저장
  → extract_items_task로 체인
    → 요약에서 새 인물/용어/복선 추출
    → extraction_suggestion 테이블 저장
```

## LLM 프로바이더

| 프로바이더 | 설정값 | 용도 |
|-----------|-------|------|
| `FakeLLM` | `LLM_PROVIDER=fake` | 로컬 개발 (API 키 불필요) |
| `AnthropicLLM` | `LLM_PROVIDER=anthropic` | 프로덕션 (Claude API 호출) |

| 프로바이더 | 설정값 | 용도 |
|-----------|-------|------|
| `FakeEmbedder` | `EMBEDDING_PROVIDER=fake` | 로컬 개발 (결정론적 벡터) |
| `OpenAIEmbedder` | `EMBEDDING_PROVIDER=openai` | 프로덕션 (OpenAI API 호출) |

### 모델 매핑

| 용도 | 모델 | Temperature |
|------|------|-------------|
| 원고 생성 (스트리밍) | Claude Sonnet 4.6 | 0.7 |
| 원고 생성 (고품질) | Claude Opus 4.7 | default |
| 리뷰/분석 (JSON) | Claude Sonnet 4.6 | 0.2 |
| 요약/추출 (JSON) | Claude Haiku 4.5 | 0.2 |
| 임베딩 | text-embedding-3-small | — |

## 환경 변수

```env
# 앱 설정
APP_ENV=dev                    # dev | prod
APP_PORT=8000
LOG_LEVEL=INFO

# 인증
INTERNAL_API_KEY=change-me     # Spring과 공유

# DB
DATABASE_URL=postgresql+asyncpg://storyzip:storyzip@localhost:5432/storyzip

# Redis / Celery
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2

# LLM
ANTHROPIC_API_KEY=             # Claude API 키
OPENAI_API_KEY=                # OpenAI API 키 (임베딩용)
LLM_PROVIDER=fake              # fake | anthropic
EMBEDDING_PROVIDER=fake        # fake | openai
```

## Spring ↔ FastAPI 통신

```
Spring Boot                         FastAPI (AI)
──────────                         ──────────
에피소드 저장 완료
  → POST /v1/pipelines/episode     → Celery: 청킹 + 임베딩
     (X-Internal-Api-Key 헤더)       → episode_chunk 테이블 저장

AI 초안 요청
  → POST /v1/drafts (SSE)          → RAG 컨텍스트 조립
     (SseEmitter로 프록시)            → Claude 스트리밍 생성

원고 리뷰 요청
  → POST /v1/reviews               → 설정 대비 모순 검출
                                     → JSON 응답

설정 추출 요청
  → POST /v1/extract-settings      → 신규 인물/세계관 감지
                                     → JSON 응답
```

### 인증 흐름

1. Spring이 `X-Internal-Api-Key` 헤더를 포함하여 FastAPI 호출
2. FastAPI `require_internal_api_key` 미들웨어가 검증
3. 클라이언트(프론트엔드)는 FastAPI에 직접 접근하지 않음 — Spring을 통해서만 접근

## DB 모델 (AI 전용 테이블)

### episode_chunk — 벡터 검색 인덱스
```sql
CREATE TABLE episode_chunk (
    id UUID PRIMARY KEY,
    episode_id UUID REFERENCES episode(id),
    work_id UUID REFERENCES work(id),
    writer_id UUID REFERENCES writer(id),
    chunk_index INTEGER,         -- 에피소드 내 위치
    content TEXT,                -- 청크 텍스트
    embedding VECTOR(1536),      -- pgvector 임베딩
    token_count INTEGER,
    UNIQUE (episode_id, chunk_index)
);
-- IVFFlat 인덱스 (코사인 유사도)
CREATE INDEX idx_episode_chunk_embedding
    ON episode_chunk USING ivfflat (embedding vector_cosine_ops);
```

### episode_summary — 요약 캐시
```sql
CREATE TABLE episode_summary (
    id UUID PRIMARY KEY,
    episode_id UUID UNIQUE REFERENCES episode(id),
    summary TEXT,
    is_confirmed BOOLEAN DEFAULT false,
    model_used VARCHAR(50),
    raw_result TEXT
);
```

### extraction_suggestion — AI 제안
```sql
CREATE TABLE extraction_suggestion (
    id UUID PRIMARY KEY,
    work_id UUID, writer_id UUID, episode_id UUID,
    entity_type VARCHAR(30),     -- 'character' | 'world_note' | 'term'
    suggested_name VARCHAR(200),
    payload JSONB,               -- 유연한 메타데이터
    status VARCHAR(20) DEFAULT 'pending',
    UNIQUE (work_id, entity_type, suggested_name)
);
```

## 로컬 개발

```bash
# AI 서버 실행
cd ai
pip install -e ".[db,llm,dev]"
cp .env.example .env
uvicorn app.main:app --reload --port 8000

# Celery 워커 (별도 터미널)
celery -A app.tasks.celery_app worker --queues=indexing -l info

# Fake 모드 (기본): API 키 없이 동작
# 프로덕션 모드: .env에 ANTHROPIC_API_KEY, OPENAI_API_KEY 설정 후
#   LLM_PROVIDER=anthropic, EMBEDDING_PROVIDER=openai
```
