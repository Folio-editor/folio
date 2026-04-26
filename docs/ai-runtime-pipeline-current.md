# AI Runtime Pipeline (Current State)

이 문서는 **현재 코드 기준**으로 AI 파이프라인이 어떻게 동작하는지 정리한 문서다.
대상 범위는 `frontend` + `backend(Spring)` + `ai(FastAPI/Celery)` 이다.

## 1. 전체 호출 흐름

1. Frontend AI 패널에서 초안/검수 요청 발생
2. Frontend -> Spring: `POST /api/v1/ai/drafts` (SSE), `POST /api/v1/ai/reviews` (JSON)
3. Spring -> FastAPI: `POST /v1/drafts`, `POST /v1/reviews` (+ `X-Internal-Api-Key`)
4. FastAPI 내부에서 RAG 컨텍스트 조립 + LLM 호출
5. 결과를 Spring이 프록시 전달하여 Frontend에서 표시/저장

보조 흐름(인덱싱):

1. 에피소드 변경 후 Spring `EpisodeIndexDebouncer`가 5초 디바운스
2. Spring -> FastAPI `POST /v1/pipelines/episode`
3. FastAPI Celery task `chunk_and_embed` 실행
4. `episode_chunk` 테이블에 청크 + 벡터 저장

## 2. 경계(API)별 입력/출력

## Frontend -> Spring (`/api/v1/ai/*`)

### 초안 생성

- 경로: `POST /api/v1/ai/drafts`
- Front 입력(camelCase):
  - `workId`
  - `episodeId`
  - `storyline`
  - `currentEpisodeNum`
  - `model` (`sonnet`/`opus`)
  - `userPrompt`
- Spring에서 인증 사용자 기준 `writerId`를 주입해 FastAPI DTO(snake_case)로 변환
- 응답: SSE
  - `{"type":"chunk","content":"..."}`
  - `{"type":"done","episode_id":"...","total_length":N,"usage":{"input_tokens":x,"output_tokens":y}}`

### 검수

- 경로: `POST /api/v1/ai/reviews`
- Front 입력(camelCase):
  - `workId`
  - `episodeId`
  - `content`
  - `episodeNumber`
- Spring에서 인증 사용자 `writerId` 주입 후 FastAPI 요청
- 응답(JSON):
  - `issues[]`, `summary`, `score`, `usage`

## Spring -> FastAPI (`/v1/*`)

- 내부 인증 헤더: `X-Internal-Api-Key`
- 기본 연결 설정:
  - `AI_SERVER_URL` 기본 `http://localhost:8000`
  - connect timeout: 3s
  - read timeout: 10s

## 3. 모델/토큰 사용 정책

## Provider 선택

- `LLM_PROVIDER`
  - `fake`: 고정 더미 응답
  - `anthropic`: Claude 실제 호출
- `EMBEDDING_PROVIDER`
  - `fake`: deterministic fake 벡터
  - `openai`: `text-embedding-3-small` 기본

기본값은 둘 다 `fake`라서, 환경변수 없으면 실제 LLM/Embedding이 아니라 더미로 돈다.

## 모델 선택 로직

- Draft (`/v1/drafts`):
  - 기본 Sonnet 스트리밍
  - 요청 `model=opus`면 `claude_opus_model`로 override
- Review (`/v1/reviews`):
  - `generate_json`에 `claude_sonnet_model`을 명시 override
- Extract-settings (`/v1/extract-settings`):
  - model override 없음 -> `generate_json` 기본(haiku 라인)
- `AnthropicLLM.generate_json` 기본 max_tokens: 2000
- Review는 max_tokens 8000으로 명시
- `AnthropicLLM.generate_stream` max_tokens: 8000

## usage 집계

- 공통 포맷: `{"input_tokens": int, "output_tokens": int}`
- Draft done 이벤트에 usage를 실어 전송
- Review/Extract-settings 응답 JSON에도 usage 포함

## 4. RAG 구조 (현재 활성)

RAG 엔트리포인트: `assemble_context(work_id, writer_id, storyline, current_episode_num, mode)`

### 컨텍스트 섹션

- `work_meta`: 작품 메타
- `characters`: 인물 정보
- `world_notes`: 세계관 노트
- `foreshadows`: 복선
- `storyline`: 플롯 + 현재 요청 줄거리
- `recent_raw`: 최근 회차 원문
- `vector_search`: 줄거리 임베딩 기반 유사 청크 검색

### 모드별 제한

- `mode=draft`
  - recent_raw limit: 4
  - vector_search limit: 15
- `mode=review`
  - recent_raw limit: 2
  - vector_search limit: 5

### 설정집 크기 분기

