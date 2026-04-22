# AI 데이터 파이프라인

> 회차 저장부터 AI 결과 저장까지 데이터가 어떤 경로로 흘러가는지 단계별로 설명합니다.
> 백엔드 담당은 큐/워커 구조를 설계할 때 이 문서를 기준으로 삼고,
> AI 담당은 "내 코드가 파이프라인의 어느 지점에서 호출되는지" 파악할 수 있어야 합니다.
>
> 관련 문서: [AI_architecture2.md](AI_architecture2.md)(아키텍처 개요), [ai-pipeline.md](ai-pipeline.md)(구현 일정), [ddl.sql](ddl.sql)(ERD)

---

## 0. 스택 전제

| 구분 | 기술 |
|------|------|
| API 게이트웨이 | Spring Boot (Java) — 토큰 과금·감사·PowerSync 송수신 |
| AI 서버 | FastAPI (Python 3.12) — 무상태, LLM 호출 |
| 작업 큐 | **Celery + Redis** (BullMQ 아님 — Python 스택 일치) |
| DB | PostgreSQL + pgvector |
| 동기화 | PowerSync (서버 전용 테이블은 publication 제외) |

> 큐 용어: BullMQ의 *Job* = Celery의 *Task*, *Flow* = *chain*, *Queue* = *task_routes*.
> 본 문서는 Celery 용어를 정식으로 쓰고, DB에 저장되는 작업 이력은 `ai_job` 테이블에 기록합니다.

---

## 1. 파이프라인은 두 종류

| 파이프라인 | 언제 | 입력 | 특징 |
|-----------|------|------|------|
| **일반 저장** | 작가가 에디터에서 회차 1개 저장 | 회차 1개 | 수 초 내 완료, 백그라운드 |
| **임포트** | 최초 1회 파일 업로드로 N화 일괄 투입 | 회차 N개 | 수십 분 소요, 프로그레스 바 표시 |

두 파이프라인은 **회차 1개 단위 작업이 동일**합니다. 차이는 "1개를 큐에 넣느냐, N개를 넣느냐"뿐. MVP에서는 임포트 전용 풀 프로필 자동 생성 단계를 두지 않고, 각 회차의 `extract_items`가 쌓아둔 얕은 추출(`extraction_suggestion`)을 작가 검토 UI에서 병합·보완한다.

---

## 2. 일반 저장 파이프라인

작가가 에디터에서 101화를 집필 중인 상황. 저장은 **수동 버튼이 아니라 5초 간격 자동 저장**이다.

