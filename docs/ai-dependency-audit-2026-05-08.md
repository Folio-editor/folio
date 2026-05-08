# AI 서버 의존성·빌드 정합성 감사 보고서

- 작성일: 2026-05-08
- 작성자: 에이전트 진단 (사용자 요청)
- 트리거: Phase 4.6 작업 중 호스트 venv 에서 `pgvector` import 실패 → 의존성 선언 다중화 의심
- 범위: `ai/` 패키지의 의존성 선언, Dockerfile 분기, CI/CD 파이프라인, 문서 일관성

---

## 1. 한 줄 요약

> `ai/` 안에 **베이스 의존성을 절반만 깐 stale Dockerfile 2종** 과 **5줄짜리 빈 껍데기 `requirements.txt`** 가 잠복하고 있었음. CI/프로덕션 빌드는 [`infra/dockerfiles/`](../infra/dockerfiles/) 의 정식 Dockerfile 만 쓰므로 운영은 안전. 개발자 로컬 / 로컬 통합테스트(`infra/test/docker-compose.test.yml`) 가 이 stale 산물을 끌어다 써 import 실패 함정. 본 작업으로 stale 3종 삭제 + 통합테스트 compose 가 정식 Dockerfile 을 가리키도록 정리.

---

## 2. 문제 발생 경위

Phase 4.6 작업 끝에 새 도구 (`list_plots`, `find_relevant_episodes`, `summarize_episode`) 가 등록되었는지 확인하려 호스트에서:

```bash
cd ai && python -c "from app.mcp import registry; print(len(registry.MCP_TOOLS))"
```

→ `ModuleNotFoundError: No module named 'pgvector'`. 호출 체인:

```
app/mcp/registry.py:16
 └── app/mcp/tools/episode_plaintext.py:19
      └── app/db/models/episode_summary.py
           └── app/db/models/episode_chunk.py:4
                └── from pgvector.sqlalchemy import Vector  ✗
```

호스트 venv 가 옵셔널 그룹 없이 셋업돼 있었기 때문. 사용자 의심: "이전에 작업자가 작업 대충해둔거 가져온거라 누락 가능성있다" → 정밀 검사 결과 실제로 **죽은 산물 3종** 발견.

---

## 3. 의존성 선언 분기 현황

### 3.1 [`ai/pyproject.toml`](../ai/pyproject.toml) — Source of Truth ✅

```toml
[project]
dependencies = [
    "anthropic>=0.40.0",
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "pydantic>=2.9",
    "pydantic-settings>=2.5",
    "celery[redis]>=5.4",
    "redis>=5.0",
    "httpx>=0.27",
    "structlog>=24.4",
    "prometheus-fastapi-instrumentator>=7.0.0",
    "prometheus-client>=0.20",
]

[project.optional-dependencies]
db  = ["sqlalchemy[asyncio]>=2.0", "asyncpg>=0.29", "pgvector>=0.3", "alembic>=1.13"]
llm = ["openai>=1.54", "tiktoken>=0.8", "tenacity>=9.0"]
dev = ["pytest>=8.0", "pytest-asyncio>=0.24", "ruff>=0.7", "mypy>=1.13", "zope.interface>=7.0"]
```

**핵심**: `pgvector`, `sqlalchemy`, `asyncpg` 는 `[db]` 옵셔널 그룹에 있음. 코드는 항상 import 하므로 사실상 필수지만 그룹 분리되어 있어 `pip install -e .` 만 하면 누락.

### 3.2 죽은 산물 3종 (본 작업으로 삭제)

| 파일 | 상태 | 문제 |
|------|------|------|
| ~~`ai/requirements.txt`~~ | 🗑 삭제됨 | 5줄. tiktoken·openai·python-dotenv·prometheus 만. anthropic·fastapi·sqlalchemy·pgvector·celery 전부 누락. pyproject.toml 과 무관. |
| ~~`ai/Dockerfile`~~ | 🗑 삭제됨 | `pip install -e .` (옵셔널 그룹 없음). `infra/dockerfiles/Dockerfile.fastapi` 와 중복이지만 옵셔널 빠져 있어 빌드해도 런타임 import 실패. |
| ~~`ai/Dockerfile.worker`~~ | 🗑 삭제됨 | 위와 동일. `infra/dockerfiles/Dockerfile.celery-worker` 와 중복. |