- `load_settings`에서 `characters + world_notes` 개수 합 기준
- `<= 40`: `full` 포맷
- `> 40`: `compact` 포맷

### 토큰 예산/절단

- RAG 총 예산 상수: `TOKEN_BUDGET = 40_000`
- 우선 trim 대상: `vector_search`, `foreshadows`, `world_notes`, `characters`
- 초과 시 절반 축소 -> 여전히 초과면 섹션 제거
- `recent_raw`는 우선 보존되는 편(우선순위 높은 컨텍스트)

참고: `_fetch_recent_summaries`는 현재 비어 있음(`return ""`), 즉 요약 섹션은 실제 미사용 상태.

## 5. 임베딩/인덱싱 파이프라인

## 트리거

- Spring `EpisodeIndexDebouncer`가 5초 디바운스로 `/v1/pipelines/episode` 호출

## FastAPI `/v1/pipelines/episode`

1. 본문(TipTap JSON) -> plain text
2. 청크 분할(기본 500~1000 토큰)
3. 요청 청크 시그니처(sha256) 생성
4. 기존 `episode_chunk` 시그니처와 비교
5. 동일하면 `status=skipped, reason="content unchanged"`
6. 다르면 Celery `chunk_and_embed` enqueue

## Celery `chunk_and_embed`

- 기존 episode의 `episode_chunk` 삭제 후 재삽입
- 각 청크에 대해:
  - `chunk_index`
  - `content`
  - `embedding` (벡터 1536차원)
  - `token_count`
- 저장 테이블: `episode_chunk`

## 6. MCP 구조 (현재 상태)

MCP 툴은 구현돼 있고 레지스트리에 등록돼 있다:

- `get_plan`
- `get_plot`
- `list_characters`
- `get_character`
- `list_world_notes`
- `get_world_note`
- `search_episode_chunks`

보안 격리:

- `WriterContext(writer_id, work_id)`를 서버가 강제 주입하는 구조
- 툴 쿼리는 컨텍스트 기반 범위 제한을 전제로 설계됨

현재 활성/비활성:

- **활성**: RAG 기반 검수/초안
- **비활성**: Review의 MCP tool-loop 경로(`generate_with_tools`)는 코드상 주석 처리됨
- 이유(코드 주석): 비용 절감 목적의 임시 비활성

즉, 지금 검수는 MCP 호출 없이 RAG + 단일 JSON 생성 경로로 동작한다.

## 7. TipTap 본문 정제 규칙

- DB 저장 포맷(TipTap JSON) -> plain text 추출
- `authorNote` mark는 제외
- 문단/리스트/인용/구분선을 텍스트 규약으로 보존
- 검수용 `extract_numbered_text`는 라인번호(`[N]`)를 붙여 issue의 `lines` 매핑에 사용

## 8. Frontend 상태 흐름

- 상태 저장소: `aiSessionStore`
- Draft:
  - `startGeneration` -> `streaming`
  - chunk 수신 시 `appendChunk`
  - done/error/stop에 따라 상태 전환 + history(localStorage) 저장
- Review:
  - `startReview` -> `loading`
  - 결과 수신 후 `done` + reviewHistory 저장

주의 포인트:

- Draft에서 `done` 이벤트에서 `finishGeneration()` 호출 후, `onDone` 콜백에서도 다시 호출 가능해 중복 저장 가능성이 있다.
- `streamSSE` 경로는 일반 `request`와 달리 401 자동복구(`tryRestore`) 재시도 로직이 없다.

## 9. 지금 구조를 한 줄로 요약

- **실시간 사용자 기능(초안/검수)**: `Frontend -> Spring 프록시 -> FastAPI(RAG+LLM)`
- **지식 인덱싱(벡터화)**: `Episode 변경 -> Spring debounce -> FastAPI pipeline -> Celery chunk/embed`
- **MCP**: 구현은 되어 있으나 검수 본경로에서는 현재 꺼져 있음

## 10. 코드 기준 파일 맵

- Front 요청/상태
  - `frontend/src/shared/components/layout/RightPanels.tsx`
  - `frontend/src/shared/lib/apiClient.ts`
  - `frontend/src/shared/stores/aiSessionStore.ts`
- Spring 프록시/연결
  - `backend/src/main/java/com/storyzip/ai/controller/AiController.java`
  - `backend/src/main/java/com/storyzip/ai/client/AiClient.java`
  - `backend/src/main/java/com/storyzip/ai/service/EpisodeIndexDebouncer.java`
  - `backend/src/main/resources/application.yml`
