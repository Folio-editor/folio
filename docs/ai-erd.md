# AI ERD (RAG + MCP 하이브리드)

> 본 문서는 Folio AI 기능이 사용하는 **서버 전용 테이블**과, 기존 동기화 테이블(`episode`, `character`, `world_note` 등)을 **RAG / MCP 중 어떤 방식으로 활용하는지** 정리한다.
>
> 관련 문서: [architecture.md](architecture.md), [AI_architecture2.md](AI_architecture2.md), [ai-data-pipeline.md](ai-data-pipeline.md), [ai-overview.md](ai-overview.md), [infra.md](infra.md), [ai-agent-transition-draft-v2.md](ai-agent-transition-draft-v2.md)
>
> ⚠ **2026-05 갱신**:
> - `plan` 테이블 폐기됨 → `get_plan` MCP 도구 함께 제거됨
> - **KMS 모델 채택 결정** — Plan C 옵션 1 → KMS envelope encryption 으로 전환
>   - 서버 측 KMS 권한자가 AI 처리 시점 한정 복호화 가능
>   - MCP 도구가 서버 직접 SELECT + KMS 복호화 패턴으로 전환 가능 (현재 v1 암호문 그대로 LLM 전달하는 깨진 상태 정정 예정)
>   - 자동 인덱싱 트리거 복원 (PowerSync sync 시점에 서버 자동 처리)
> - 결정론 후처리 (`repetition_detector`·`structural_validators`·`timeline_extractor`) 통째 폐기
> - `EpisodeIndexDebouncer.java` 폐기 → KMS 통합 작업에서 신규 작성 예정

---

## 1. 설계 원칙

### 1.1 두 가지 접근의 분할

```
┌──────────────────────────────────────────────────────────┐
│  RAG (사전 처리)                                         │
│  회차 저장 시 청킹·임베딩·요약을 미리 만들어 둔다.        │
│  LLM 호출 시점엔 벡터 검색으로 필요 부분만 꺼낸다.        │
│  → 양이 많고 반복 조회되는 데이터에 적합                 │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  MCP (실시간 툴 호출)                                    │
│  LLM이 스스로 "이 인물/세계관이 필요하다" 판단 후        │
│  툴 함수(get_character, list_world_notes 등)를 호출.     │
│  → 양이 적고 선택적으로만 필요한 데이터에 적합           │
└──────────────────────────────────────────────────────────┘
```

### 1.2 왜 하이브리드인가

| 요구 | RAG 단독 | MCP 단독 | 하이브리드 |
|------|:-------:|:-------:|:---------:|
| 회차 본문 수십~수백 개 검색 | ✅ | ❌ (매번 전수 스캔) | ✅ |
| 인물 2~3명만 선택 조회 | ❌ (모두 주입) | ✅ | ✅ |
| SSE 첫 토큰 2초 내 | ✅ | ❌ (툴 왕복 지연) | ✅ (핵심 재료는 사전 조립) |
| 토큰 비용 예측 | ✅ 고정 | ❌ 변동 | ✅ (상한 합의 가능) |

Folio는 Episode(대용량·반복)는 RAG, Character/WorldNote/Plan/Plot(소용량·선택)은 MCP로 분할.

---

## 2. AI 전용 테이블 (PostgreSQL only, PowerSync 제외)

네 개 모두 **작가 로컬 SQLite로 동기화되지 않는 서버 전용** 테이블이다.

### 2.1 `episode_chunk` — 본문 벡터 검색용

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| episode_id | UUID | FK → episode(id) ON DELETE CASCADE |
| work_id | UUID | FK → work(id) (데이터 격리용 비정규화) |
| writer_id | UUID | FK → writer(id) (동일) |
| chunk_index | INTEGER | 회차 내 순서 (0, 1, 2…) |
| content | TEXT | 조각 원문 (500~1,000 토큰) |
| embedding | VECTOR(1536) | pgvector (`text-embedding-3-small`) |
| token_count | INTEGER | 토큰 수 |
| created_at | TIMESTAMP | 기본 now() |