### 3.3 정식 Dockerfile (운영·CI) ✅

| 파일 | install 명령 | 사용처 |
|------|-------------|--------|
| [`infra/dockerfiles/Dockerfile.fastapi`](../infra/dockerfiles/Dockerfile.fastapi) | `pip install -e ".[llm,db]"` | GitLab CI deploy, 통합테스트 |
| [`infra/dockerfiles/Dockerfile.celery-worker`](../infra/dockerfiles/Dockerfile.celery-worker) | `pip install -e ".[llm,db]"` | 동일 |

---

## 4. CI/CD 파이프라인 점검

### 4.1 GitLab CI ([`.gitlab-ci.yml`](../.gitlab-ci.yml))

| 단계 | line | 명령 | 평가 |
|------|------|------|------|
| `test-ai` | 61 | `pip3 install -e ".[dev,llm,db]"` | ✅ 옵셔널 3종 모두 |
| `test-ai` | 64 | `pytest -x --tb=short` | ✅ |
| `deploy-production` (master) | 239 | `docker build -f infra/dockerfiles/Dockerfile.fastapi -t folio-ai ...` | ✅ 정식 Dockerfile |
| `deploy-production` (master) | 240 | `docker build -f infra/dockerfiles/Dockerfile.celery-worker -t folio-celery-worker ...` | ✅ 정식 Dockerfile |

→ **CI/CD 자체는 stale 산물을 참조하지 않음. 운영 영향 0.**

### 4.2 통합테스트 compose ([`infra/test/docker-compose.test.yml`](../infra/test/docker-compose.test.yml))

수정 전:
```yaml
fastapi-test:
  build: { context: ../../ai, dockerfile: Dockerfile }       # ❌ stale
celery-worker-test:
  build: { context: ../../ai, dockerfile: Dockerfile.worker } # ❌ stale
```

수정 후:
```yaml
fastapi-test:
  build: { context: ../../ai, dockerfile: ../infra/dockerfiles/Dockerfile.fastapi }
celery-worker-test:
  build: { context: ../../ai, dockerfile: ../infra/dockerfiles/Dockerfile.celery-worker }
```

→ 통합테스트 compose 가 정식 Dockerfile 을 build context 외부 경로로 참조. context 는 `../../ai` 유지 (Python 패키지 복사) + dockerfile 만 `../infra/dockerfiles/...` 로 상대 경로.

### 4.3 dev compose ([`infra/dev/docker-compose.dev.yml`](../infra/dev/docker-compose.dev.yml))

- `ai` / `celery-worker` 서비스 자체 없음 — **개발자가 호스트 venv 에서 직접 실행**하는 설계
- 인프라(postgres / redis / mongo / powersync / vault) 만 컨테이너로 띄움
- 의존성은 호스트에 `pip install -e ".[llm,db,dev]"` 로 설치 필요

→ 의도된 설계. 단 README 에서 명시 안내 필요 (이번에 보강).

---

## 5. 본 작업의 변경 내역

### 5.1 삭제된 파일 (3종)

```
ai/Dockerfile
ai/Dockerfile.worker
ai/requirements.txt
```

### 5.2 수정된 파일 (3종)

| 파일 | 변경 |
|------|------|
| [`infra/test/docker-compose.test.yml`](../infra/test/docker-compose.test.yml) | `fastapi-test` / `celery-worker-test` 가 `infra/dockerfiles/` 의 정식 Dockerfile 을 가리키도록 변경 |
| [`ai/README.md`](../ai/README.md) | `pip install -r requirements.txt` 를 `pip install -e ".[llm,db,dev]"` 로 교체. 의존성 그룹 표 추가. 디렉토리 구조에서 `requirements.txt` 항목 제거. |
| [`docs/dev-setup.md`](./dev-setup.md) | 동일하게 `pip install -e ".[llm,db,dev]"` 로 교체 |

---

## 6. 잔여 위험·후속 액션

### 6.1 [`docs/ai-server-current-state.md`](./ai-server-current-state.md) (낮은 우선순위)

스냅샷 문서로서 `Dockerfile`, `Dockerfile.worker`, `requirements.txt` 를 참조 (line 93, 149, 152, 218). 본 작업 시점부터 **사실과 다름**. 다만 이 문서는 "특정 시점의 현황 보고" 성격이라 강제 갱신 의무는 약함. 다음 아키텍처 리뷰 시 일괄 정리 권장.

