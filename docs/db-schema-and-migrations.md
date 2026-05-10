# DB 스키마 / 마이그레이션 보고서

**최종 갱신**: 2026-05-09 (refund + admin_audit_log 추가 반영)
**대상 DB**: PostgreSQL 16 (`storyzip-postgresql-dev` 컨테이너 / EC2 prod 동일)
**원본 스키마**: [`infra/db/schema.sql`](../infra/db/schema.sql)
**마이그레이션 디렉터리**: [`infra/db/migrations/`](../infra/db/migrations/)

---

## 1. 운영 원칙

1. **schema.sql 은 "현재 시점 마스터"**. 신규 환경 부트스트랩 시 한 번 실행 → 마이그레이션 폴더의 변경 분이 이미 반영된 상태로 시작.
2. **마이그레이션 파일은 누적 변경 이력**. 기존 환경(이미 booted) 에 새 컬럼/제약을 적용할 때만 사용.
3. **파일명 규약**: `YYYY-MM-DD_<짧은_설명>.sql` — 날짜 사전순 정렬 = 적용 순서.
4. **schema.sql 과 migrations/ 는 항상 동기**. 새 마이그레이션 추가 시 마스터에도 반영해야 fresh deploy 와 incremental 환경이 동일 상태.
5. **idempotent 우선**. `IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS` 패턴 사용해 재실행 안전성 확보.

---

## 2. 현재 테이블 인벤토리 (34개)

### 2.1. 인증 / 결제 / 운영 (서버 전용)

| 테이블 | 용도 | PowerSync |
|---|---|---|
| `writer` | OAuth 사용자 | ✗ |
| `audit_log` | 감사 (IP / UA / action) | ✗ |
| `admin_audit_log` | **관리자 API 호출 전수 감사** (action / result / IP / UA) | ✗ |
| `payment` | PortOne 결제 단건 | ✗ |
| `refund` | **환불 신청 1건** (REQUESTED → APPROVED/REJECTED/CANCELED) | ✗ |
| `subscription` | 정기 결제 (billing_key, monthly_tokens) | ✗ |
| `payment_event` | PG 웹훅 멱등 이벤트 큐 | ✗ |
| `analytics_event_dedup` | GA4 이벤트 중복 제거 | ✗ |
| `token_wallet` | 3-bucket 잔액 (subscription/bonus/purchase) | ✗ |
| `token_transaction` | append-only 원장 | ✗ |
| `notification` | 사용자 알림 | ✗ |
| `ai_prompt_template` | 사내 프롬프트 카탈로그 | ✗ |

### 2.2. 동기화 도메인 (PowerSync — SQLite + PostgreSQL 양방향)

| 테이블 | 핵심 컬럼 | 암호화 컬럼 |
|---|---|---|
| `work` | title, author_name, description, kind, encrypted_dek, server_encrypted_dek | title / author_name / description |
| `plan_note` | title, content | title / content |
| `world_note` | name, content (트리) | name / content |
| `character` | name, gender, age | name |
| `character_note` | kind, title, content | title / content |
| `character_custom_field` | field_name, field_value | field_name / field_value |
| `character_tag` | character ↔ world_note | — |
| `plot` | title, status, content (트리) | title / content |
| `episode` | title, status, content, word_count | title / content |
| `plot_episode_link` | plot ↔ episode 1:1 | — |
| `foreshadow` | title, importance, status, content | title / content |
| `foreshadow_link` | foreshadow ↔ episode/plot, context_memo | context_memo |
| `idea_archive` | content, tag | content |

### 2.3. AI 전용 (서버 only)

| 테이블 | 용도 | 암호화 |
|---|---|---|
| `episode_chunk` | 본문 청크 + 임베딩 (vector(1536)) | content (Phase 4.6) |
| `episode_summary` | 12-필드 회차 메타 | oneline_summary / summary / time_progression / cliffhanger |
| `extraction_suggestion` | agent 작가 승인 큐 | suggested_name / reviewer_note / payload (deep walk) |
| `ai_job` | 비동기 task 상태 (indexing / summary / review / generation) | — |
| `agent_session` | Sonnet planner thread | title / summary_so_far / messages (deep walk) |
| `token_receipt` | LLM 호출 영수증 | — |
| `token_receipt_line` | step 라인 (planner / tool / worker / compression) | — |
| `ai_analysis` | (스키마 존재 — 사용 코드 미구현) | — |
| `export` | 내보내기 잡 | — |

