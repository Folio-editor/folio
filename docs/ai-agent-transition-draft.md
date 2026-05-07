# Folio AI 서버 — Agent 기반 서비스 전환 초안 (임시 저장)

> **상태**: 사용자 검토 보류. 본 문서는 ERD 정리 작업과 별개로 후속 검토를 위해 보존된 초안.
> **작성일**: 2026-05-04 대화 기준
> **다음 단계**: ERD 정리 작업 완료 후 본 문서를 기반으로 에이전트 전환 계획 재검토.

## Context

사용자와의 다회 토의를 거쳐 Folio AI 서버 로직을 **현재의 RAG 단발 호출 모델 → Claude Code/Codex급 도구 기반 에이전트 모델**로 전환하기로 방향 합의.

### 결론에 도달한 사용자 통찰 누적
1. 현재 `assemble_context()`는 "RAG"보다 "Context Assembler" 표현이 정확. Vector retrieval 비중 작음.
2. 인물·세계관·복선·플롯에 vector 검색 무용 (정적 카드는 페이로드 박기 충분).
3. Vector 청크는 시간 순서·인과관계·상태 전이를 표현 못함 → 검수 false positive 양산.
4. 작가가 카드에 명시 안 한 디테일은 검수 대상 아님 (작가 자유도 존중).
5. **자동 RAG 박기 폐기**, vector는 MCP 도구로만 격하 (`semantic_search_episodes`).
6. 500화급 흐름은 hierarchical summary 박기가 아니라 **스캔 도구로 LLM이 필요시 탐색**.
7. 사용자 목표는 **Claude Code/Codex급 도구 기반 에이전트**.
8. **결정론 후처리·결정론 MCP 도구는 전면 폐기.** LLM이 도메인 패턴 매칭을 직접 판단. 결정론 함수는 AI 사고 제한 + 확장성 부재 + false positive 권위화 → 불순물.
9. 자동 회차 요약은 사업자 부담, 본문 변화량 가드(content_hash + diff %)로 폭주 방지.
10. 세션 히스토리는 prompt caching + 윈도잉 + 요약 압축으로 비용 통제.
11. 토큰 차감은 단발 모델과 충돌 → 견적 + hold + 사후 정산 모델.

### 산출물
- 신규 에이전트 라우터 (`/v1/agent/*`) + Spring 프록시 (`/api/v1/ai/agent/*`) + Frontend 챗 UI
- MCP 도구 (조회 + 쓰기 제안 + vector 명시 검색만; **결정론 함수 도구 없음**)
- Hierarchical summary 최소 계층 (`episode_summary` 활성화 + `work_summary` 신규)
- Redis 기반 세션 + DB 영속 기록
- Token wallet hold/commit + 자동 요약 사업자 부담 정책

### 비-목표
- 기존 `/v1/drafts`, `/v1/reviews` 단발 엔드포인트는 **유지** (점진 전환).
- 결정론 후처리 모듈 **전부 폐기**: `repetition_detector.py`, `structural_validators.py`, `timeline_extractor.py`, 검수 라우터의 `_merge_repetitions` / `detect_structural_issues` 호출.
- "아크 요약" 같은 수동 정의 단위는 **만들지 않음**. 작가가 정의하지 않는 자동 묶음은 의미적 경계 부정확.
- Frontend 디자인 시스템 전면 개편.

---

## Phase 0 — 즉시 (1~2일, 인프라 무변경)

### P0-1. 검수·초안 prompt caching 적용
- 파일: `ai/app/services/llm.py:168-264`
- 변경: `system` 파라미터를 list of blocks로, RAG context 블록 끝에 `cache_control: {"type": "ephemeral"}` 마커
- 효과: 5분 내 반복 호출 시 input 60% 절감

### P0-2. 결정론 후처리 제거
- 파일: `ai/app/api/v1/reviews.py:380-393`
- 삭제: `_merge_repetitions`, `detect_structural_issues` 호출 + import
- 검수 시스템 프롬프트에 LLM이 직접 판단할 항목 명시:
  - 동일 표현/문장 반복 검토
  - 메타 회차 참조 ("N화에서~") 회피
  - 날짜·요일 언급 시 일관성 자체 점검
  - 회상·시간 표지 본문 흐름과 모순 자체 점검