```
작가가 타이핑 → 5초마다 자동 저장 이벤트 발생
    │  (작가는 저장 버튼 누르지 않음 — 에디터가 자동 발동)
    ▼
┌─────────────────────────────────────────┐
│  STEP 1. 원고 저장 (동기, 즉시)            │
│                                          │
│  PATCH /api/episodes/{id}                │
│  episode 테이블 UPSERT:                  │
│  - content: TipTap JSON                  │
│  - word_count: 글자수                    │
│  - status: "draft"                       │
│  - updated_at: now()                     │
│                                          │
│  → 작가에게 "저장됨" 토스트 (1초)          │
│                                          │
│  ※ 자동 저장 간격: 5초                     │
│    인덱싱 디바운스: 5초                    │
│    → 작가가 타이핑 계속하면                │
│      자동 저장은 매 5초마다 발생하지만      │
│      인덱싱은 타이핑 멈춘 뒤 5초 후         │
│      1번만 실행 (비용 절감)                │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  STEP 2. 작업 큐에 등록 (Spring, 동기)      │
│                                          │
│  ai_job INSERT:                          │
│  - job_type: "indexing"                  │
│  - status: "pending"                     │
│  - episode_id, work_id, writer_id        │
│                                          │
│  ※ 5초 디바운스 (확정 정책):                │
│    Spring이 episode_id별 타이머 보유.      │
│    저장 이벤트마다 타이머 리셋,             │
│    마지막 저장 후 5초 경과 시 FastAPI 호출. │
│    → 연속 타이핑·빠른 재저장으로 인한       │
│      중복 인덱싱·LLM 비용 낭비 방지.        │
│                                          │
│  FastAPI 호출 (디바운스 완료 후):           │
│  POST /v1/pipelines/episode              │
│  { episode_id, job_id }                  │
│  → FastAPI가 Celery chain 등록:          │
│    chain(chunk_and_embed.s(episode_id),  │
│          generate_summary.s(),           │
│          extract_items.s())              │
└────────────────────┬────────────────────┘
                     │  (비동기, 백그라운드)
                     ▼
┌─────────────────────────────────────────┐
│  STEP 3. Celery 워커가 task 수신          │
│                                          │
│  ai_job.status → "running"               │11
│  ai_job.updated_at → now()               │
└────────────────────┬────────────────────┘
                     │
                     ├───────────────────────────────┐
                     ▼                               ▼
┌──────────────────────────────┐  ┌──────────────────────────────┐
│  STEP 4-A. 청킹 + 임베딩       │  │  STEP 4-B. 요약 + 추출        │
│  (task: chunk_and_embed)      │  │  (task: generate_summary,     │
│                                │  │          extract_items)        │
│  1. episode.content →          │  │  1. episode.content →          │
│     extractPlainText()         │  │     extractPlainText()         │
│                                │  │                                │
│  2. 단락(\n\n) 분할 →           │  │  2. Claude Haiku 호출          │
│     500~1,000 토큰 재분할       │  │     (structured JSON output)   │
│     (tiktoken)                 │  │                                │
│                                │  │  3. JSON 파싱:                 │
│  3. 배치 임베딩 호출            │  │     - summary                  │
│     (text-embedding-3-small)   │  │     - characters_mentioned     │
│                                │  │     - new_terms                │
│  4. episode_chunk UPSERT       │  │     - new_places               │
│     (chunk_index UNIQUE)       │  │     - foreshadow_candidates    │
│     ※ 서버 전용, PowerSync 제외│  │                                │
│                                │  │  4. episode_summary UPSERT     │
│                                │  │     (is_approved=false,        │
│                                │  │      raw_result=원문)           │
│                                │  │                                │
│                                │  │  5. new_terms·new_places →     │
│                                │  │     extraction_suggestion      │
│                                │  │     INSERT (status='pending')  │
└──────────────────────────────┘  └──────────────────────────────┘
                     │                               │
                     └────────────┬──────────────────┘
                                  │ (chain 완료)
                                  ▼
┌─────────────────────────────────────────┐
│  STEP 5. 작업 완료 처리                   │
│                                          │
│  ai_job.status → "done"                  │
│  ai_job.updated_at → now()               │
│                                          │
│  (선택) notification INSERT:             │
│  "101화 AI 분석 완료"                     │
└─────────────────────────────────────────┘
```

### 타이밍

| 단계 | 소요 | 작가 체감 |
|------|------|----------|
| STEP 1 | < 1초 | "저장됨" |
| STEP 2 | < 1초 | 모름 |
| STEP 3 | 큐 대기 | 모름 |
| STEP 4-A | 2~5초 | 모름 |
| STEP 4-B | 3~8초 | 모름 |
| STEP 5 | < 1초 | 알림(옵션) |
| **전체** | **5~15초** | **거의 모름** |

---

## 3. 임포트 파이프라인

작가가 100화 `.txt` 파일을 업로드한 상황.

