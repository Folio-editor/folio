# AI 서비스 아키텍처 (v2 — 풀스펙)

> 본 문서는 [docs/AI_architecture.md](AI_architecture.md)(3기능 MVP 버전)의 **확장판**입니다.
> 첨부 이미지(Day 3~9 구현 일정)와 팀이 합의한 입출력 스펙을 종합해 4기능 풀스펙 아키텍처로 재정의합니다.
>
> - 관련 문서: [ai-pipeline.md](ai-pipeline.md)(구현 일정), [service-spec.md](service-spec.md) §3.12, [architecture.md](architecture.md), [infra.md](infra.md), [ddl.sql](ddl.sql)

---

## 1. 개요

### 1.1 목표

StoryZip 작가가 긴 연재 소설을 쓰는 과정에서, **설정·전개·톤 일관성을 AI가 자동으로 유지**하도록 돕는 서버를 구축한다. 회차 저장 시점부터 청킹·임베딩·요약이 자동 수행되고, 초안 생성과 검수는 RAG로 과거 맥락을 참조해 정확도를 확보한다.

### 1.2 스택

| 계층 | 기술 | 역할 |
|------|------|------|
| API 게이트웨이 | **Spring Boot (Java)** | 인증·토큰 과금·감사 로그·Doppler 시크릿 관리 |
| AI 서버 | **FastAPI (Python 3.12)** | LLM 호출·RAG 조립·SSE 스트리밍 |
| 비동기 워커 | **Celery + Redis** | 청킹·임베딩·요약 파이프라인 |
| 데이터 | **PostgreSQL + pgvector** | 도메인 테이블 + 벡터 인덱스 |
| 동기화 | **PowerSync** | 서버 Postgres ↔ 클라 SQLite (서버 전용 테이블 제외) |
| LLM | Claude Sonnet 4.5 / Haiku 4.5, OpenAI Embeddings | 생성·요약·임베딩 |

### 1.3 서비스 범위 — 4가지 기능

| # | 기능 | 트리거 | 모델 | 출력 |
|---|------|--------|------|------|
| ① | **회차 인덱싱** | 회차 저장(PATCH) → 5초 디바운스 | embedding + Haiku | `episode_chunk`, `episode_summary` |
| ② | **초안 생성** | 작가 요청(POST /v1/drafts) | Sonnet 4.5 | SSE 스트리밍 본문(목표 3~5줄 MVP, 확장 시 5,000자) |
| ③ | **검수** | 작가 요청(POST /v1/reviews) | Sonnet 4.5 | JSON(issues, newItems) |
| ④ | **프로필 자동 생성** | 원고 임포트 시 1회 | Haiku | 캐릭터/세계관 후보 + 승인 큐 |

> 원본 스펙의 **맞춤법 검사**는 Phase 2 확장으로 분리 — 본 아키텍처에선 훅만 남김.

---

## 2. 설계 원칙

### 2.1 AI 서버는 무상태(Stateless)

FastAPI는 **DB 커밋을 직접 하지 않는다**. 모든 영속 쓰기는 Spring Boot를 경유한다. 이유:
- 토큰 과금·감사 로그·트랜잭션 경계를 Spring 한 곳에서 관리
- 블루/그린 배포 시 FastAPI 인스턴스를 자유롭게 교체
- AI 서버 장애가 도메인 데이터 무결성에 영향 주지 않음

**예외**: Celery 워커의 청킹/임베딩 결과는 FastAPI → Spring Boot 내부 API 호출로 기록.

### 2.2 프론트 ↔ AI 직접 호출 금지

모든 AI 호출은 **Spring → FastAPI**를 거친다.
- LLM API 키가 FastAPI에만 존재 (Doppler로 주입)
- JWT 인증·토큰 잔액 검증은 Spring에서 선처리
- FastAPI는 `X-Internal-Api-Key` 공유 비밀로만 접근 가능

### 2.3 서버 전용 테이블은 PowerSync Publication 제외

`episode_chunk`, `episode_summary`, `extraction_suggestion`, `character_embedding`, `world_note_embedding`은 **복제 대상이 아님**. VECTOR(1536) 컬럼이 클라 SQLite로 가봤자 쓸 수 없고 용량만 키운다.