### 6.2 [`ai/TODO.md`](../ai/TODO.md) (낮은 우선순위)

line 46 / 216 에 `Dockerfile.worker` 언급. TODO 파일이라 큰 영향 없음.

### 6.3 `[db]` 그룹의 사실상 필수성 (정책 결정 필요)

`pgvector` / `sqlalchemy` / `asyncpg` 는 코드에서 무조건 import 됨 → 옵셔널이 의미 없음. 두 선택지:

- **(A)** base 로 승격 — 이름과 실제 사용이 일치
- **(B)** 현행 유지 + README 에 "항상 `[db]` 까지 설치" 강조 (이번 작업)

운영팀 합의 후 차기 리팩토링에서 결정.

---

## 7. 검증 결과

### 7.1 호스트 venv 재셋업 후 import 정합성

```bash
cd ai
pip install -e ".[llm,db,dev]"
python -c "from app.mcp import registry; print(len(registry.MCP_TOOLS), 'tools')"
# → 33 tools (Phase 4.6 신규 3종 포함)
```

### 7.2 신규 도구 등록 확인

| 도구 | MCP_TOOLS | _HANDLER_MAP | TOOL_CATEGORY | scenarios.ALL_READ |
|------|-----------|---------------|---------------|---------------------|
| `list_plots` | ✅ | ✅ | read_summary | ✅ |
| `find_relevant_episodes` | ✅ | ✅ | read_vector | ✅ |
| `summarize_episode` | ✅ | ✅ | sub_agent | ✅ |

### 7.3 구문 검증

`ast.parse()` — 5개 파일 (registry.py, scenarios.py, plot.py, episode_search.py, episode_plaintext.py) 모두 통과.

---

## 8. 후속 — AI 제안 승인 → 임베딩 트리거 갭 보완

본 감사 후속으로 발견된 운영 갭:

### 8.1 갭 요약

`SyncService.processEpisode` 만 `chunk_and_embed_task` 를 fire 하므로, **AI 가 propose_episode_draft / propose_episode_update 를 만들고 작가가 [SuggestionService](../backend/src/main/java/com/storyzip/agent/service/SuggestionService.java) 로 승인** 하면:

- [SuggestionApplier.insertEpisodeDraft](../backend/src/main/java/com/storyzip/agent/service/SuggestionApplier.java) 가 직접 `INSERT INTO episode` 만 수행 → AiClient 미호출 → 임베딩 0
- 결과: 새 회차가 `find_relevant_episodes` / `query_episodes_by_chunks` 에서 검색 누락
- 작가가 클라이언트에서 그 회차를 다시 편집해야 PowerSync → SyncService → 인덱싱 fire

### 8.2 fix — `EpisodeIndexingTrigger` 컴포넌트 추출

신규 [`EpisodeIndexingTrigger.java`](../backend/src/main/java/com/storyzip/ai/client/EpisodeIndexingTrigger.java):
- `fireIndexing(episodeId, workId, writerId)` — chunk_and_embed 파이프라인 afterCommit 등록
- `fireSummary(episodeId, workId, writerId, prevStatus, newStatus)` — 완성 진입 시 episode_summary 트리거
- 디바운스 5초, AiClient 빈 미존재 skip, `server_encrypted_dek` 미발급 skip, ACTIVE 구독자만 (summary)

### 8.3 변경 파일

| 파일 | 변경 |
|------|------|
| [`backend/.../ai/client/EpisodeIndexingTrigger.java`](../backend/src/main/java/com/storyzip/ai/client/EpisodeIndexingTrigger.java) | **신규** — afterCommit 트리거 공유 컴포넌트 |
| [`backend/.../sync/service/SyncService.java`](../backend/src/main/java/com/storyzip/sync/service/SyncService.java) | `triggerEpisodeIndexingAfterCommit` / `triggerEpisodeSummaryAfterCommit` / `invokeAi*` / `episodeIndexDebounce` / `aiClientProvider` / `subscriptionRepoProvider` 제거. `episodeIndexingTrigger.fireIndexing/fireSummary` 호출로 단순화. |
| [`backend/.../agent/service/SuggestionApplier.java`](../backend/src/main/java/com/storyzip/agent/service/SuggestionApplier.java) | `EpisodeIndexingTrigger` 주입. `insertEpisodeDraft` 끝에 `fireIndexing` 호출. `applyEpisodeUpdate` 가 prevStatus 를 SELECT 한 뒤, content 변경 시 `fireIndexing`, status 변경 시 `fireSummary` 호출. |