```
작가가 파일 업로드
    │
    ▼
┌─────────────────────────────────────────┐
│  STEP A. 파일 파싱 + 회차 분리 (동기)       │
│                                          │
│  Spring (또는 FastAPI 유틸):              │
│  1. 파일 읽기 (.txt, .docx, .md)          │
│  2. 회차 단위 자동 분리                    │
│     - "1화"/"제1장" 패턴 매칭              │
│     - 파일 여러 개면 파일명 = 회차 번호     │
│  3. 미리보기 반환 → 작가 확인              │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  STEP B. 회차 일괄 저장 (동기)              │
│                                          │
│  episode 테이블에 N행 INSERT:             │
│  - content: 플레인텍스트 →                 │
│             textToTiptapJson()으로 변환    │
│  - status: "completed"                   │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  STEP C. 인덱싱 작업 일괄 등록              │
│                                          │
│  ai_job 테이블에 N행 INSERT               │
│  (job_type='indexing', status='pending') │
│                                          │
│  FastAPI에 일괄 등록:                     │
│  POST /v1/pipelines/episodes/batch       │
│  → Celery group(chain, chain, ...)        │
│                                          │
│  작가에게 표시:                            │
│  "AI가 작품을 읽고 있어요. 약 30분 소요"    │
│  [프로그레스: 0/100]                      │
└────────────────────┬────────────────────┘
                     │  (비동기)
                     ▼
┌─────────────────────────────────────────┐
│  STEP D. 워커가 회차를 하나씩 처리           │
│                                          │
│  일반 저장의 STEP 3~5와 동일                │
│  워커 여러 개가 concurrency로 병렬 처리     │
│  (celery -c 3 → 3화씩 병렬)               │
│                                          │
│  매 회차 완료 시 ai_job.status → "done"    │
│  프로그레스 바 폴링 갱신                     │
│                                          │
│  ⚠️ 1개 실패해도 나머지 계속:                │
│  - ai_job.status → "failed"               │
│  - ai_job.error_message 기록              │
└────────────────────┬────────────────────┘
                     │  (N개 전부 완료)
                     ▼
┌─────────────────────────────────────────┐
│  STEP E. 인덱싱 완료                       │
│                                          │
│  상태 집계: done=98, failed=2             │
│  notification: "98화 완료, 2화 실패"        │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  STEP F. 전체 완료 → 작가 검토 UI           │
│                                          │
│  notification:                            │
│  "작품 분석이 끝났어요! 확인해주세요."       │
│                                          │
│  검토 화면 (extraction_suggestion 조회):    │
│  - 매 회차 extract_items가 쌓아둔         │
│    얕은 추출 항목 전체를 목록으로 표시      │
│    (인물 / 용어 / 복선 후보)               │
│  - [수정][승인][거부]                      │
│                                          │
│  승인 시 Spring 처리:                      │
│  - 승인 → character/world_note/foreshadow │
│           테이블로 이관 INSERT              │
│          (is_auto_generated=false)        │
│  - 수정 → payload 수정 후 이관             │
│  - 거부 → status='rejected'                │
│                                          │
│  ⚠️ MVP에서는 "임포트 전용 풀 프로필         │
│     자동 생성" 단계(구 STEP F/G)를 제외.   │
│     기능 ①의 extract_items가 이미 매      │
│     회차마다 얕은 추출을 수행하므로,        │
│     임포트도 동일 흐름을 N회 반복한 뒤      │
│     작가가 검토 UI에서 병합·보완한다.       │
└─────────────────────────────────────────┘
```

### 임포트 타이밍 전체

| 단계 | 소요 | 작가 체감 |
|------|------|----------|
| STEP A | 1~3분 | 미리보기 확인 |
| STEP B | 수 초 | "저장 완료" |
| STEP C | < 1초 | "AI가 읽기 시작" |
| STEP D | 20~40분 | 프로그레스 바 (다른 작업 가능) |
| STEP E | < 1초 | 알림 |
| STEP F | — | 검토 진입 |
| **전체** | **약 25~45분** | **대부분 대기 가능** |

---

## 4. Celery 큐 설계

### 4.1 큐 구조 (task_routes)

```python
# app/celery_app.py
task_routes = {
    "app.tasks.generate_draft":         {"queue": "draft"},         # 높음
    "app.tasks.run_review":              {"queue": "review"},        # 높음
    "app.tasks.chunk_and_embed":         {"queue": "indexing"},      # 보통
    "app.tasks.generate_summary":        {"queue": "indexing"},      # 보통
    "app.tasks.extract_items":           {"queue": "indexing"},      # 보통
}
```

### 4.2 우선순위 설계

| 큐 | 처리 내용 | 우선순위 | 이유 |
|----|----------|---------|------|
| `draft` | 초안 생성 SSE | **높음** | 작가가 결과 대기 |
| `review` | 검수 | **높음** | 작가가 결과 대기 |
| `indexing` | 청킹·임베딩·요약·얕은 추출 | 보통 | 백그라운드이지만 후속 기능 품질에 영향. 임포트도 동일 큐 사용 (회차 수만큼 반복) |

### 4.3 워커 구성