### 2.4. 확장

- `pgvector` (vector(1536)) — `episode_chunk.embedding`
- `pgcrypto` — UUID 생성 (`gen_random_uuid()`)

---

## 3. 마이그레이션 인벤토리 (16개, 시간순)

| # | 파일 | 날짜 | 내용 | 멱등 |
|---|---|---|---|---|
| 1 | `2026-05-04_plan_to_work_genres_moods.sql` | 2026-05-04 | `plan.genres/moods/slogan/target_audience` → `work` 컬럼 이전 | ✓ |
| 2 | `2026-05-04_drop_plan_table.sql` | 2026-05-04 | `plan` 테이블 폐기 (`plan_note.work_id` FK 직결) | ✓ (DROP IF EXISTS) |
| 3 | `2026-05-05_add_server_encrypted_dek.sql` | 2026-05-05 | `work.server_encrypted_dek BYTEA` (Vault Transit envelope) | ✓ |
| 4 | `2026-05-06_add_work_kind.sql` | 2026-05-06 | `work.kind VARCHAR(20)` (onboarding 식별자) | ✓ |
| 5 | `2026-05-06_episode_summary_v2.sql` | 2026-05-06 | `episode_summary` 12-필드 확장 (POV / present_chars / key_events / foreshadow / tone / keywords + raw_result + content_hash) | ✓ |
| 6 | `2026-05-07_episode_summary_jsonb_gin.sql` | 2026-05-07 | `present_characters / present_locations / keywords` GIN 인덱스 (300화+ scope 검색 가속) | ✓ |
| 7 | `2026-05-08_agent_phase4.sql` | 2026-05-08 | Phase 4 — `agent_session` + `token_receipt` + `token_receipt_line` 신설, `extraction_suggestion` 확장 (entity_type CHECK 갱신, source_agent / source_thread_id 등) | ✓ |
| 8 | `2026-05-08_drop_summary_tsv.sql` | 2026-05-08 | Phase 4.6 — `episode_summary.summary_tsv` GENERATED 컬럼 드롭 (자유텍스트 암호화로 무의미) | ✓ |
| 9 | `2026-05-08_episode_chunk_content_hash.sql` | 2026-05-08 | `episode_chunk.content_hash CHAR(64)` (chunk_and_embed idempotency) | ✓ |
| 10 | `2026-05-08_episode_status_미작성_to_예정.sql` | 2026-05-08 | `episode.status='미작성'` → `'예정'` 데이터 마이그레이션 | ✓ |
| 11 | `2026-05-08_episode_word_count_backfill.sql` | 2026-05-08 | 시드/템플릿이 word_count=0 으로 INSERT 한 stale 행 backfill | ✓ |
| 12 | `2026-05-08_suggestion_kinds_v2.sql` | 2026-05-08 | `extraction_suggestion.entity_type` CHECK 확장 (character_delete / world_note_update / world_note_delete / episode_update / episode_delete) | ✓ |
| 13 | `2026-05-08_time_progression_to_text.sql` | 2026-05-08 | `episode_summary.time_progression VARCHAR(50)` → `TEXT` (Phase 4.6 암호화로 ciphertext 길이 초과) | ✓ |
| 14 | `2026-05-09_encrypt_agent_and_suggestion.sql` | 2026-05-09 | `agent_session.title` + `extraction_suggestion.suggested_name` `VARCHAR(200)` → `TEXT` (v1: ciphertext 길이 수용) | ✓ |
| 15 | `2026-05-09_review_issue_entity_type.sql` | 2026-05-09 | `extraction_suggestion.entity_type` CHECK 에 `'review_issue'` + 누락된 `plot_create / plot_tree / plot_delete` 추가 | ✓ |
| 16 | `2026-05-09_add_refund_and_admin_audit_log.sql` | 2026-05-09 | **신규 테이블 2개** — `refund` (환불 신청·승인 워크플로우) + `admin_audit_log` (관리자 API 감사). 환불 기능 머지 동반 | ✓ (CREATE TABLE IF NOT EXISTS) |
| 17 | `2026-05-09_add_spelling_fix_entity_type.sql` | 2026-05-09 | `extraction_suggestion.entity_type` CHECK 에 `'spelling_fix'` 추가 (단건 자동 치환 — propose_spelling_fix MCP 도구) | ✓ |
| 18 | `2026-05-09_add_spelling_batch_entity_type.sql` | 2026-05-09 | `extraction_suggestion.entity_type` CHECK 에 `'spelling_batch'` 추가 (다건 체크리스트 — propose_spelling_fix_batch MCP 도구. 작가가 항목 선택 후 일괄 적용) | ✓ |