### 8.4 동작 매트릭스 (after fix)

| 경로 | 인덱싱 | 요약 |
|------|--------|------|
| 클라이언트 편집 → PowerSync sync | ✅ (`SyncService` → `fireIndexing`) | ✅ 완성 진입 시 (`SyncService` → `fireSummary`) |
| AI propose_episode_draft 승인 → INSERT | ✅ (`SuggestionApplier.insertEpisodeDraft` → `fireIndexing`) | ❌ status='작성중' 신규 → 조건 미충족 |
| AI propose_episode_update 승인 → 본문 변경 | ✅ (`fireIndexing`) | ✅ status 변경이 동시에 있으면 (`fireSummary`) |
| AI propose_episode_update 승인 → status 만 '완성' 으로 | ❌ content 변경 없음 | ✅ (`fireSummary`) |
| AI propose_episode_delete 승인 → DELETE | n/a (FK CASCADE 로 episode_chunk 자동 삭제) | n/a |

### 8.5 검증

- `./gradlew compileJava --rerun-tasks` ✅
- `./gradlew compileTestJava` ✅
- `./gradlew test` ✅ (전체 통과)
- 디바운스: SyncService 와 SuggestionApplier 가 동일 헬퍼 인스턴스 공유 → 같은 episodeId 가 PowerSync + 승인 둘 다로 들어와도 5초 1회만 fire

---

## 9. 후속 — 청크·요약 자유형 텍스트 암호화

본 감사 후속으로 사용자 요청 반영: **청크 본문 / 요약 자유형 서사 텍스트도 사용자 원고 기반 정보** 라 저장 시 암호화, MCP 읽기 시 복호화.

### 9.1 암호화 범위 (선택적)

| 필드 | 처리 | 이유 |
|------|------|------|
| `episode_chunk.content` | 🔐 암호화 | 본문 그대로의 청크 — 가장 민감 |
| `episode_summary.summary` (3-5문장 줄거리) | 🔐 암호화 | 자유형 서사 |
| `episode_summary.oneline_summary` (15~30자) | 🔐 암호화 | 자유형 서사 |
| `episode_summary.cliffhanger` | 🔐 암호화 | 자유형 끝점 |
| `episode_summary.time_progression` | 🔐 암호화 | 자유형 시간 진행 |
| `episode_summary.pov_character` | 평문 | `idx_episode_summary_pov` GIN, character_arc.is_pov 비교 |
| `episode_summary.tone` | 평문 | search_episode_summaries scope='tone:...' 매칭 |
| JSONB 전부 (present_characters / present_locations / key_events / keywords / foreshadow_*) | 평문 | `@>` containment + GIN 인덱스 — track_foreshadow / character_arc 의존 |
| `summary_tsv` GENERATED tsvector | (자동) | summary/oneline_summary 가 ciphertext → FTS 무력화. `search_episode_summaries` free-text 검색 깨짐. scope 필터(JSONB)는 동작 유지 |

암호화 vs 분석 호환의 트레이드오프:
- 자유형 서사 (가장 민감) 보호 우선
- SQL 분석 도구 (track_foreshadow / character_arc / timeline_scan) 동작 유지
- search_episode_summaries free-text 키워드 검색만 트레이드오프 — query_episodes_by_chunks 가 대안

### 9.2 변경 파일