```sql
-- ✅ 안전한 publication
CREATE PUBLICATION powersync FOR TABLE
  work, plan, episode, character, world_note, plot, foreshadow, idea_archive, ...;
-- episode_chunk, episode_summary, *_embedding 은 의도적으로 제외
```

### 2.4 비동기 기본, 동기 예외

| 패턴 | 기능 |
|------|------|
| 비동기(Celery) | ① 인덱싱, ④ 프로필 자동 생성 |
| 동기(즉시 응답) | ③ 검수(JSON) |
| 스트리밍(SSE) | ② 초안 생성 |

### 2.5 프롬프트는 서버 관리

`ai_prompt_template` 테이블로 버전 관리. 코드 배포 없이 프롬프트 튜닝 가능.

---

## 3. 시스템 아키텍처

```
┌──────────────┐  PATCH /api/episodes/{id}  ┌───────────────┐
│   Frontend   │ ─────────────────────────▶ │  Spring Boot  │
│ (Vue/Mobile) │ ◀── SSE /api/drafts/stream │  (API G/W)    │
└──────┬───────┘                            └───┬───────────┘
       │                                        │
       │ (PowerSync 양방향 동기화)                 │ ① X-Internal-Api-Key
       │                                        │ ② 토큰 과금·감사
       ▼                                        ▼
┌──────────────┐                         ┌─────────────────┐
│ SQLite (로컬) │                         │    FastAPI      │
└──────────────┘                         │  (AI 서버, 무상태)│
                                         └───┬──────┬──────┘
                  ┌──────────────────────────┘      │ 스트리밍 LLM 호출
                  │ enqueue                         ▼
                  ▼                          ┌──────────────┐
           ┌──────────────┐                  │ Claude/OpenAI│
           │    Redis     │                  │   API        │
           └──────┬───────┘                  └──────────────┘
                  │
                  ▼
           ┌──────────────┐
           │Celery Worker │  ① chunk_and_embed → ② summary → ③ extract_items
           └──────┬───────┘
                  │ 결과 저장(Spring 내부 API)
                  ▼
           ┌──────────────────────────────────────────────┐
           │          PostgreSQL + pgvector                │
           │ 동기화: work, episode, character, world_note… │
           │ 서버전용: episode_chunk, episode_summary,     │
           │          *_embedding, extraction_suggestion   │
           └──────────────────────────────────────────────┘
```

---

## 4. 기능별 데이터 흐름

### 4.1 ① 회차 인덱싱 (청킹 + 임베딩 + 요약)

```
[작가 저장] → Spring PATCH /api/episodes/{id}
              └─ episode.content 갱신 (동기, 즉시 "저장됨" 응답)
              └─ 5초 디바운스 타이머 등록

[5초 후] → Spring → FastAPI POST /v1/pipelines/episode {episode_id}
          └─ FastAPI가 Celery chain 등록
              ① chunk_and_embed.s(episode_id)
                 - extractPlainText(tiptap_json)
                 - 단락 분할 → 500~1,000 토큰 단위 재분할 (tiktoken)
                 - OpenAI text-embedding-3-small 배치 호출
                 - episode_chunk upsert (서버 전용, PowerSync 제외)
              ② generate_summary.s()
                 - Claude Haiku 호출 → JSON(summary, characters, new_terms, foreshadowing)
                 - episode_summary upsert (is_approved=false)
              ③ extract_items.s()
                 - 요약 내 new_terms / foreshadowing → extraction_suggestion 적재
                 - 작가 승인 전까지 status='pending'
```

**완료 기준**: 회차 저장 → 30초 내 `episode_chunk`, 4분 내 `episode_summary` 적재.

### 4.2 ② 초안 생성 (SSE 스트리밍)