- **제약**: `UNIQUE (episode_id, chunk_index)` — 재저장 시 UPSERT용
- **인덱스**: `ivfflat (embedding vector_cosine_ops)`, `(work_id)`, `(writer_id)`
- **용도**: 초안 생성·검수 시 "스토리라인과 의미 유사한 과거 장면 k개" 벡터 검색

### 2.2 `episode_summary` — 회차 요약

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| episode_id | UUID | FK → episode(id), UNIQUE (회차당 1개) |
| work_id | UUID | FK → work(id) |
| writer_id | UUID | FK → writer(id) |
| summary | TEXT | 3~5문장 요약 |
| is_confirmed | BOOLEAN | 작가가 요약을 확인/수정했는지 |
| model_used | VARCHAR(50) | 사용 모델(예: `claude-haiku-4-5-20251001`) |
| raw_result | TEXT | LLM 원문 JSON(파싱 실패 시 복구용) |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

- **인덱스**: `(work_id, is_confirmed)` — "승인된 요약만" 빠르게 조회
- **용도**: 초안 생성의 RAG 컨텍스트 중 "과거 승인 요약" 소스

### 2.3 `extraction_suggestion` — 설정집 자동 추출 후보

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| work_id | UUID | FK → work(id) |
| writer_id | UUID | FK → writer(id) |
| episode_id | UUID | FK → episode(id), 최초 발견 회차 |
| entity_type | VARCHAR(30) | `character` / `world_note` / `term` |
| suggested_name | VARCHAR(200) | 후보 이름 |
| payload | JSONB | 상세(설명, role, 근거 등) |
| status | VARCHAR(20) | `pending` / `confirmed` / `rejected` |
| confirmed_target_id | UUID | 승인 시 생성된 character/world_note 등의 id |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

- **제약**: `UNIQUE (work_id, entity_type, suggested_name)` — 여러 회차에 걸친 중복 후보 차단
- **인덱스**: `(work_id, status)` — 검토 UI 메인 쿼리
- **용도**: `extract_items` 태스크 출력. 작가가 승인/거부 처리

### 2.4 `ai_job` — 작업 진행 상태 추적

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| writer_id | UUID | FK → writer(id) |
| work_id | UUID | FK → work(id) |
| episode_id | UUID | FK → episode(id), nullable |
| job_type | VARCHAR(30) | `indexing` / `summary` / `review` / `generation` |
| status | VARCHAR(20) | `pending` / `running` / `done` / `failed` |
| error_message | TEXT | 실패 원인 |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

- **인덱스**: `(work_id)`, `(episode_id)`, `(writer_id)`, 부분 인덱스 `(status) WHERE status IN ('pending','running')`
- **용도**: 임포트 프로그레스 바, 결제 감사, 재시도 UI

### 2.5 동기화/비동기화 요약

| 테이블 | PowerSync | 이유 |
|--------|:--------:|------|
| `episode_chunk` | ❌ 제외 | 벡터(1536 float) 용량, 서버에서만 사용 |
| `episode_summary` | ❌ 제외 | AI 파생 메타데이터, 작가 기기 불필요 |
| `extraction_suggestion` | ❌ 제외 | 승인 워크플로는 서버 API로 처리 |
| `ai_job` | ❌ 제외 | 서버 내부 상태 |

---

## 3. AI 인풋 테이블 (RAG vs MCP 분할)

기존 ERD 테이블들이 AI 파이프라인에서 어떻게 쓰이는지 정리.

