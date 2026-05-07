# Folio AI 서비스 — Agent 전환 계획 v2 (KMS 가정)

> **상태**: 임시 보존. 본 문서는 KMS 채택 결정 시점까지의 Phase 0~6 에이전트 전환 계획 v2.
> **작성일**: 2026-05-04
> **선행 작업**: AI 서버 환경 Clean-up (별도 plan 파일에서 진행 중)
> **다음 단계**: Clean-up 완료 후 본 문서 기반으로 KMS 통합 + Phase 0~6 진행

---

## v1 대비 변경 요약

### 결정 변경 사항
1. **Plan C 옵션 1 → KMS 모델로 전환** (서버 KMS 권한자 복호화 가능)
2. **AI 자동 인덱싱 트리거 가능** (PowerSync 동기화 시점에 서버가 평문 복호화)
3. **EpisodeIndexDebouncer 살리기 가능** (KMS 호출로 평문 확보)
4. **MCP 도구가 서버 직접 SELECT + 복호화 패턴 가능** (이전엔 페이로드 의존만)

### 신규 추가 인프라
- AWS KMS master_kek
- `KmsService.java` (Spring) + `WorkKeyService.java`
- `work.server_encrypted_dek` 컬럼 (KMS wrap된 work_key)
- 작품 생성 시 work_key 발급 흐름 (서버 발급 권장)

### 호환성 보장 (KMS 적용 후)
- 오프라인 퍼스트 ✅ — 클라이언트 KEK·work_key 흐름 유지
- 웹 브라우저 ✅ — KMS 호출 없음, 클라이언트 자력 복호화
- 로컬 퍼스트 ✅ — 게스트 모드 KMS 무관
- PowerSync 동기화 ✅ — server_encrypted_dek 도 BYTEA sync

---

## v1 의 모든 Phase 0~6 계획 (KMS 전제로 재해석)

### v1 보존 핵심 결정사항
1. 자동 RAG 박기 폐기, vector 는 MCP 도구로만 격하 → KMS 적용 후엔 서버 자동 호출 가능해도 명시 사용 권장 유지
2. 결정론 후처리·결정론 MCP 도구 전면 폐기
3. 자동 회차 요약은 사업자 부담 + 폭주 가드 → **KMS 채택 시 PowerSync sync 시점 자동 트리거 자연 동작**
4. 세션 히스토리는 prompt caching + 윈도잉 + Haiku 요약 압축
5. MVP 는 사후 정산, Phase 5 에서 hold/commit
6. 에이전트 도구 = 조회 + 쓰기 제안 + vector 명시 검색 (3카테고리)
7. plan 테이블 폐기 완료
8. "원고 붙여넣고 설정 추출해줘" 시나리오

### v1 Phase 구조 (KMS 가정으로 단순화)

| Phase | 변경점 |
|-------|--------|
| 0 | prompt caching + 에이전트 시스템 프롬프트 (변경 없음) |
| 1 | episode_summary 활성화 — **KMS 채택으로 트리거 자연 동작**, 폭주 가드는 본문 hash 비교 만으로 충분 |
| 2 | MCP 도구 16개 — **서버 직접 SELECT + KMS 복호화 패턴 가능**, 페이로드 의존 축소 |
| 3 | 작가 승인 흐름 (변경 없음) |
| 4 | work_summary (변경 없음) |
| 5 | hold/commit + 견적 (변경 없음) |
| 6 | Vector RAG 결정 — KMS 적용 시 vector 자동 인덱싱 자연 동작이라 폐기 압력 감소 |

---

## v1 Phase 별 상세 (보존)

### Phase 0 — 즉시 적용 (1~2일)

#### P0-1. 검수·초안 prompt caching
- 파일: `ai/app/services/llm.py` 의 `AnthropicLLM.generate_json` (168-199), `generate_stream` (201-264)
- 변경: `system` 파라미터를 list of blocks로 변경, RAG context 블록 끝에 `cache_control: {"type": "ephemeral"}` 마커
- 효과: 5분 내 반복 호출 시 input 60% 절감