```
[작가 클릭] → Frontend POST /api/drafts {work_id, storyline, current_episode_num}
              ↓
Spring  → 토큰 잔액 검증 (1,500 토큰)
        → FastAPI POST /v1/drafts (X-Internal-Api-Key)
              ↓
FastAPI → RAG 컨텍스트 조립 (최대 28K 토큰)
        │  ├ 작품 메타 (plan)
        │  ├ 캐릭터 프로필 (character + character_custom_field + character_tag)
        │  ├ 세계관 노트 (world_note, 벡터 유사도 상위 10)
        │  ├ 복선 (foreshadow)
        │  ├ 최근 승인 요약 3건 (episode_summary WHERE is_approved)
        │  ├ 관련 과거 요약 (벡터 유사도 상위 5)
        │  ├ 최근 회차 청크 (episode_chunk, ORDER BY created_at DESC LIMIT N)
        │  ├ 작가 스토리라인 (사용자 입력)
        │  ├ 시리즈 편집 가이드 (템플릿)
        │  └ 시스템 프롬프트
        ↓
        → Claude Sonnet 4.5 astream() (temperature=0.8)
        ↓ SSE
Spring  → 스트림 릴레이 + 완료 시 토큰 차감 + draft DB 저장
        ↓ SSE
Frontend (2초 내 첫 청크 수신 목표)
```

**완료 기준**: SSE 첫 청크 2초 이내, 중단 시 "이어 쓰기" 지원.

### 4.3 ③ 검수 (동기 JSON)

```
[작가 클릭] → Spring POST /api/reviews → FastAPI POST /v1/reviews
              ↓
FastAPI → 6컴포넌트 조립 (~8K 토큰)
        │  ├ 작품 메타
        │  ├ 관련 캐릭터·설정 (벡터 유사도)
        │  ├ 최근 승인 요약
        │  ├ 복선 현황
        │  ├ 회차 본문 (검수 대상)
        │  └ 검수 프롬프트
        ↓
        → Claude Sonnet 4.5 (JSON mode) → Pydantic 검증
        ↓
Spring  → 응답 반환 + 토큰 차감(500) + ai_analysis 적재
```

**응답 스키마**:
```json
{
  "issues": [
    {"type": "setting_conflict|narration_conflict|tone_conflict",
     "severity": "high|medium|low",
     "description": "...", "location": "...", "suggestion": "..."}
  ],
  "newItems": [{"type": "character|term", "name": "...", "description": "..."}]
}
```

### 4.4 ④ 프로필 자동 생성 (원고 임포트)

```
[작가 임포트] → Spring POST /api/works/{id}/import {content}
               ↓
Spring  → extractPlainText
        → FastAPI POST /v1/extractions (비동기)
               ↓
FastAPI → Celery 태스크 등록
           1단계: 집계 (엔티티 후보 추출)
                  - Haiku 호출 1회 → 캐릭터/지명/용어 후보 리스트
           2단계: 엔티티별 상세화 (병렬, 상한 N=20)
                  - 각 후보에 대해 Haiku 호출 → 프로필 JSON 생성
           저장: extraction_suggestion(status='pending', is_auto_generated=true,
                                         source_episodes=[episode_ids])
               ↓
[작가 승인 UI] → status='approved' → character/world_note 테이블로 이관
                 (이관 주체: Spring)
```

**비용 제어**: 2단계 LLM 호출 N+1 폭발 방지 — 회차당 최대 20개 엔티티, 초과분은 다음 임포트로 이월.

---

## 5. 데이터 모델 변경

### 5.1 신규 서버 전용 테이블

