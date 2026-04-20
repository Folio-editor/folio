# 신규 동기화 테이블 추가 체크리스트

PowerSync 동기화 대상 테이블을 새로 추가할 때 **반드시 수정해야 하는 9군데**를 정리한다.
하나라도 빠지면 업로드 실패(400/500), 다운링크 누락, 게스트 재매핑 누락, 로그인 판정 오류 등이 발생한다.

> `plan_note` 추가 과정에서 실제로 겪은 장애를 기반으로 작성됨 (2026-04-17).

---

## 체크리스트

### 인프라 (PostgreSQL + PowerSync)

| # | 파일 | 할 일 | 누락 시 증상 |
|---|------|-------|-------------|
| 1 | `infra/db/schema.sql` | `CREATE TABLE` + 인덱스 추가 | 테이블 자체가 없음 → 500 |
| 2 | `infra/db/powersync-init.sql` | `GRANT SELECT ON ... TO powersync_repl` 에 추가 | replication role이 읽기 불가 → 다운링크 차단 |
| 3 | `infra/db/powersync-init.sql` | `CREATE PUBLICATION powersync FOR TABLE ...` 에 추가 | WAL 이벤트 미발생 → 다운링크 차단 |
| 4 | `infra/powersync/sync-rules.yaml` | `user_workspace.data` 에 `SELECT * FROM <table> WHERE writer_id = bucket.user_id` 추가 | PowerSync가 버킷에 포함시키지 않음 → 클라이언트에 안 내려옴 |

### 백엔드 (Spring Boot)

| # | 파일 | 할 일 | 누락 시 증상 |
|---|------|-------|-------------|
| 5 | `backend/.../dto/SyncUploadRequest.java` | `@Pattern` regexp에 테이블명 추가 | Bean Validation 400 에러 |
| 6 | `backend/.../service/SyncService.java` | `switch(table)` 분기 + `process<Table>()` 메서드 추가 | `IllegalArgumentException` → 500 |
| 7 | `backend/.../controller/SyncController.java` | `TABLE_DEPTH` 에 `Map.entry("<table>", depth)` 추가 | FK 순서 미보장 → 간헐적 FK 위반 |

> Entity + Repository 파일 신규 생성도 필요하지만, 이쪽은 컴파일 에러로 즉시 발견되므로 체크리스트에서 별도로 강조하지 않음.

### 프론트엔드

| # | 파일 | 할 일 | 누락 시 증상 |
|---|------|-------|-------------|
| 8 | `frontend/src/shared/sync/schema.ts` | `new Table({...})` 정의 + `AppSchema` 등록 | 로컬 SQLite에 테이블 없음 → INSERT 실패 |
| 9 | `frontend/src/shared/stores/authStore.ts` | `WRITER_ID_TABLES` 배열에 추가 | 게스트→로그인 전환 시 writer_id 재매핑 누락 → 로컬 데이터 "사라짐" |
| 10 | `frontend/src/shared/hooks/useSyncResolver.ts` | `SYNC_TABLES` 배열에 추가 | 로그인 판정 시 행 수 오집계 → 잘못된 sync decision |

---

## 적용 후 재시작/재로드 체크

코드 수정만으로는 반영되지 않는 런타임 단계가 있다.

| 대상 | 필요 조치 | 이유 |
|------|----------|------|
| PostgreSQL | `docker compose down -v && up -d` 또는 수동 `ALTER` | `docker-entrypoint-initdb.d/` 스크립트는 최초 1회만 실행됨 |
| PowerSync 서비스 | `docker compose restart powersync` | sync-rules.yaml 은 기동 시에만 로드됨 |
| Spring Backend | 재기동 (IDE Rerun 또는 `./gradlew bootRun`) | JPA Entity 변경 반영 |
| 프론트 앱 | `Ctrl+R` 재로드 | AppSchema 변경은 PowerSync 초기화 시점에만 적용 |
| 프론트 로컬 DB | 필요 시 `__db.disconnectAndClear()` + 재로드 | 스키마 마이그레이션이 자동 적용되지 않을 경우 |

---

## 빠른 검증 절차

```bash
# 1. DB에 테이블 존재 확인
docker exec -it storyzip-postgresql-dev \
  psql -U storyzip -d storyzip -c "\dt <table_name>"

# 2. Publication에 포함 확인
docker exec -it storyzip-postgresql-dev \
  psql -U storyzip -d storyzip -c "SELECT tablename FROM pg_publication_tables WHERE pubname = 'powersync';"

# 3. 권한 확인
docker exec -it storyzip-postgresql-dev \
  psql -U storyzip -d storyzip -c "SELECT has_table_privilege('powersync_repl', '<table_name>', 'SELECT');"
```

프론트 DevTools:
```js
// 로컬 SQLite에 테이블 존재 확인
await __db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='<table_name>'")

// 행 수 확인
await __db.execute("SELECT count(*) FROM <table_name>").then(r => console.log(r.rows._array))
```

---

## 향후 개선 제안

현재 테이블 목록이 9군데에 하드코딩되어 있어 누락 위험이 높다. 장기적으로는:

1. **백엔드**: `SyncUploadRequest.@Pattern` 을 `SyncController.TABLE_DEPTH.keySet()` 기반 동적 검증으로 교체 → 2군데를 1군데로 통합
2. **프론트엔드**: `WRITER_ID_TABLES` 와 `SYNC_TABLES` 를 `AppSchema` 의 테이블 목록에서 자동 파생 → 3군데를 1군데로 통합
3. **인프라**: `powersync-init.sql` 의 GRANT/PUBLICATION 을 `schema.sql` 의 동기화 대상 테이블 정의와 연동하는 스크립트 생성