#### P0-2. 에이전트 시스템 프롬프트 베이스
- 신규 파일: `ai/app/prompts/agent_system.py`
- 도구 효율 규칙 + 응답 형식 + LLM 자체 판단 영역 + 도구 사용 매트릭스

### Phase 1 — 회차 요약 활성화 (1주)

#### P1-1. `generate_summary_task` 활성화
- `ai/app/celery_app.py` include 확장
- `ai/app/api/v1/pipelines.py` chain 트리거
- KMS 적용 시: Spring SyncService.processEpisode 끝에서 호출 → KMS 복호화 → FastAPI 평문 전달

#### P1-2. 폭주 방지 가드 (KMS 채택으로 단순화)
- 본문 SHA256 hash 비교 → 동일 시 skip (이게 핵심)
- 시간 디바운스 30분
- 일 3회 한도
- 작가 토글 ON/OFF (Phase 3)

#### P1-3. 자동 요약은 사업자 부담
#### P1-4. FTS 인덱스 마이그레이션
#### P1-5. 백필 스크립트

### Phase 2 — MCP 도구 + 에이전트 라우터 (2주)

#### MCP 도구 카탈로그 (16개)

**Cat A — 조회 (DB MCP, 11개)** — KMS 적용 시 서버 직접 SELECT + 복호화 가능
1. `get_work_meta` — work 직접
2. `list_characters`
3. `get_character`
4. `list_world_notes`
5. `get_world_note`
6. `list_foreshadows`
7. `get_plot`
8. `count_episodes`
9. `list_episode_summaries`
10. `get_episode_summary`
11. `search_episode_summaries`

**Cat B — 회차 본문·의미 검색 (2개)**
12. `get_episode` — KMS 채택 시 페이로드 의존 안 해도 됨 (서버 KMS 복호화)
13. `semantic_search_episodes`

**Cat C — 쓰기/제안 (4개)**
14. `propose_character`
15. `propose_world_note`
16. `propose_foreshadow`
(Phase 3) `propose_episode_draft`

#### 에이전트 라우터·세션·히스토리 윈도잉 (v1 그대로)

### Phase 3 — 작가 승인 흐름 (1.5주)
- propose_episode_draft 도구 추가
- ProposalReviewPanel 신규
- Spring 승인 처리 엔드포인트
- "원고 붙여넣어 설정 추출" 시나리오 검증
- 30일 TTL 자동 만료

### Phase 4 — work_summary (1주)
- 신규 sync 테이블
- 작가 입력 UI
- 자동 갱신 Celery 태스크
- 에이전트 기본 컨텍스트 갱신

### Phase 5 — 토큰 결제 모델 전환 (1.5주)
- TokenWalletService hold/commit
- token_hold 테이블
- CreditCalculator 다중 모델 누적
- 견적 산출
- AiController 결제 흐름 재설계

### Phase 6 — Vector RAG 결정 (1주)
- A/B 검수 품질 측정
- 폐기 결정 또는 명시 검색 도구로 격하

---

## KMS 통합 추가 작업 (v2 신규)

### KMS-1. AWS KMS 인프라
- master_kek CMK 생성
- Spring 서버 IAM kms:Decrypt/Encrypt 권한
- CloudTrail 활성화 (감사 로그)
- 운영팀 IAM 정책 (KMS 직접 접근 금지, 코드 경유만)

### KMS-2. Backend 통합
- `KmsService.java` 신규 (~80줄) — AWS SDK KMS Encrypt/Decrypt wrapper
- `WorkKeyService.java` 신규 (~50줄) — server_encrypted_dek 관리 + 본문 평문 복호화
- `work.server_encrypted_dek BYTEA` 컬럼 추가
- 작품 생성 API 흐름 변경 — 서버가 work_key 생성·발급·KMS wrap