| 파일 | 변경 |
|------|------|
| **신규** [`backend/.../security/InternalDecryptController.java`](../backend/src/main/java/com/storyzip/security/InternalDecryptController.java) | `/internal/works/{workId}/encrypt-fields` 엔드포인트 추가 (decrypt-fields 의 거울). 평문 dict → "v1:" ciphertext dict. 빈/null/이미 v1: 인 값은 echo. 암호화 실패 시 500. |
| **신규** [`ai/app/services/encrypt_resolver.py`](../ai/app/services/encrypt_resolver.py) | `encrypt_fields(work_id, fields)` + `encrypt_summary_text_fields(work_id, summary)` + `summary_text_fields()` 헬퍼. |
| [`ai/app/tasks/chunk_and_embed.py`](../ai/app/tasks/chunk_and_embed.py) | INSERT 전 chunk content 일괄 암호화. 실패 시 episode_chunk INSERT 차단. |
| [`ai/app/tasks/generate_summary.py`](../ai/app/tasks/generate_summary.py) | UPSERT 전 4개 텍스트 필드 암호화. `raw_result` JSONB 평문 dict 저장 중단 (None). 실패 시 task skip. |
| [`ai/app/mcp/tools/episode_plaintext.py`](../ai/app/mcp/tools/episode_plaintext.py) | `summarize_episode` cache hit 경로 복호화, UPSERT 경로 암호화. 반환값은 LLM 즉시 사용 위해 평문 유지. |
| [`ai/app/mcp/tools/episode_summary.py`](../ai/app/mcp/tools/episode_summary.py) | 4개 도구 (list_all / list / get / search) 반환 직전 `_decrypt_summary_rows` 호출. |
| [`ai/app/mcp/tools/episode_search.py`](../ai/app/mcp/tools/episode_search.py) | search_episode_chunks / query_episodes_by_chunks 의 chunk content 일괄 복호화. Haiku 합성 입력 평문 보장. |
| [`ai/app/mcp/tools/episode_analytics.py`](../ai/app/mcp/tools/episode_analytics.py) | character_arc / timeline_scan 결과의 oneline_summary / cliffhanger / time_progression 복호화. |

### 9.3 데이터 흐름

**저장 경로 (평문 → ciphertext)**:
```
chunk_and_embed_task / summarize_episode / generate_summary_task
  → AI server: encrypt_resolver.encrypt_fields(work_id, plain_dict)
    → POST backend /internal/works/{wid}/encrypt-fields  (X-Internal-Api-Key)
      → WorkKeyService.resolveWorkKey(workId)  (Vault Transit decrypt server_encrypted_dek)
        → AesGcmCipher.encryptString(workKey, plaintext)  (AES-GCM-256, v1: prefix)
      ← {"fields": {"key": "v1:..."}}
    ← AI server: ciphertext dict
  → INSERT/UPSERT into episode_chunk.content / episode_summary.{4 fields}
```

**읽기 경로 (ciphertext → 평문, MCP 도구 호출 시)**:
```
MCP read tool (e.g. get_episode_summary)
  → SELECT … (rows contain "v1:..." ciphertexts)
  → AI server: decrypt_resolver.decrypt_rows(work_id, rows, [text_fields])
    → POST backend /internal/works/{wid}/decrypt-fields
      → WorkKeyService.resolveWorkKey + AesGcmCipher.decryptString
    ← {"fields": {"key": "평문"}}
  → 평문 행 LLM 컨텍스트로 반환 (메모리에만, 로그·DB 0)
```

### 9.4 가드·실패 모드

| 시나리오 | 동작 |
|---------|------|
| `server_encrypted_dek` 미발급 (work pending) | encrypt-fields 409 → task skip (DB 평문 적재 차단), MCP 읽기 placeholder 반환 |
| Backend 미기동 | encrypt 실패 → task skip / MCP 읽기 placeholder |
| 암호화 누락 (일부 chunk 평문 잔존) | chunk_and_embed: 평문 적재 거부, 모두 ciphertext 인지 확인 후 INSERT |
| 이중 암호화 시도 | backend `AesGcmCipher.encryptString` 의 `startsWith(PREFIX)` 가드로 echo |
| 기존 평문 데이터 | 백필 무관 — 새 INSERT 만 ciphertext. MCP 도구는 평문도 그대로 처리 (`v1:` 시작 안 하면 복호화 skip) |

### 9.5 검증

- AI 서버 `pytest tests/`: **54 passed** ✅
- Backend `./gradlew test`: ✅ (전체 통과)
- AST + import + tool registry 35개 ✅
- summary_text_fields() = ('oneline_summary', 'summary', 'time_progression', 'cliffhanger') ✅

### 9.6 알려진 제약

- **레거시 평문 데이터**: 기존 episode_chunk / episode_summary 행은 평문 그대로 남음. 신규 INSERT 부터 ciphertext. 대량 마이그레이션은 별도 백필 잡 필요 (현재 scope 외).