```bash
# MVP: 큐별 분리 워커 1~3개
celery -A app.celery_app worker -Q draft,review -c 2 -n hi-prio@%h
celery -A app.celery_app worker -Q indexing -c 3 -n indexing@%h
```

임포트 시 `indexing` 워커만 수평 확장(`-c 6`)하면 일시 부하를 흡수.

### 4.4 재시도 정책

```python
@app.task(
    bind=True,
    autoretry_for=(LLMTimeoutError, RateLimitError, HTTPError),
    max_retries=3,
    retry_backoff=True,         # 10s, 30s, 120s
    retry_backoff_max=120,
    retry_jitter=True,
)
def chunk_and_embed(self, episode_id): ...
```

3회 실패 시 `ai_job.status='failed'`, `error_message` 기록. 관리자/작가 재시도 버튼이 실패한 `ai_job`을 다시 큐에 등록.

---

## 5. ai_job 상태 흐름

```
pending → running → done
                  → failed → (재시도) → pending
```

### 5.1 상태

| 상태 | 의미 | 프론트 표시 |
|------|------|-----------|
| `pending` | 큐 대기 중 | "대기 중" |
| `running` | 워커 처리 중 | "처리 중" |
| `done` | 완료 | 완료 카운트 |
| `failed` | 실패 | "N개 실패 (재시도 가능)" |

### 5.2 프로그레스 쿼리

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'done')                       AS completed,
  COUNT(*) FILTER (WHERE status = 'failed')                     AS failed,
  COUNT(*) FILTER (WHERE status IN ('pending', 'running'))      AS remaining,
  COUNT(*)                                                       AS total
FROM ai_job
WHERE work_id = :work_id
  AND job_type = 'indexing'
  AND created_at > :import_started_at;
```

프론트: `[████████░░░░] 42/100 처리 중 (2개 실패)`

---

## 6. 초안 생성 / 검수 파이프라인

작가가 버튼을 누르고 결과를 기다리는 **체감 동기** 작업. Celery 고우선순위 큐 사용.

### 6.1 초안 생성 (SSE 스트리밍)

```
작가 "초안 생성" 클릭 + 스토리라인 입력
    │
    ▼
┌─────────────────────────────────────────┐
│  1. 토큰 잔액 확인 (Spring)                │
│     token_wallet.balance >= 1500?         │
│     부족 → "토큰 부족" 반환                │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  2. ai_job 생성(running) + 토큰 차감       │
│     token_transaction INSERT (amount=-1500)│
│     token_wallet.balance -= 1500          │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  3. Spring → FastAPI POST /v1/drafts      │
│     (SSE 프록시)                          │
│                                          │
│  FastAPI에서 RAG 컨텍스트 조립:             │
│  (AI_architecture2.md §4.2 참고)         │
│  - 작품 메타 / 캐릭터 / 세계관 /            │
│    복선 / 최근 승인 요약 /                 │
│    관련 과거 요약(벡터) /                  │
│    최근 회차 청크 / 스토리라인              │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  4. Claude Sonnet 4.5 astream()           │
│     temperature=0.8                       │
│     ⏱ 첫 청크 < 2초, 전체 30~90초          │
│     프론트: SSE 수신 + 실시간 표시          │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  5. 완료 처리                             │
│     ai_job.status → "done"                │
│     (초안 자체는 DB에 저장하지 않음 — 선택) │
└─────────────────────────────────────────┘
```

### 6.2 검수 (동기 JSON)

```
작가 "검수" 클릭
    │
    ▼