### KMS-3. AI 서버 연동
- `EpisodeIndexDebouncer.fire()` 살리기 — KMS 통한 work_key 획득 + 평문 복호화 + FastAPI 호출
- `chunk_and_embed_task` — 서버에서 평문 받음 (변경 없음, 호출 측에서 평문 전달)

### KMS-4. 마이그레이션
- 기존 작품의 server_encrypted_dek 일괄 생성 (KMS 호출 일회성)
- 또는 작가 다음 로그인 시 lazy 생성

### KMS-5. 작가 동의·정책
- 가입·설정 화면에 데이터 보호 정책 명시
- 개인정보처리방침 갱신 (운영팀 접근 가능 + 감사 로그 + 정책 통제)

---

## v1 산출물 표 (그대로)

### 신규 파일
- `ai/app/api/v1/agent.py`
- `ai/app/mcp/tools/work_meta.py`, `episode_summary.py`, `episode.py`, `foreshadow.py`, `proposals.py`
- `ai/app/services/agent_estimator.py`
- `ai/app/prompts/agent_system.py`
- `ai/scripts/backfill_summaries.py`
- `frontend/src/shared/components/ai/ChatPanel.tsx`
- `frontend/src/shared/features/ai/ChatSession.tsx`
- `frontend/src/shared/features/proposals/ProposalReviewPanel.tsx`
- `frontend/src/shared/features/work-summary/WorkSummaryEditor.tsx`
- (KMS) `backend/.../KmsService.java`, `WorkKeyService.java`

### 신규 DB 테이블
- `proposal_queue` (P2-2) — sync 대상
- `ai_chat_session`, `ai_chat_message` (P2-5) — sync 비대상
- `work_summary` (P4-1) — sync 대상
- `token_hold` (P5-1) — sync 비대상
- (KMS) `work.server_encrypted_dek` 컬럼 추가

### 삭제 대상 (Clean-up Phase 에서 처리됨)
- `ai/app/services/repetition_detector.py`
- `ai/app/services/structural_validators.py`
- `ai/app/services/timeline_extractor.py`
- `task_routes` leftover

### Frontend SCHEMA_VERSION 단계별 bump
- Clean-up 시: `v3_drop_plan_table` (이미 적용됨)
- KMS 통합: `v4_server_encrypted_dek`
- Phase 1: `v5_episode_summary_fts`
- Phase 2: `v6_proposal_queue`
- Phase 4: `v7_work_summary`

---

## v2 일정 (KMS 통합 포함)

| Phase | 기간 | 산출물 |
|-------|------|--------|
| Clean-up | 3~4일 | AI 서버 환경 클린 (별도 plan 파일) |
| KMS 통합 | 1~2주 | AWS KMS 인프라 + Spring KmsService + work.server_encrypted_dek + 작품 생성 흐름 변경 + 마이그레이션 |
| 0 | 1~2일 | prompt caching + 에이전트 시스템 프롬프트 |
| 1 | 1주 | episode_summary 자동 활성화 (KMS 트리거 정합) |
| 2 | 2주 | MCP 도구 + 에이전트 라우터 + 챗 UI MVP |
| 3 | 1.5주 | 승인 UI + 시나리오 검증 |
| 4 | 1주 | work_summary |
| 5 | 1.5주 | hold/commit + 견적 |
| 6 | 1주 | Vector RAG 결정 |

**총 ~11주** (KMS 통합 포함)
**MVP (Clean-up + KMS + Phase 0~3)**: ~7~8주

---

## 후속 검토 시 결정 필요 사항
1. KMS 통합 시점 — Clean-up 직후 vs Phase 0~3 진행 중 병행
2. 작품 생성 시 work_key 발급 주체 (서버 발급 권장)
3. 기존 작품 server_encrypted_dek 백필 시점 (마이그레이션 1회 vs 작가 로그인 시 lazy)
4. AI 동의 화면·writer.ai_consent_at 컬럼 도입 여부 (KMS 채택했으므로 작가 동의 명시 필요)
5. 운영자 KMS 접근 정책·감사 로그 운영 가이드라인