| 테이블 | 방식 | 이유 | 주요 접근법 |
|--------|:----:|------|------------|
| **episode** (+ `episode_chunk`) | **RAG** | 수백 화 × 수천 토큰, 반복 조회, 의미 검색 필요 | `chunk_and_embed` 사전 처리 → 벡터 검색 |
| **character** (+ `character_custom_field`) | **MCP** | 수십 명, 이름 기반 선택 조회 | `get_character(name)` / `list_characters()` 툴 |
| **world_note** | **MCP** | 수십~수백 개, 태그 기반 선택 조회 | `list_world_notes(tags)` / `get_world_note(name)` 툴 |
| ~~**plan**~~ | — | **ERD 정리 2단계로 테이블 폐기.** 자유 기획 문서는 `plan_note` 단독 관리. 장르·분위기는 `work` 메타 참조 | `get_plan()` 툴 폐기됨 |
| **plot** | **MCP** | 작품당 1개, 항상 통째로 주입 | `get_plot()` 툴 |
| **character_custom_field** | **MCP** (부속) | `get_character` 호출 시 함께 반환 | 독립 툴 없음 |
| **foreshadow** | **MVP 제외** | 추후 재설계 | — |
| **foreshadow_link** | **MVP 제외** | 추후 재설계 | — |

> **주의**: 위 MCP 대상 테이블들(`character`, `world_note`, `plot`, `character_custom_field`)은 **PowerSync 동기화 대상**이다. MCP 툴은 이 테이블들을 **읽기만** 하며, 벡터 컬럼을 추가하지 않는다. 벡터 기반 의미 검색이 필요해지면 별도 `*_embedding` 테이블을 신설한다(Phase 2 예정). (구) plan 은 폐기됨.

---

## 4. 기능별 데이터 접근 흐름

### 4.1 기능 ① 회차 인덱싱 (+ 설정집 자동 추출)

```
회차 저장(자동 5초 → 디바운스 5초)
  │
  ▼ Celery chord
  ┌─────────────────────────────┐   ┌─────────────────────────────┐
  │ chunk_and_embed             │   │ generate_summary            │
  │ - episode.content 추출      │   │ - episode.content 추출      │
  │ - 500~1,000 토큰 청킹       │   │ - Claude Haiku              │
  │ - 배치 임베딩               │   │ - JSON(summary)             │
  │ → episode_chunk UPSERT      │   │ → episode_summary UPSERT    │
  └─────────────────────────────┘   └─────────────┬───────────────┘
                                                  │
                                                  ▼
                                    ┌─────────────────────────────┐
                                    │ extract_items               │
                                    │ - raw_result JSON 파싱      │
                                    │ - 인물·용어·복선 후보 뽑기  │
                                    │ → extraction_suggestion     │
                                    │   INSERT × N (pending)      │
                                    └─────────────────────────────┘
  │
  ▼ chord 종료 시 ai_job.status='done'
```

사용 테이블: `episode`(읽기) → `episode_chunk`/`episode_summary`/`extraction_suggestion`(쓰기), `ai_job`(상태)

### 4.2 기능 ② 초안 생성 (RAG + MCP)

```
POST /v1/drafts
  │
  ▼
  1. 토큰 잔액 확인 (token_wallet)
  2. 사전 RAG 조립 (코드)
     - work 메타(장르·분위기)  ← work 직접 SELECT (plan 테이블 폐기됨)
     - plot 원문               ← MCP: get_plot()
     - 최근 3화 요약           ← episode_summary WHERE is_confirmed
     - 스토리라인 벡터 검색     ← episode_chunk ORDER BY embedding<=>$
  3. Claude Sonnet + tool_use 루프 (최대 3회)
     - LLM이 필요시 호출:
       · list_characters()
       · get_character(name)
       · list_world_notes(tags)
       · get_world_note(name)
  4. 최종 스트리밍 (SSE)
  5. token_transaction INSERT (-1500) (ai_prompt_template.token_cost 기반, Phase 2)
```

사용 테이블: `work`/`plot`/`character`/`character_custom_field`/`world_note` (MCP·직접 읽기), `episode_summary`/`episode_chunk` (RAG 읽기), `token_wallet`/`token_transaction` (쓰기). plan 테이블은 폐기됨