### 9.7 search_episode_summaries — Option A 채택 + summary_tsv DROP

**문제**: `oneline_summary` / `summary` 가 v1: ciphertext 적재 → GENERATED `summary_tsv` 가 base64 부스러기만 토큰화 → PostgreSQL FTS 무의미.

**해결책 (Option A)**:
1. 검색 시 scope JSONB/평문 컬럼으로 SQL 1차 필터 (인덱스 hit)
2. backend `/decrypt-fields` 1회 batch 복호화 (work_key 캐시 hit)
3. AI 서버 메모리에서 Python `keyword in text` 부분문자열 매칭
4. 함수 종료 시 Python GC 가 평문 회수 — Redis/디스크/클라이언트 캐시 X

**부가 이점**: PostgreSQL `simple` 토크나이저가 못 잡던 어형 변화도 hit
- "발견" 검색 → "발견하다", "발견했다", "발견한다" 모두 매칭

**summary_tsv 컬럼 + idx_episode_summary_tsv 인덱스 DROP**:
- 마이그레이션: [`infra/db/migrations/2026-05-08_drop_summary_tsv.sql`](../infra/db/migrations/2026-05-08_drop_summary_tsv.sql)
- 사유: GENERATED 라 INSERT 마다 ciphertext 토큰화 비용 + 디스크 점유, 검색 사용 X
- dev DB 적용 완료 ✅
- schema.sql 도 정리

**비용 비교**:
| 항목 | Before (FTS) | After (Option A) |
|------|--------------|------------------|
| 검색 지연 (300화) | ~µs | ~100~200ms |
| 정확도 | 어절 정확 일치 | 부분문자열까지 hit (개선) |
| 의미적 유사성 | n/a (벡터 검색 영역) | n/a (그대로) |
| INSERT 비용 | tsvector 토큰화 | 토큰화 비용 0 (개선) |

**구현 변경 ([episode_summary.py:search_episode_summaries](../ai/app/mcp/tools/episode_summary.py))**:
- scope 가 있으면 SQL 1차 필터, 없으면 `LIMIT 300` 만
- 결과 batch 복호화 → Python 다중 필드 substring 매칭 (oneline_summary / summary / cliffhanger / tone / pov_character / JSONB stringified)
- `keyword` 빈 문자열이면 scope 만으로 결과 반환

---

## 10. 후속 — 코드 검수 + 통합 시나리오 시뮬레이션

본 감사 후속으로 사용자 요청 — "전체 기능적 파이프라인 검수 + 사용자 시나리오 시뮬레이션".

### 10.1 검수에서 발견·수정된 결함

| 결함 | 위치 | 수정 |
|------|------|------|
| `search_episode_summaries._match` 가 SELECT 안 한 컬럼 (`present_locations`/`key_events`/`keywords`) 참조 | [`episode_summary.py`](../ai/app/mcp/tools/episode_summary.py) | SELECT 에 3 컬럼 추가 |
| `pipelines.py` 의 idempotency 체크가 ciphertext chunks 와 plaintext-chunks-hash 비교 → 항상 mismatch → 같은 본문 재동기화 시 OpenAI 임베딩 비용 누수 | [`pipelines.py`](../ai/app/api/v1/pipelines.py), [`chunk_and_embed.py`](../ai/app/tasks/chunk_and_embed.py), 신규 마이그레이션 [`2026-05-08_episode_chunk_content_hash.sql`](../infra/db/migrations/2026-05-08_episode_chunk_content_hash.sql) | `episode_chunk.content_hash` 컬럼 + 인덱스 추가, INSERT 시 평문 SHA256 적재, 체크는 `SELECT content_hash LIMIT 1` 1 query 로 단순화 |

### 10.2 사용자 시나리오 시뮬레이션 — 7건 모두 통과

[`test_phase4_6_scenarios.py`](../ai/app/tests/test_phase4_6_scenarios.py) — 실제 코드 경로 (라우터→태스크→MCP→DB) 를 mock 으로 연결해 통합 결함 검증.