---

## 4. 적용 검증 — 핵심 체크포인트

신규 환경(EC2 prod 또는 fresh dev)에 마이그레이션이 정합하게 들어갔는지 확인하는 SQL.

### 4.1. 컬럼 존재 / 타입 검증

```sql
-- (1) 암호화 컬럼 길이 — TEXT 여야 함
SELECT table_name, column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_schema='public'
  AND (
    (table_name='work'                  AND column_name='server_encrypted_dek')                   -- BYTEA
 OR (table_name='work'                  AND column_name='kind')                                   -- VARCHAR(20)
 OR (table_name='agent_session'         AND column_name='title')                                  -- TEXT (v1: 수용)
 OR (table_name='extraction_suggestion' AND column_name='suggested_name')                         -- TEXT
 OR (table_name='episode_summary'       AND column_name='time_progression')                       -- TEXT
 OR (table_name='episode_chunk'         AND column_name='content_hash')                           -- CHAR(64)
  );
-- 기대: 6 row, 위 주석과 일치
```

### 4.2. CHECK 제약 검증 (핵심 enum)

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname IN (
  'extraction_suggestion_entity_type_check',
  'agent_session_scenario_check',
  'extraction_suggestion_status_check',
  'agent_session_status_check'
);
-- entity_type 에 'review_issue' 포함 확인 필수
-- scenario 에 'auto' 포함 확인 필수
```

기대값:
- `extraction_suggestion_entity_type_check` 에 **`review_issue`** + `plot_create / plot_tree / plot_delete` + **`spelling_fix` / `spelling_batch`** 포함
- `agent_session_scenario_check` 에 **`auto`** 포함

### 4.3. 폐기 테이블 확인

```sql
-- plan 테이블이 더 이상 존재하면 안 됨
SELECT to_regclass('public.plan');
-- 기대: NULL
```

### 4.3b. 신규 테이블 존재 확인 (2026-05-09 환불 머지)

```sql
SELECT to_regclass('public.refund'), to_regclass('public.admin_audit_log');
-- 기대: 둘 다 NOT NULL — prod 에 미적용 시 백엔드 ddl-auto=validate 단계에서 부팅 실패
```

### 4.4. 인덱스 (성능 회귀 방지)

```sql
SELECT indexname FROM pg_indexes
WHERE schemaname='public'
  AND indexname IN (
    'idx_episode_summary_present_chars',     -- JSONB GIN
    'idx_episode_summary_keywords',          -- JSONB GIN
    'idx_episode_summary_present_locs',      -- JSONB GIN
    'idx_episode_chunk_embedding',           -- ivfflat
    'idx_extraction_suggestion_thread',      -- agent thread 추적
    'idx_agent_session_writer_active',
    'idx_token_receipt_writer_time',
    'idx_episode_summary_episode_hash'       -- Phase 4.6 idempotency
  );
-- 기대: 8 row 모두
```

### 4.5. 데이터 마이그레이션 검증

```sql
-- (1) 미작성 → 예정 backfill
SELECT count(*) FROM episode WHERE status='미작성';
-- 기대: 0

-- (2) word_count 0 + 본문 있음 stale (Phase 4.6 후엔 0 이어야 함)
SELECT count(*) FROM episode WHERE word_count = 0 AND content IS NOT NULL AND length(content) > 100;
-- 기대: 0 (또는 매우 적음)
```

---

## 5. EC2 prod 배포 절차

### 5.1. Fresh deploy (DB 빈 상태)

```bash
# 1) 컨테이너 부팅
docker compose -f infra/prod/docker-compose.yml up -d postgresql