- 삭제 대상 파일 (다음 PR에서 통째로 제거):
  - `ai/app/services/repetition_detector.py`
  - `ai/app/services/structural_validators.py`
  - `ai/app/services/timeline_extractor.py` (또는 RAG 폐기 시 함께)
- `assemble_context` 의 `timeline` 섹션 호출도 동시 제거 (`rag.py:129-135`)

### P0-3. 에이전트 시스템 프롬프트 베이스 작성
- 파일 신규: `ai/app/prompts/agent_system.py`
- 내용: 도구 효율 규칙 (병렬 호출, 결과 요약, lazy loading), 응답 형식, LLM 자체 판단 영역 명시 (반복·메타·시간 모두 LLM 책임)

---

## Phase 1 — 회차 요약 활성화 + 폭주 방지 (1주)

### P1-1. `generate_summary_task` 활성화
- `ai/app/celery_app.py:9-13` include 에 `app.tasks.generate_summary` 추가 (`extract_items`도 함께)
- `task_routes`에 추가, leftover (`generate_draft`, `run_review`) 제거
- `ai/app/api/v1/pipelines.py:73` 에서 chain 으로 `chunk_and_embed_task` 와 별도로 `generate_summary_task → extract_items_task` 트리거
- `ai/app/tasks/__init__.py` 에 등록

### P1-2. 폭주 방지 가드 (필수)
- `episode_summary` 마이그레이션:
  ```sql
  ALTER TABLE episode_summary
    ADD COLUMN content_hash CHAR(64),
    ADD COLUMN generation_count INT NOT NULL DEFAULT 0,
    ADD COLUMN last_generated_at TIMESTAMPTZ;
  ```
- `generate_summary_task` 진입부에서 다음 체크 후 skip:
  - 본문 SHA256 해시가 직전 `content_hash`와 동일 → skip
  - 마지막 생성 후 30분 미경과 → skip
  - 본문 변경량 30% 미만 (Levenshtein 또는 line-diff) → skip
  - 회차당 일일 생성 횟수 3회 초과 → skip
- 트리거 정책 (Spring `EpisodeIndexDebouncer`):
  - 디바운스 60초로 연장
  - 또는 회차 닫힘·이동 같은 명시 액션 기반 (선택)

### P1-3. 자동 요약은 사업자 부담
- 정책: `generate_summary_task`는 `TokenWalletService.use()` 호출 안 함
- 작가 토글 ON/OFF UI 제공 (Frontend 작품 설정)

### P1-4. FTS 인덱스 마이그레이션 (스캔 도구 전제)
```sql
ALTER TABLE episode_summary
  ADD COLUMN summary_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', summary)) STORED;
CREATE INDEX idx_episode_summary_tsv ON episode_summary USING GIN (summary_tsv);
CREATE INDEX idx_episode_summary_work_writer ON episode_summary (work_id, writer_id);
ALTER TABLE episode_summary ALTER COLUMN raw_result TYPE JSONB USING raw_result::jsonb;
```

### P1-5. 백필 스크립트
- `ai/scripts/backfill_summaries.py` 신규
- 기존 회차 일괄 처리 (work_id별 batch)

---

## Phase 2 — MCP 도구 확장 + 에이전트 라우터 (2주)

### P2-1. 신규 MCP 도구 — 조회 (Cat 1)
- `ai/app/mcp/tools/episode_summary.py` 신규:
  - `count_episode_summaries()` — 작품 규모 + min/max sort
  - `list_episode_summaries(start_sort?, end_sort?, limit, offset)` — 범위 요약 목록
  - `get_episode_summary(sort_order)` — 1건 상세 (raw_result 포함)
  - `search_episode_summaries(keyword, limit)` — Postgres FTS
- `ai/app/mcp/tools/episode.py` 신규:
  - `get_episode(sort_order)` — 페이로드 내 회차 풀 본문 (없으면 not_in_payload 반환)
  - `list_episodes(filter, limit, offset)` — 회차 메타 목록 (sort_order, title)
- 기존 7개 도구 재사용 (`get_plan`, `get_plot`, `list/get_characters`, `list/get_world_notes`, `search_episode_chunks`)
- `search_episode_chunks` 는 vector 명시 검색 도구로 격하 (자동 호출 안 함)

### P2-2. 신규 MCP 도구 — 쓰기/제안 (Cat 4)
- `ai/app/mcp/tools/proposals.py` 신규:
  - `propose_character(payload)` → `extraction_suggestion` INSERT
  - `propose_world_note(payload)` → INSERT
  - `propose_foreshadow(payload)` → INSERT
  - `propose_episode_draft(content, sort_order)` → 신규 `proposal_queue` INSERT