| # | 시나리오 | 검증 포인트 | 결과 |
|---|---------|-------------|------|
| 1 | 작가 클라이언트 편집 → PowerSync → backend → AI → ciphertext 적재 | content 평문 잔존 X, content_hash 동일, embedding vector 평문 유지 | ✅ |
| 2 | 같은 본문 재동기화 → idempotency skip | apply_async 호출 안 됨, status="skipped" | ✅ |
| 3 | 본문 수정 → 다른 hash → 재인덱싱 | apply_async 호출, status="accepted" | ✅ |
| 4 | agent → query_episodes_by_chunks → Haiku 합성 | Haiku 입력에 ciphertext "v1:CT_" 노출 X, 평문 chunk 전달 | ✅ |
| 5 | summarize_episode 1회차 (miss + Haiku + UPSERT) → 2회차 (cache hit + decrypt) | 1회차 후 DB 에 ciphertext 적재, 2회차 Haiku 미호출, 반환은 평문 | ✅ |
| 6 | search_episode_summaries — "발견" 으로 "발견했다" 매칭 | 어형 변화 hit (Option A 강점) | ✅ |
| 7 | server_encrypted_dek 미발급 → no_plaintext error | encrypt 호출 안 함, INSERT 차단 | ✅ |

### 10.3 단위 테스트 — 15건 모두 통과

[`test_phase4_6_encryption.py`](../ai/app/tests/test_phase4_6_encryption.py):
- `_needs_encrypt` 분기 5건 (None / 빈 / v1: / 평문 / non-string)
- `encrypt_summary_text_fields` 동작 3건 (텍스트만 / None pass-through / 이중 암호화 차단)
- `chunk_and_embed_task` 암호화 INSERT 2건 (정상 / 실패 시 skip)
- `summarize_episode` UPSERT + cache hit 2건
- `search_episode_summaries` Option A 2건 (substring + empty keyword)
- `find_relevant_episodes` DB-only sanity 1건

### 10.4 전체 회귀 결과

```
ai 서버 pytest:      112 passed  (54 기존 + 36 app/tests + 15 단위 + 7 시나리오)
backend ./gradlew:   전체 통과
dev DB migration:    적용 완료 (summary_tsv DROP + episode_chunk.content_hash ADD)
```

### 10.5 주요 검증 지점 — 평문 누출 차단

| 지점 | 평문 노출 가능성 | 검증 |
|------|------|------|
| episode_chunk.content (DB 디스크) | ❌ ciphertext 만 | scenario_1 |
| episode_summary 자유형 4 필드 (DB 디스크) | ❌ ciphertext 만 | scenario_5 |
| Haiku 입력 (LLM API call body) | ✅ 평문 (서비스 동작 위해 필수) | scenario_4 |
| MCP 도구 반환값 (Sonnet 입력) | ✅ 평문 (LLM 즉시 사용) | scenario_5 |
| AI 서버 메모리 (요청 처리 동안) | ✅ 평문 (request scope) | (모든 시나리오) |
| 로그·DB·Redis | ❌ 평문 0 (구조적 차단) | (구조적) |

### 10.6 Vector 호환성 — pgvector 인덱스 정상

| 인덱스 | 컬럼 | 상태 |
|--------|------|------|
| `idx_episode_chunk_embedding` (ivfflat cosine) | `embedding VECTOR(1536)` | ✅ 평문 vector — 암호화 X, 검색 정상 |
| `idx_episode_chunk_episode_hash` (Phase 4.6 신규) | `(episode_id, content_hash)` | ✅ idempotency skip µs 단위 |
| `idx_episode_summary_present_chars/locs/keywords` (GIN JSONB) | JSONB 필드 | ✅ 평문 — track_foreshadow / character_arc 정상 |
| `idx_episode_summary_pov` | `pov_character` | ✅ 평문 — character_arc.is_pov 비교 정상 |
| `idx_episode_summary_tsv` (제거됨) | (drop) | n/a |

---

## 11. 정리

| 항목 | Before | After |
|------|--------|-------|
| ai/ 안 Dockerfile 수 | 2 (stale) | 0 |
| 의존성 선언 파일 | pyproject.toml + requirements.txt (불일치) | pyproject.toml (단일) |
| 통합테스트 compose 가 가리키는 Dockerfile | stale | 정식 |
| 개발자 README install 명령 | `pip install -r requirements.txt` (깨짐) | `pip install -e ".[llm,db,dev]"` |
| 운영 (GitLab CI deploy) | 영향 0 (이미 정식 사용 중) | 영향 0 |