# 2) 마스터 스키마 1회 적용
docker exec -i <prod-pg-container> psql -U $DB_USERNAME -d $DB_NAME < infra/db/schema.sql

# 3) (선택) PowerSync 초기화
bash infra/db/powersync-init.sh

# → 마이그레이션 파일은 적용 불필요 (이미 마스터에 반영됨)
```

### 5.2. Incremental deploy (기존 DB 위에 새 마이그레이션만 적용)

```bash
# 1) 적용 직전 백업
docker exec <prod-pg-container> pg_dump -U $DB_USERNAME $DB_NAME \
    > backups/pre-migration-$(date +%Y%m%d-%H%M).sql

# 2) 새 마이그레이션 파일들을 사전순으로 차례 적용
for f in $(ls infra/db/migrations/2026-05-09_*.sql | sort); do
    echo "Applying $f"
    docker exec -i <prod-pg-container> psql -U $DB_USERNAME -d $DB_NAME -f - < "$f" || break
done

# 3) §4 의 검증 SQL 4개 모두 실행 — 기대값 일치 확인

# 4) 백엔드 / AI 서버 재시작
docker compose restart backend ai
```

### 5.3. 마이그레이션 추적 (현재 미구현 — 권장)

현재 적용 이력을 별도로 추적하지 않음 (`schema_migrations` 테이블 없음). Flyway / Liquibase 같은 도구를 도입하지 않은 상태에서는 **수동 추적** 필요.

**권장 도입**:
```sql
-- 향후 도입 권장 (1회만 생성)
CREATE TABLE IF NOT EXISTS schema_migrations (
    version       VARCHAR(80) PRIMARY KEY,    -- '2026-05-09_review_issue_entity_type'
    applied_at    TIMESTAMP NOT NULL DEFAULT now(),
    checksum      CHAR(64),                    -- SHA256 of file content
    duration_ms   INTEGER
);
```

**래퍼 스크립트 예시** (`infra/db/apply-migration.sh`):
```bash
#!/bin/bash
F="$1"
VER=$(basename "$F" .sql)
SHA=$(sha256sum "$F" | cut -d' ' -f1)

# 이미 적용됐으면 skip (멱등)
EXISTS=$(docker exec <pg> psql -tA -c "SELECT 1 FROM schema_migrations WHERE version='$VER'")
if [ "$EXISTS" = "1" ]; then echo "SKIP $VER (already applied)"; exit 0; fi

START=$(date +%s%3N)
docker exec -i <pg> psql -U $DB_USERNAME -d $DB_NAME -f - < "$F" || exit 1
END=$(date +%s%3N)

docker exec <pg> psql -c "INSERT INTO schema_migrations(version, checksum, duration_ms) VALUES ('$VER','$SHA',$((END-START)))"
echo "OK $VER ($((END-START))ms)"
```

도입 전까진 **README + 수동 SQL 검증**(§4) 으로 정합성 확인.

---

## 6. 알려진 정합성 이슈 / 리스크

| # | 항목 | 영향 | 조치 |
|---|---|---|---|
| 1 | `ai_analysis` 테이블 — 스키마만 존재, 사용 코드 0건 | 무용. 빈 테이블 점유만 함 | 향후 review pipeline 구현 시 활용 또는 폐기 결정 |
| 2 | 마이그레이션 추적 테이블 부재 | 어떤 환경에 어디까지 적용됐는지 수동 확인 필요 | §5.3 의 `schema_migrations` 테이블 도입 권장 |
| 3 | character_note 의 `kind`, `gender`, `age` enum CHECK 제약 없음 | 잘못된 값이 DB 들어갈 수 있음 (frontend/agent 검증 의존) | proposals.py 의 `normalizeGender` 가 1차 방어 — DB CHECK 추가 검토 |
| 4 | `extraction_suggestion.entity_type` CHECK 가 자주 변경됨 (3회: phase4 / suggestion_kinds_v2 / review_issue) | 새 entity_type 추가 시 CHECK 갱신 누락 가능 | 신규 propose_* 도구 추가 시 마이그레이션 동반 의무화 |
| 5 | encrypted_dek (BYTEA) 유무 / server_encrypted_dek 발급 race | 오프라인 신규 work 는 NULL — server-dek pending queue 로 보강 | `serverDekReconciler` + `retryPendingServerDeks` 가 자동 보정 |

---

## 7. dev / prod 정합성 비교 명령

배포 전 dev 와 prod 환경의 스키마 일치 여부 점검.

### 7.1. 컬럼 다이프

```bash
# dev
docker exec <dev-pg> psql -U storyzip -d storyzip -tA -c "
SELECT table_name||'.'||column_name||'|'||data_type||'|'||COALESCE(character_maximum_length::text,'')
FROM information_schema.columns WHERE table_schema='public'
ORDER BY table_name, ordinal_position;
" > /tmp/dev-cols.txt