- FastAPI API/서비스
  - `ai/app/api/v1/drafts.py`
  - `ai/app/api/v1/reviews.py`
  - `ai/app/api/v1/pipelines.py`
  - `ai/app/api/v1/extract_settings.py`
  - `ai/app/services/rag.py`
  - `ai/app/services/llm.py`
  - `ai/app/services/providers.py`
  - `ai/app/services/settings_loader.py`
  - `ai/app/services/chunker.py`
  - `ai/app/services/text_extractor.py`
  - `ai/app/mcp/registry.py`
  - `ai/app/tasks/chunk_and_embed.py`
  - `ai/app/celery_app.py`

## 11. Hybrid (RAG + MCP) 구현 구체화

### 11.1 운영 모드

- `rag`: 빠르고 저렴, 고정 컨텍스트 기반
- `mcp`: 툴 호출 중심, 동적 조회 강함
- `hybrid`: RAG 기본 + 필요한 순간 MCP 보강

### 11.2 Hybrid 실행 플로우

1. RAG 컨텍스트 생성 (`assemble_context`)
2. 1차 판단 프롬프트 실행
3. 정보 부족/근거 부족 시 MCP tool 호출
4. tool 결과를 합쳐 최종 JSON 생성
5. normalize + usage 반환

### 11.3 MCP 호출 트리거 규칙

- 설정 충돌 근거가 약할 때
- 고유명사/용어 확인이 필요할 때
- 회차 간 맥락 충돌 검증이 필요할 때

### 11.4 토큰/비용 예산 규칙

- 요청 1건 토큰 예산을 기능별로 분할 운영
- 초과 시 축소 순서:
  1. 벡터 검색 결과 축소
  2. MCP 툴 호출 횟수/결과 길이 축소
  3. 최종 응답 요약
- 권장 가이드:
  - RAG 컨텍스트 60%
  - MCP loop 25%
  - 최종 응답 15%

### 11.5 실패 처리/폴백

- MCP 실패 시 `rag-only` 자동 강등
- 툴 타임아웃 발생 시 해당 툴 skip 후 계속 진행
- JSON 파싱 실패 시 1회 재시도 후 안전 응답
- 내부 오류는 표준 에러 포맷 + trace id 반환

### 11.6 제한치 권장값

- MCP 최대 loop: 3~5
- MCP 툴 타임아웃: 2~3초/툴
- mode별 운영:
  - 검수: hybrid 우선
  - 초안: rag 우선, 필요 시 hybrid 확장

### 11.7 관측성(Observability)

- 필수 로그 필드:
  - `mode`
  - `model`
  - `input_tokens`
  - `output_tokens`
  - `tool_calls`
  - `latency_ms`
  - `fallback_used`
- 운영 지표:
  - 성공률
  - p95 지연
  - 건당 토큰
  - 건당 비용

### 11.8 롤아웃 전략

1. Phase 1: dev/stage에서 hybrid 강제
2. Phase 2: prod 10% 카나리
3. Phase 3: 검수 안정화 후 초안으로 확대 여부 판단

## 12. 기능별 RAG 입력 섹션별 토큰 분해 (추정 + 측정 방식)

이 섹션은 `현재 코드 상수`를 기반으로 한 추정치와, 운영 시 실제 수치를 기록하는 방법을 함께 정의한다.

### 12.1 공통 전제

- RAG 컨텍스트 총 예산: `TOKEN_BUDGET = 40,000`
- 컨텍스트 조립 함수: `assemble_context(...)`
- 토큰 카운트 함수: `count_tokens(...)` (`cl100k_base`, 없으면 fallback tokenizer)

### 12.2 Draft (`/v1/drafts`) 섹션별 입력

- `work_meta`
- `characters`
- `world_notes`
- `foreshadows`
- `storyline`
- `recent_raw` (최대 4회차)
- `vector_search` (최대 15개 청크)

추정 범위(권장 운영 기준):

| 섹션 | 코드 기준 | 대략 토큰 범위 |
| --- | --- | --- |
| `work_meta` | 작품 메타 텍스트 | 50~500 |
| `characters` | 인물 + 노트 일부(항목당 일부 잘림) | 500~5,000 |
| `world_notes` | 항목별 텍스트 요약 포함 | 300~5,000 |
| `foreshadows` | 항목별 텍스트 요약 포함 | 200~2,000 |
| `storyline` | 플롯 + 이번 줄거리 | 100~1,000 |
| `recent_raw` | 최근 4회차 원문 | 2,000~15,000 |
| `vector_search` | 유사 청크 15개 (청크당 약 500~1,000) | 1,500~15,000 |

### 12.3 Review (`/v1/reviews`) 섹션별 입력

RAG 자체는 Draft와 같지만 limit가 다르다.

- `recent_raw`: 최대 2회차
- `vector_search`: 최대 5개 청크

추정 범위(컨텍스트만):