### 4.3 기능 ③ 검수 (전수 대조 + MCP 필터링)

```
POST /v1/reviews
  │
  ▼
  1. 토큰 잔액 확인
  2. 이번 원고에서 언급된 고유명사 추출 (Haiku 1회, 저비용)
     → {characters: [...], world: [...]}
  3. 대조 컨텍스트 조립
     - 언급 인물 풀 프로필        ← MCP: get_character(name) × 언급수
     - 그 외 인물 간략 목록       ← MCP: list_characters()
     - 언급 세계관 전문           ← MCP: get_world_note(name) × 언급수
     - 그 외 세계관 제목 목록     ← MCP: list_world_notes_titles()
     - 최근 3~5회 요약            ← episode_summary
     - 고유명사 whitelist(맞춤법) ← character.name + world_note.name
  4. Claude Sonnet (JSON 출력)
     issue.type: setting_conflict / tone_conflict / narration_conflict / spelling
  5. ai_analysis INSERT, token_transaction INSERT (-500)
```

사용 테이블: `character`/`world_note`/`work`/`plot` (MCP·직접 읽기), `episode_summary` (RAG 읽기), `ai_analysis` (쓰기). plan 테이블은 폐기됨

---

## 5. MCP 툴 카탈로그 (초기안)

| 툴 | 시그니처 | 용도 |
|----|---------|------|
| ~~`get_plan`~~ | — | **폐기** (plan 테이블 폐기). 장르·분위기는 work 메타에서 |
| `get_plot` | `() → Plot` | 전체 줄거리 |
| `list_characters` | `() → Character[]` | 이름+역할만, 간략 목록 |
| `get_character` | `(name: str) → Character + CustomFields` | 특정 인물 풀 프로필 |
| `list_world_notes` | `(tags?: str[]) → WorldNote[]` | 세계관 노트 목록 |
| `get_world_note` | `(name: str) → WorldNote` | 특정 세계관 전문 |
| `search_episode_chunks` | `(query: str, k: int = 5) → Chunk[]` | Episode 벡터 검색 (RAG 툴) |

### 보안 원칙

모든 툴의 `work_id` / `writer_id`는 **서버 세션 컨텍스트에서 강제 주입**한다. LLM이 파라미터로 무엇을 생성하든 **무시한다**(프롬프트 인젝션 방지).

```python
async def get_character(name: str, *, ctx: WriterContext) -> dict:
    # ctx.work_id / ctx.writer_id는 서버가 고정
    return await db.fetchrow("""
        SELECT * FROM character
        WHERE work_id = $1 AND writer_id = $2 AND name = $3
    """, ctx.work_id, ctx.writer_id, name)
```

---

## 6. 추가 시점 (마이그레이션 스케줄)

| 시점 | 추가 | 사유 |
|------|------|------|
| **Day 3 착수 전 (지금)** | `episode_chunk`, `episode_summary` | 인덱싱 파이프라인 필수 |
| **Day 4 중반** | `extraction_suggestion` | `extract_items` 태스크 출력소 |
| **Day 8** | `ai_job` | 임포트 프로그레스 UI |
| Phase 2 | `character_embedding`, `world_note_embedding`, `ai_prompt_template` | 규모 확장·프롬프트 운영화 |

한 번의 마이그레이션으로 4개 모두 생성해도 된다(권장). 운영 로드는 동일.

---

## 7. 오픈 이슈

- [ ] `foreshadow` / `foreshadow_link` MVP 복원 여부 결정 — `ExtractionSuggestion.entity_type='foreshadow'` 승인 시 이관 대상 테이블 필요
- [ ] pgvector 확장 설치가 PowerSync publication 설정과 충돌 없는지 검증
- [ ] 임베딩 모델 최종 확정 (`text-embedding-3-small` vs. `voyage-3`)
- [ ] `ai_prompt_template` 도입 시점 — 과금(플랫폼 토큰) 일정과 맞춤