┌─────────────────────────────────────────┐
│  1. 토큰 잔액 확인 (>= 500)                │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  2. ai_job 생성 + 토큰 차감                │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  3. RAG 컨텍스트 조립 (6컴포넌트, ~8K)      │
│     AI_architecture2.md §4.3 참고         │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  4. Sonnet 4.5 (JSON mode) + Pydantic     │
│     ⏱ 10~30초                            │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  5. 응답 반환 + 저장                       │
│     ai_job.status → "done"                │
│     ai_analysis INSERT                     │
└─────────────────────────────────────────┘
```

---

## 7. 에러 시나리오

### 7.1 LLM 호출

| 상황 | 대응 | 토큰 |
|------|------|------|
| 타임아웃(60s 초과) | 자동 재시도 ×3 (backoff) | 3회 실패 시 **환불** |
| Rate limit | 30s 대기 후 재시도 | 환불 안 함 |
| 5xx | 자동 재시도 ×3 | 3회 실패 시 환불 |
| JSON 파싱 실패 | 보정 재요청 ×1 (프롬프트 강조) | 재실패 시 환불 |
| 컨텍스트 초과 | 재료 축소(최근 1화만) 재시도 | 환불 안 함 |

### 7.2 임베딩 API

| 상황 | 대응 |
|------|------|
| 타임아웃 | 자동 재시도 ×3 |
| Rate limit | 100ms 대기 후 재시도 |
| 전체 실패 | 해당 청크 skip, 나머지 계속, `ai_job.error_message`에 경고 |

### 7.3 인덱싱 일부 실패

- 100화 중 2화 실패 → 나머지 98화 정상
- `ai_job.status='failed'`
- 검토 UI는 성공한 98화의 `extraction_suggestion` 기준으로 표시
- 작가 "재시도" 버튼 → 실패한 `ai_job`만 재큐잉

### 7.4 토큰 환불

```
초안 생성 1,500 토큰 차감 후 3회 실패:
  token_transaction INSERT (type='refund', amount=+1500,
                             reason='LLM 3회 실패')
  token_wallet.balance += 1500
  notification: "생성 실패, 토큰 환불됨"
```

---

## 8. 동시성 주의

### 8.1 같은 회차 연속 저장

```
작가가 101화를 1초 안에 두 번 저장 → 인덱싱 중복 등록 위험

대응 (Spring) — **5초 디바운스 확정**:
  - Spring에서 episode_id별 디바운스 타이머 관리 (in-memory Map 또는 Redis)
  - 저장 이벤트마다 타이머 리셋
  - 마지막 저장 후 5초 경과 시에만 FastAPI `/v1/pipelines/episode` 호출
  - 이미 running 중인 ai_job이 있으면 status='cancelled' 후 새로 등록
    (Celery task는 revoke 신호 또는 작업 시작 시 cancelled 플래그 확인)
```

### 8.2 인덱싱 중 초안 요청

```
100화 인덱싱 진행 중(50/100)에 작가가 51화 초안 요청:
  - 벡터 검색 대상이 50화로 제한됨
  - 가능하지만 품질 저하 → 안내:
    "인덱싱 진행 중이라 참조 범위가 제한될 수 있습니다"
```

### 8.3 얕은 추출 중 작가 수정

```
extraction_suggestion status='pending'을 작가가 수정·승인하는 동안
다른 회차의 extract_items task가 동일 엔티티에 대해 INSERT 시도:

대응:
  - extraction_suggestion UNIQUE(work_id, entity_type, suggested_name)
  - 충돌 시 skip
  - 이미 status='approved'이면 건너뛰기
```

---

## 9. ERD 변경 / 신규 테이블

> 기존 [ddl.sql](ddl.sql)에는 아래 테이블이 없습니다. 본 파이프라인 구현 전 추가 필요.

### 9.1 신규 — 서버 전용 (PowerSync publication 제외)

```sql
-- 작업 이력
CREATE TABLE ai_job (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type       VARCHAR(40) NOT NULL,   -- indexing|draft|review
    status         VARCHAR(20) NOT NULL,   -- pending|running|done|failed|cancelled
    writer_id      UUID REFERENCES writer(id) ON DELETE SET NULL,
    work_id        UUID REFERENCES work(id) ON DELETE CASCADE,
    episode_id     UUID REFERENCES episode(id) ON DELETE CASCADE,
    celery_task_id VARCHAR(100),
    error_message  TEXT,
    payload        JSONB,
    created_at     TIMESTAMP NOT NULL DEFAULT now(),
    updated_at     TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_job_work_type_status ON ai_job(work_id, job_type, status);
CREATE INDEX idx_ai_job_episode          ON ai_job(episode_id);

-- 회차 청크 (RAG 검색)
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
    characters    JSONB,  -- {existing:[], new:[]}
    new_terms     JSONB,
    new_places    JSONB,
    foreshadowing JSONB,
    is_approved   BOOLEAN NOT NULL DEFAULT false,
    raw_result    TEXT,
    created_at    TIMESTAMP NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP NOT NULL DEFAULT now()
);