| 섹션 | 코드 기준 | 대략 토큰 범위 |
| --- | --- | --- |
| `work_meta` | 동일 | 50~500 |
| `characters` | 동일 | 500~5,000 |
| `world_notes` | 동일 | 300~5,000 |
| `foreshadows` | 동일 | 200~2,000 |
| `storyline` | review는 storyline 빈값 호출 | 0~700 |
| `recent_raw` | 최근 2회차 원문 | 1,000~8,000 |
| `vector_search` | 유사 청크 5개 | 500~5,000 |

Review 추가 입력(중요):

- `cleaned_content` (검수 대상 원고 본문 전체, 줄번호 포함 텍스트)
- `character_settings`, `world_note_settings` 재주입
- JSON schema hint

즉 Review 총 입력 토큰은 `RAG 컨텍스트 + 원고 본문 + 설정 재주입` 구조라, Draft보다 커질 수 있다.

### 12.4 Extract-settings (`/v1/extract-settings`)

이 기능은 `assemble_context`를 사용하지 않는다.

- `existing_characters`
- `existing_world_notes`
- `cleaned_content`
- schema hint

추정 범위:

| 섹션 | 대략 토큰 범위 |
| --- | --- |
| 기존 캐릭터/세계관 | 500~8,000 |
| 원고 본문 | 1,000~20,000+ |
| schema/system | 200~1,000 |

### 12.5 트리밍 규칙(컨텍스트 초과 시)

컨텍스트가 40,000을 넘으면 아래 순서로 줄인다.

1. `vector_search` 반으로 축소
2. `foreshadows` 반으로 축소
3. `world_notes` 반으로 축소
4. `characters` 반으로 축소
5. 여전히 초과면 같은 순서로 섹션 제거

`recent_raw`는 상대적으로 보존되는 편이라, 최근 원문이 큰 프로젝트에서는 다른 섹션이 먼저 줄어든다.

### 12.6 문서에 남길 “실측” 표준 포맷

운영/테스트 시 아래 필드를 반드시 함께 기록한다.

| 항목 | 예시 |
| --- | --- |
| `feature` | `draft`, `review`, `extract-settings` |
| `mode` | `rag` / `mcp` / `hybrid` |
| `model` | `claude-sonnet-4-6` |
| `section_tokens` | `{work_meta:120, characters:900, ...}` |
| `input_tokens_total` | `7340` |
| `output_tokens_total` | `1320` |
| `latency_ms` | `4820` |

### 12.7 즉시 적용 가능한 운영 가이드

- Draft 목표 입력: `8k~20k` (장편은 30k 근접 가능)
- Review 목표 입력: `10k~30k` (원고 길이에 강하게 영향)
- 1회 호출에서 35k 이상 자주 나오면:
  1. `vector_search limit` 축소
  2. `recent_raw limit` 축소
  3. settings compact 강제 기준 하향

### 12.8 기능별 토큰 입력 요약 (요청 본문 버전)

#### 1) 초안 생성 (`/v1/drafts`)

RAG 입력 소스 (`assemble_context`, `mode=draft`)

- `work_meta` (작품 메타)
- `characters`
- `world_notes`
- `foreshadows`
- `storyline` (플롯 + 이번 줄거리)
- `recent_raw` (최근 원문 4회차)
- `vector_search` (유사 청크 15개)

토큰 특성

- 전체 RAG 컨텍스트는 `TOKEN_BUDGET = 40,000`으로 트리밍
- `vector_search` 청크는 청킹 시 개당 약 500~1000 토큰이라 초반엔 크게 먹고, 초과 시 먼저 잘림
- 최종 입력은 `context + storyline + user_prompt + system prompt`

#### 2) 검수 (`/v1/reviews`)

RAG 입력 소스 (`assemble_context`, `mode=review`)

- 위와 동일한 섹션
- 차이: `recent_raw=2`, `vector_search=5`

추가 입력

- `load_settings()`로 가져온 캐릭터/세계관을 다시 프롬프트에 붙임
- `extract_numbered_text(content)`로 변환한 원고 본문 전체
- 검수 스키마 힌트(JSON 포맷 지시)

토큰 특성

- 컨텍스트 40k 예산 내에서 잘리지만,
- 검수는 원고 본문 + 설정집 재첨부까지 들어가서 실제 입력 토큰이 커지기 쉬움

#### 3) 설정 추출 (`/v1/extract-settings`)

- 이건 `assemble_context` RAG를 안 씀
- 입력: `existing_characters + existing_world_notes + cleaned_content`
- 즉 “가벼운 설정 추출 프롬프트” 구조

현재 실제 사용량 확인 위치

- 초안: done SSE 이벤트의 `usage` (`input_tokens`, `output_tokens`)
- 검수/설정추출: API 응답의 `usage`