# prod
docker exec <prod-pg> psql -U $DB_USERNAME -d $DB_NAME -tA -c "<same query>" > /tmp/prod-cols.txt

# 차이 확인
diff /tmp/dev-cols.txt /tmp/prod-cols.txt
# 기대: 0 lines (완전 일치)
```

### 7.2. 인덱스 다이프

```bash
docker exec <dev-pg> psql -tA -c "SELECT tablename||'.'||indexname FROM pg_indexes WHERE schemaname='public' ORDER BY 1" > /tmp/dev-idx.txt
docker exec <prod-pg> psql -tA -c "<same>" > /tmp/prod-idx.txt
diff /tmp/dev-idx.txt /tmp/prod-idx.txt
```

### 7.3. CHECK 제약 다이프

```bash
docker exec <dev-pg> psql -tA -c "
SELECT conname||'|'||pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype='c' AND connamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
ORDER BY conname;
" > /tmp/dev-check.txt
# prod 동일 → diff
```

---

## 8. 신규 마이그레이션 작성 체크리스트

새 `.sql` 파일 추가 시 반드시:

- [ ] 파일명: `YYYY-MM-DD_<짧은_kebab_이름>.sql`
- [ ] 헤더 주석: `-- Migration: <목적>` / `-- Date: YYYY-MM-DD` / `-- Owner: <이슈/플랜>`
- [ ] 멱등성 패턴 (`IF NOT EXISTS` / `IF EXISTS` / `DROP CONSTRAINT IF EXISTS`)
- [ ] 끝에 `-- 검증:` 주석으로 적용 후 확인 SQL 1개 이상
- [ ] **`infra/db/schema.sql` 마스터에도 동일 변경 반영** (가장 자주 잊는 포인트)
- [ ] 본 문서 §3 표에 신규 행 추가
- [ ] 영향받는 컬럼이 §4.1 또는 §4.2 의 검증 쿼리에 포함되도록 추가
- [ ] (해당 시) `docs/erd.md` / `docs/ddl.sql` 업데이트

---

## 9. 부록 — 빠른 참조

### 9.1. 현재 DB 스냅샷 명령

```bash
# 테이블 수 (기대: 34 — refund + admin_audit_log 추가 후)
docker exec <pg> psql -tA -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"

# 인덱스 수 (기대: ~115 — refund 3 + admin_audit_log 4 추가)
docker exec <pg> psql -tA -c "SELECT count(*) FROM pg_indexes WHERE schemaname='public'"

# pgvector 설치 확인
docker exec <pg> psql -tA -c "SELECT count(*) FROM pg_extension WHERE extname='vector'"
# 기대: 1
```

### 9.2. 비상 롤백

마이그레이션 실패 시:
1. `pg_dump` 백업 (§5.2 1단계) 으로 복원: `psql ... < backups/pre-migration-<timestamp>.sql`
2. 또는 마이그레이션 파일이 reversible 이면 직접 ROLLBACK SQL 작성 (현재 모든 파일에 ROLLBACK 절 없음 → 백업이 유일 수단)

→ 향후 신규 마이그레이션은 ROLLBACK 절을 주석으로 동반 작성 권장.

---

## 10. 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-05-09 | 초판 — 15개 마이그레이션 + 32개 테이블 인벤토리, EC2 배포 절차, 정합성 검증 SQL |
| 2026-05-09 | 환불 기능 머지 반영 — 16번 마이그레이션 추가 (`refund` + `admin_audit_log`). prod ddl-auto=validate 라 본 SQL 미적용 시 부팅 실패 — 운영 배포 전 필수 |