```sql
-- 회차 청크 (RAG 검색용)
CREATE TABLE episode_chunk (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id   UUID NOT NULL REFERENCES episode(id) ON DELETE CASCADE,
    chunk_index  INTEGER NOT NULL,
    content      TEXT NOT NULL,
    embedding    VECTOR(1536) NOT NULL,
    tokens       INTEGER NOT NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (episode_id, chunk_index)
);
CREATE INDEX CONCURRENTLY idx_episode_chunk_embedding
  ON episode_chunk USING ivfflat (embedding vector_cosine_ops);

-- 회차 요약
CREATE TABLE episode_summary (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id    UUID NOT NULL UNIQUE REFERENCES episode(id) ON DELETE CASCADE,
    summary       TEXT NOT NULL,
    characters    JSONB,
    new_terms     JSONB,
    foreshadowing JSONB,
    is_approved   BOOLEAN NOT NULL DEFAULT false,
    raw_result    TEXT,
    created_at    TIMESTAMP NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP NOT NULL DEFAULT now()
);

-- 캐릭터/세계관 1:1 임베딩 서브테이블 (본 테이블은 동기화 유지)
CREATE TABLE character_embedding (
    character_id UUID PRIMARY KEY REFERENCES character(id) ON DELETE CASCADE,
    embedding    VECTOR(1536) NOT NULL,
    updated_at   TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX CONCURRENTLY idx_character_embedding
  ON character_embedding USING ivfflat (embedding vector_cosine_ops);

CREATE TABLE world_note_embedding (
    world_note_id UUID PRIMARY KEY REFERENCES world_note(id) ON DELETE CASCADE,
    embedding     VECTOR(1536) NOT NULL,
    updated_at    TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX CONCURRENTLY idx_world_note_embedding
  ON world_note_embedding USING ivfflat (embedding vector_cosine_ops);

-- 자동 추출 제안 큐
CREATE TABLE extraction_suggestion (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id           UUID NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    writer_id         UUID NOT NULL REFERENCES writer(id) ON DELETE CASCADE,
    entity_type       VARCHAR(20) NOT NULL,  -- 'character' | 'world_note' | 'term'
    suggested_name    VARCHAR(200) NOT NULL,
    suggested_payload JSONB NOT NULL,
    source_episodes   UUID[],
    status            VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending/approved/rejected
    is_auto_generated BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMP NOT NULL DEFAULT now(),
    decided_at        TIMESTAMP
);
CREATE INDEX idx_extraction_suggestion_work_status
  ON extraction_suggestion(work_id, status);
```

### 5.2 `character` / `world_note` 본 테이블 변경 없음

임베딩은 **별도 1:1 서브테이블**로 분리. 이유:
- 본 테이블은 PowerSync 동기화 대상 → VECTOR 컬럼 넣으면 클라로 복제됨
- 서브테이블은 publication에서 제외 → 용량·복제 부담 없음

---

## 6. PowerSync 호환성

### 6.1 원칙

> **"벡터 테이블은 publication에 없다"**

### 6.2 Publication 명세

```sql
CREATE PUBLICATION powersync FOR TABLE
  -- 기존 동기화 테이블
  work, plan, world_note, character, character_custom_field, character_tag,
  plot, episode, plot_episode_link, foreshadow, foreshadow_link, idea_archive;
  -- 신규 서버 전용은 의도적으로 제외:
  --   episode_chunk, episode_summary,
  --   character_embedding, world_note_embedding,
  --   extraction_suggestion
```

### 6.3 PoC 체크리스트 (Phase 0 종료 기준)

- [ ] dev Postgres에 `CREATE EXTENSION vector;` 성공
- [ ] publication 제외 설정 후 PowerSync 서비스 정상 기동
- [ ] `episode_chunk` insert 시 PowerSync 로그에 언급 없음
- [ ] 클라이언트 SQLite에 `episode_chunk` 없음 확인
- [ ] 관리형 PowerSync 사용 시 pgvector extension 허용 확인

---

## 7. API 설계 요약

### 7.1 Spring Boot (공개 API)

| Method | Path | 설명 |
|--------|------|------|
| PATCH | `/api/episodes/{id}` | 회차 저장 (청킹 파이프라인 트리거) |
| POST | `/api/drafts` | 초안 생성 (SSE) |
| POST | `/api/reviews` | 검수 요청 |
| POST | `/api/works/{id}/import` | 원고 임포트 (프로필 자동 생성) |
| GET | `/api/works/{id}/extractions` | 추출 제안 목록 |
| PATCH | `/api/extractions/{id}` | 제안 승인/거부 |
| GET | `/api/episodes/{id}/summary` | 요약 조회 |
| PATCH | `/api/episodes/{id}/summary` | 요약 수정/승인 |

### 7.2 FastAPI (내부 API, `X-Internal-Api-Key` 필수)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/v1/pipelines/episode` | 인덱싱 체인 등록 (202) |
| GET | `/v1/pipelines/tasks/{task_id}` | 태스크 상태 |
| POST | `/v1/drafts` | 초안 스트리밍 |
| POST | `/v1/reviews` | 검수 (JSON) |
| POST | `/v1/extractions` | 프로필 자동 생성 등록 |
| GET | `/health` | 헬스 체크 |