- 보안: `WriterContext` 강제, 마스터 테이블 직접 INSERT 금지

### P2-3. `proposal_queue` 테이블 신규
- 컬럼: id, writer_id, work_id, kind, payload (JSONB), status, source_session_id, created_at, decided_at

### P2-4. FastAPI 에이전트 라우터
- `ai/app/api/v1/agent.py` 신규:
  - `POST /v1/agent/sessions` — 세션 시작 (work_id, AiContextPayload 수신, sessionId 발급)
  - `POST /v1/agent/sessions/{sessionId}/messages` — SSE 메시지 전송
  - `DELETE /v1/agent/sessions/{sessionId}` — 종료 + DB 영속화
- `Depends(require_internal_api_key)`
- LLM 호출: 기존 `generate_with_tools` 활용

### P2-5. 매 호출 기본 컨텍스트
- 시스템 프롬프트 (Phase 0 작성분) + 작품 정체성 압축 (~3K)
  - `work_meta` (제목·장르·톤)
  - `work_summary` (Phase 4에서 도입, 그 전엔 카드 헤더만)
  - 인물·세계관 카드 헤더 1줄씩 (이름·역할만)
  - 직전 1화 요약
- 모두 prompt caching prefix
- 디테일은 LLM이 도구로 호출

### P2-6. 세션 저장소 (하이브리드)
- Redis: `agent:session:{sessionId}` JSON, 30분 TTL, 액세스 시 갱신
- DB 신규 테이블: `ai_chat_session`, `ai_chat_message`
- 페이로드 캐싱: 세션 시작 시 1회 수신 → Redis 저장 (sessionId+writerId 검증, 30분 TTL)

### P2-7. 히스토리 윈도잉·요약 압축
- 마지막 10메시지만 LLM에 전달
- 윈도우 초과분은 Haiku로 한 단락 요약 → 첫 메시지 자리에 삽입
- 효과: 20턴도 누적 input 30K 이하

### P2-8. Spring AiController 확장
- `chatAgentSession()`, `chatAgentMessage()`, `chatAgentEnd()` 신규
- SSE 릴레이는 기존 `streamDraft` 패턴 재사용

### P2-9. AiClient 확장
- `startAgentSession`, `sendAgentMessage` (SSE), `endAgentSession`
- SLA: agent message 60s WARN / 5분 timeout

### P2-10. Frontend 챗 UI MVP
- `frontend/src/shared/components/ai/ChatPanel.tsx` 신규
- `frontend/src/shared/features/ai/ChatSession.tsx` 신규
- `aiSessionStore.ts` 에 `chatMessages[]`, `sessionId`, `creditsUsed` 추가
- 도구 호출 진행 인디케이터: "🔍 캐릭터 조회 중..."

---

## Phase 3 — 작가 승인 흐름 + 사용자 시나리오 검증 (1.5주)

### P3-1. 작가 승인 UI
- `frontend/src/shared/features/proposals/ProposalReviewPanel.tsx` 신규
- 적재된 제안 일괄/개별 승인·거절·수정
- 승인 시 Spring → 정식 테이블 INSERT (PR5 암호화)

### P3-2. 사용자 시나리오 end-to-end
- "원고 붙여넣고 설정 추출해줘"
- 기대: 5건 제안 적재 → 작가 승인 클릭 → 정식 등록

---

## Phase 4 — work_summary (1주)

### P4-1. work_summary 테이블
- 컬럼: work_id PK, summary (1~2K), genre, tone, current_phase, main_conflict, key_relationships (JSONB), last_updated_episode_sort, is_author_edited, updated_at
- 작가 직접 입력 + 50화마다 LLM 자동 갱신 (사업자 부담)

### P4-2. 작가 입력 UI
- `frontend/src/shared/features/work-summary/WorkSummaryEditor.tsx` 신규

### P4-3. MCP 도구 추가
- `get_work_summary()`

### P4-4. 에이전트 기본 컨텍스트 갱신
- P2-5의 카드 헤더 대신 work_summary 우선 사용 (~1K)

> **arc_summary, major_event, character_state_snapshot, foreshadow_progress 는 도입 안 함.** 흐름 파악은 LLM이 `list/search_episode_summaries` 스캔으로 직접 처리.

---