-- 캐릭터/세계관 1:1 임베딩 서브테이블
-- (본 테이블은 PowerSync 동기화 유지하고, 벡터만 서버 전용으로 분리)
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
    entity_type       VARCHAR(20) NOT NULL,   -- character|world_note|term|foreshadow
    suggested_name    VARCHAR(200) NOT NULL,
    suggested_payload JSONB NOT NULL,
    source_episodes   UUID[],
    status            VARCHAR(20) NOT NULL DEFAULT 'pending',
    is_auto_generated BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMP NOT NULL DEFAULT now(),
    decided_at        TIMESTAMP,
    UNIQUE (work_id, entity_type, suggested_name)
);
CREATE INDEX idx_extraction_suggestion_work_status
  ON extraction_suggestion(work_id, status);
```

### 9.2 기존 테이블 컬럼 추가 (ERD 반영 필요)

원본 파이프라인이 전제하는 `is_auto_generated` 플래그가 현재 ERD에 없습니다. 승인 후 이관된 항목과 작가 수기 생성 항목 구분용.

```sql
ALTER TABLE character  ADD COLUMN is_auto_generated BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE world_note ADD COLUMN is_auto_generated BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE foreshadow ADD COLUMN is_auto_generated BOOLEAN NOT NULL DEFAULT false;
```

### 9.3 PowerSync Publication

```sql
-- 신규 테이블은 의도적으로 제외
CREATE PUBLICATION powersync FOR TABLE
  work, plan, world_note, character, character_custom_field, character_tag,
  plot, episode, plot_episode_link, foreshadow, foreshadow_link, idea_archive;
-- 제외: ai_job, episode_chunk, episode_summary,
--       character_embedding, world_note_embedding, extraction_suggestion
```

---

## 10. 백엔드 구현 체크리스트

| # | 항목 | 담당 | 의존성 |
|---|------|------|--------|
| 1 | `extractPlainText()` — TipTap JSON → 플레인 텍스트 | Spring | — |
| 2 | `textToTiptapJson()` — 역변환 | Spring | — |
| 3 | Celery + Redis 셋업 (docker, worker) | AI | — |
| 4 | `ai_job` CRUD API | Spring | — |
| 5 | 인덱싱 워커 (chain: chunk_and_embed → summary → extract_items) | AI | 1, 3, 4 |
| 6 | 프로그레스 조회 API | Spring | 4 |
| 7 | 임포트 파서 (파일 → 회차 분리 → episode INSERT) | Spring | 1, 2 |
| 8 | RAG 컨텍스트 조립 함수들 | AI | 1 |
| 9 | 토큰 차감/환불 로직 | Spring | — |
| 10 | 초안 생성 SSE (Spring 프록시 + FastAPI 스트림) | Spring+AI | 8, 9 |
| 11 | 검수 API | Spring+AI | 8, 9 |
| 12 | 알림 발송 (`notification` INSERT) | Spring | 4 |
| 13 | `extraction_suggestion` 승인/거부 API + 이관 로직 | Spring | 5 |

### 구현 순서

```
Phase 1 기반:     1 → 2 → 3 → 4 → 9
Phase 2 인덱싱:   5 → 6 → 12 → 13
Phase 3 생성/검수: 8 → 10 → 11
Phase 4 임포트:   7 (기존 5 흐름을 N회 반복)
```

---

## 11. 오픈 이슈

- [ ] `is_auto_generated` 컬럼을 `character`/`world_note`/`foreshadow`에 ERD 반영
- [ ] 용어(`term`) 관리 위치 — `dictionary` 테이블 폐기됨. `world_note`로 흡수 (용어도 세계관 노트의 일종으로 취급) 권장
- [ ] `extraction_suggestion.entity_type='foreshadow'` → `foreshadow_link`로의 이관 규칙
- [ ] 임포트 시 PowerSync 초기 대량 복제 부하 — rate limit 필요 여부
- [ ] 초안 "이어 쓰기"(중단 지점 재호출) 저장 전략 — DB 저장 vs Redis 휘발