---

## 8. 비기능 요구사항

| 항목 | 목표 |
|------|------|
| 인덱싱 지연 | 회차 저장 → `episode_chunk` 30초 내 / `episode_summary` 4분 내 |
| 초안 첫 청크 지연 | ≤ 2초 |
| 검수 응답 시간 | ≤ 10초 (p95) |
| Celery 태스크 재시도 | `max_retries=3, retry_backoff=True, retry_backoff_max=60, retry_jitter=True` |
| LLM JSON 파싱 실패 | 원문 보존 + 보정 재요청 1회 |
| 외부 API 5xx | 서킷브레이커 60초 오픈 |
| 관측 | Prometheus(태스크 성공률·P95·토큰) + Loki(structlog) |
| 비용 관리 | dev는 Haiku 고정, `ai_analysis.tokens_used` 기반 회차당 평균 비용 집계 |

---

## 9. 구현 로드맵

> 상세 체크리스트는 [ai/TODO.md](../ai/TODO.md), 일정표는 [ai-pipeline.md](ai-pipeline.md) 참조.

| Phase | 기간 | 결과물 |
|-------|------|--------|
| 0 | 사전 | 합의(4기능 범위, pgvector × PowerSync PoC, 임베딩 모델 확정) |
| 1 | Day 2 | FastAPI + Celery + Redis 배선 (ping 수준 MVP) |
| 2 | Day 3 (04/16) | ① 청킹 + 임베딩 + `episode_chunk` |
| 3 | Day 4 (04/17) | ① 자동 요약 (`episode_summary`) |
| 4 | Day 5 (04/18) | RAG 컨텍스트 조립 엔진 |
| 5 | Day 6 (04/19) | ② 초안 생성 (SSE) |
| 6 | Day 7 (04/20) | ③ 검수 API |
| 7 | Day 8 (04/21) | ④ 프로필 자동 생성 + (옵션) 맞춤법 훅 |
| 8 | Day 9 (04/22) | 안정화(서킷브레이커·DLQ·Grafana) |

---

## 10. 오픈 이슈 / 합의 대상

- [ ] **범위 확정**: 4기능 풀스펙(본 문서) vs 3기능 MVP([AI_architecture.md](AI_architecture.md)) 중 공식 목표
- [ ] **초안 길이**: "3~5줄" MVP → "5,000자" 풀스펙 전환 시점
- [ ] **임베딩 모델**: OpenAI `text-embedding-3-small`(1536d) vs `voyage-3`
- [ ] **pgvector × PowerSync PoC**: §6.3 체크리스트 완수
- [ ] **`extractPlainText` 위치**: Spring(권장, 무상태 원칙) vs FastAPI
- [ ] **프로필 자동 생성 상한**: 회차당 엔티티 N=20 적절성
- [ ] **맞춤법 검사**: 본 아키텍처 포함 여부 / Phase 2 분리
- [ ] **관리형 PowerSync**: pgvector extension 허용 벤더 확인

---

## 11. [AI_architecture.md](AI_architecture.md)(v1)과의 차이

| 항목 | v1 (3기능 MVP) | v2 (본 문서) |
|------|---------------|---------------|
| 기능 수 | 3 (검수·텍스트생성·추출) | 4 (+ 인덱싱) |
| 비동기 | 없음 (전부 동기) | Celery + Redis |
| RAG | 없음 | pgvector 기반 풀 RAG |
| 초안 길이 | 3~5줄 | SSE 스트리밍 / 5,000자 확장 가능 |
| 요약 | 없음 | Claude Haiku 자동 요약 |
| DB 추가 | `extraction_suggestion`만 | +4 테이블 (청크·요약·2×임베딩) |
| PowerSync 영향 | 없음 | publication 명세 필요 |

v1은 **빠른 검증용 MVP**, v2는 **연재 소설을 실제로 써낼 수 있는 풀스펙**. 프로젝트 일정상 v2를 공식 목표로 권장.