## Phase 5 — 토큰 결제 모델 전환 (1.5주, P2와 병행 가능)

### P5-1. TokenWalletService hold/commit
- 신규 메서드: `holdCredits(writerId, amount, reason) → holdId`, `commitHold(holdId, actualAmount)`, `releaseHold(holdId)`
- 신규 테이블: `token_hold`
- 행 잠금으로 동시성 제어

### P5-2. CreditCalculator 다중 모델 누적
- `calcCreditsAccumulated(usageList)` — 에이전트 세션의 다중 호출 합산

### P5-3. 견적 산출
- `ai/app/services/agent_estimator.py` 신규
- Haiku 분류로 의도 + 도구 호출 횟수 예측 → 견적 (50~150 크레딧 범위)
- 호출 비용 ~$0.001

### P5-4. AiController 결제 흐름
- 진입: 30 크레딧 잔액 체크
- 첫 메시지: 견적 → 사용자 동의 모달 → holdCredits
- 메시지 진행: 누적 usage 기록
- 견적 80% 도달: 작가 경고 SSE
- 견적 100%: 추가 hold 또는 종료
- 종료: commitHold(actualUsage)

### P5-5. Frontend 견적 모달 + 누적 표시
- 견적 모달, 채팅 헤더 누적 표시, 한도 도달 모달

---

## Phase 6 — Vector RAG 결정 (1주)

### P6-1. A/B 검수 품질 측정
- A: 현재 vector_search 포함
- B: vector 제거 + episode_summary 활용
- 작가 자원자 10명 × 5화 = 50건 정성 비교

### P6-2. Vector RAG 폐기 결정
- 검수에 기여 미미 → `episode_chunk` 테이블·`chunk_and_embed_task`·pgvector·OpenAI 임베딩 제거
- 챗 명시 검색 도구는 보존 가능 (semantic_search_episodes)

---

## 핵심 변경 — 결정론 함수 전면 폐기

### 폐기 대상
| 파일 | 폐기 이유 |
|------|-----------|
| `ai/app/services/repetition_detector.py` | 한국어 형태소 부재로 정확도 한계, LLM이 의도된 반복 vs 결함 판단 가능 |
| `ai/app/services/structural_validators.py` | 메타 회차 정규식 false positive (5화재·10화학 등), 과거 서술 재현율 낮음 |
| `ai/app/services/timeline_extractor.py` | `_first_marker` 우선순위 버그, 회상 마커 한계, vector RAG 폐기와 함께 제거 |
| `reviews.py:380-393` | 결정론 머지 로직 |
| `rag.py:129-135` | timeline 섹션 호출 |

### 폐기 정당화
- 패턴 무한 → 함수 무한 양산 불가능
- LLM 사고 제한 (결정론 결과 권위화)
- 검수 본질은 정확 카운팅 아님 (의미 추론)
- 진짜 결정론 필요 영역(DB 조회·외부 API)만 도구로

---

## 일정 요약

| Phase | 기간 | 산출물 |
|-------|------|--------|
| 0 | 1~2일 | caching, 결정론 후처리 제거, 에이전트 프롬프트 |
| 1 | 1주 | 요약 활성화 + 폭주 가드 + FTS 인덱스 + 백필 |
| 2 | 2주 | MCP 도구 확장 + 에이전트 라우터 + 챗 UI MVP |
| 3 | 1.5주 | 승인 UI + 사용자 시나리오 검증 |
| 4 | 1주 | work_summary |
| 5 | 1.5주 (P2 병행 가능) | hold/commit + 견적 |
| 6 | 1주 | A/B 후 vector 결정 |

**MVP (Phase 0~3)**: ~5주
**확장 (Phase 4·5)**: +2.5주
**완전체 (Phase 6)**: +1주
**총 ~8.5주**

---

## 후속 검토 시 결정 필요 사항
1. 결정론 함수 폐기 시점 (Phase 0 즉시 vs A/B 측정 후)
2. Vector RAG 폐기 일정 (Phase 6 측정 후 vs 즉시 격하)
3. AI work_meta 페이로드에 genres/moods 포함 여부
4. work_summary 자동 갱신 주기 (50화 vs 작가 트리거)
5. 도구 호출 횟수 상한 (현재 generate_with_tools 10턴)
6. 채팅 세션 TTL (30분)
7. 챗 UI 위치 (별도 패널 vs 기존 AI 패널 통합)
