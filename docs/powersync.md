# StoryZip — PowerSync 연동 구현 문서

> **작성 시점**: 2026-04-16 (sync 안정 검증 완료 시점 기준 최신화)
>
> **관련 문서**
> - 본 문서: PowerSync **인프라 · sync-rules · 클라이언트 연결**
> - [backend-implementation.md](./backend-implementation.md): 백엔드 전반 (`/sync/upload` · JWT kid/HS256 · 헬퍼 규약 포함)
> - ~~[sync-backend.md](./sync-backend.md)~~ *(outdated — backend-implementation.md로 대체)*
> - [sync-frontend.md](./sync-frontend.md): 클라이언트 쓰기 흐름 상세

---

## 개요

StoryZip은 **offline-first**. 사용자 작업은 100% 로컬 SQLite에 먼저 기록되고, PowerSync가 서버와 양방향 동기화한다.

- **읽기**: `useQuery('SELECT …')` → 로컬 SQLite (즉시, 네트워크 무관)
- **쓰기**:
  1. `db.execute('INSERT …')` → 로컬 SQLite
  2. PowerSync가 변경 자동 감지 → `ps_crud` 큐에 PUT/PATCH/DELETE 적재
  3. `StoryZipConnector.uploadData()` 호출 → **백엔드 `POST /api/v1/sync/upload`** 로 batch 전송
  4. 서버 커밋 → WAL → PowerSync Service → 다른 기기 `sync down`

PowerSync는 두 레이어로 구성된다:

| 레이어 | 위치 | 역할 |
|--------|------|------|
| **PowerSync Service** | Docker 컨테이너 (`:8090`) | PostgreSQL WAL 구독 → 버킷 관리 → 클라이언트 sync stream 제공 · JWT 검증 |
| **PowerSync Client SDK** | Electron 렌더러 | WASM SQLite + sync stream 수신 + `ps_crud` 큐 + `uploadData()` 콜백 |

---

## 1. 전체 아키텍처

```
┌──────────────────────────────────────────────────────────────────┐
│ Electron (렌더러 프로세스)                                        │
│                                                                  │
│  React 컴포넌트                                                   │
│    ├─ useQuery('SELECT * FROM work …')  ── 로컬 SQLite 읽기       │
│    └─ db.execute('INSERT INTO work …')  ── 로컬 SQLite 쓰기       │
│                                                                  │
│  PowerSyncDatabase (WASM SQLite + OPFS)                          │
│    ├─ ps_crud 큐 (로컬 쓰기 누적)                                  │
│    ├─ connect(StoryZipConnector)                                  │
│    │    ├─ fetchCredentials()                                     │
│    │    │     → window.storyzip.auth.getAccessToken() (IPC)       │
│    │    └─ uploadData()                                           │
│    │          └─ POST /api/v1/sync/upload (apiClient)             │
│    └─ sync stream ─────────────────────────────────────────────┐  │
└────────────────────────────────────────────────────────────────┼──┘
                  HTTPS ws sync stream (down)                    │
                  HTTP REST upload        (up → Spring Boot)     │
                                                                 │
┌────────────────────────────────────────────────────────────┐   │
│ Spring Boot (:8080)                                        │   │
│   POST /api/v1/sync/upload                                 │   │
│     ├─ JWT 검증 (Authentication.getName() = writerId)      │   │
│     ├─ FK depth 정렬 + @Transactional                       │   │
│     ├─ SyncService.process (12 테이블 UPSERT, PATCH skip)   │   │
│     └─ PostgreSQL INSERT/UPDATE/DELETE                     │   │
│           ↓                                                 │   │
│      WAL logical replication                                │   │
└───────────────────────────────┬─────────────────────────────┘   │
                                ▼                                 │
┌─────────────────────────────────────────────────────────────┐   │
│ PowerSync Service (:8090)                                   │   │
│   ├─ JWT 검증 (JWK kty:oct, alg:HS256, kid:storyzip-dev)   ◄┼───┘
│   ├─ sync-rules 기반 RLS → writer_id 필터                   │
│   ├─ PostgreSQL WAL 구독                                    │
│   └─ MongoDB 버킷 메타 저장                                 │
└─────────────────────────────────────────────────────────────┘
```

**포인트**: PowerSync 서비스는 **다운로드 전용**. 업로드(클라이언트 → 서버)는 백엔드 `/sync/upload` 엔드포인트가 담당한다. (PowerSync Open Edition은 업로드용 백엔드 SDK를 제공하지 않으므로 우리가 직접 만든 REST를 SDK가 호출하는 구조)

---

## 2. 인프라 레이어 (Docker)

### 2.1 docker-compose 서비스

```
postgresql   :5432   원본 DB, WAL logical replication 활성화
redis        :6379   Refresh Token 저장 (PowerSync와 무관)
mongo        내부    PowerSync 버킷 메타 저장소
powersync    :8090   클라이언트 sync stream 서버
backend      :8080   Spring Boot
```

PostgreSQL 기동 옵션:
```
postgres -c wal_level=logical -c max_replication_slots=4 -c max_wal_senders=4
```

### 2.2 `infra/db/powersync-init.sql`

PostgreSQL 최초 기동 시 자동 실행 (`docker-entrypoint-initdb.d/02-powersync.sql`).

```sql
-- replication 전용 role (dev: 하드코딩 비밀번호)
CREATE ROLE powersync_repl WITH LOGIN REPLICATION PASSWORD 'storyzip_repl_dev';

GRANT SELECT ON
  work, plan, world_note, "character", character_custom_field, character_tag,
  plot, episode, plot_episode_link, foreshadow, foreshadow_link, idea_archive
TO powersync_repl;

CREATE PUBLICATION powersync FOR TABLE
  work, plan, world_note, "character", character_custom_field, character_tag,
  plot, episode, plot_episode_link, foreshadow, foreshadow_link, idea_archive;
```

> `character`는 SQL 예약어 — 반드시 쌍따옴표.
> `writer`, `payment` 등 서버 전용 테이블은 publication에서 제외한다.

### 2.3 `infra/powersync/powersync.yaml`

```yaml
replication:
  connections:
    - type: postgresql
      uri: !env PS_DATA_SOURCE_URI
      sslmode: disable

storage:
  type: mongodb
  uri: !env PS_MONGO_URI

port: 8080            # 컨테이너 내부 포트 (호스트 매핑: 8090)

sync_config:
  path: /app/sync-rules.yaml

client_auth:
  jwks:
    keys:
      - kty: 'oct'
        alg: 'HS256'              # ★ 백엔드와 정확히 일치해야 함
        kid: 'storyzip-dev'       # ★ JWT header.kid와 동일 문자열
        k: !env PS_JWT_K          # JWT_SECRET을 base64url 인코딩한 값
  audience: ['powersync-dev']     # JWT payload.aud와 매칭

system:
  logging:
    level: info
    format: text
```

> **3-중 일치 규약** (하나라도 어긋나면 `PSYNC_S2101`):
> - `alg: HS256` ↔ 백엔드 `Jwts.SIG.HS256`
> - `kid: storyzip-dev` ↔ 백엔드 `jwt.key-id` (env `PS_JWT_KID`)
> - `k: base64url(JWT_SECRET)` ↔ 백엔드 `JWT_SECRET`

### 2.4 `infra/powersync/sync-rules.yaml` — writer_id 기반 RLS

```yaml
bucket_definitions:
  # writer_id 컬럼을 직접 가진 상위 엔티티
  user_workspace:
    parameters: select request.user_id() as user_id
    data:
      - select * from work         where writer_id = bucket.user_id
      - select * from plan         where writer_id = bucket.user_id
      - select * from world_note   where writer_id = bucket.user_id
      - select * from "character"  where writer_id = bucket.user_id
      - select * from plot         where writer_id = bucket.user_id
      - select * from episode      where writer_id = bucket.user_id
      - select * from foreshadow   where writer_id = bucket.user_id
      - select * from idea_archive where writer_id = bucket.user_id

  # writer_id 없는 종속 테이블은 부모 id 목록으로 간접 필터 (JOIN 제약 우회)
  character_children:
    parameters: select id as character_id from "character" where writer_id = request.user_id()
    data:
      - select * from character_custom_field where character_id = bucket.character_id
      - select * from character_tag          where character_id = bucket.character_id

  plot_children:
    parameters: select id as plot_id from plot where writer_id = request.user_id()
    data:
      - select * from plot_episode_link where plot_id = bucket.plot_id

  foreshadow_children:
    parameters: select id as foreshadow_id from foreshadow where writer_id = request.user_id()
    data:
      - select * from foreshadow_link where foreshadow_id = bucket.foreshadow_id
```

제약:
- `data` 쿼리는 **단일 테이블 SELECT만 허용** (JOIN 금지).
- `request.user_id()`는 JWT `sub` 클레임 → 백엔드 `JwtProvider.createAccessToken()`이 `writerId.toString()`을 주입.

---

## 3. JWT 인증 흐름 (PowerSync 연결)

```
Spring Boot                          PowerSync Service
  │                                        │
  │ createAccessToken(writerId)            │
  │  header:  { alg: HS256, kid: storyzip-dev }
  │  payload: { sub: writerId, aud: powersync-dev, ... }
  │  sig:     HMAC-SHA256(JWT_SECRET)     │
  │  → access token                        │
  │                                        │
Electron (렌더러)                          │
  │ StoryZipConnector.fetchCredentials()   │
  │  → getAccessToken() IPC                │
  │  → { endpoint, token }  ─────────────→ │
  │                              kid 매칭:   storyzip-dev
  │                              alg 검증:   HS256
  │                              서명 검증:  base64url(JWT_SECRET) == PS_JWT_K
  │                              aud 검증:   powersync-dev
  │                              user_id  =  sub (writerId)
  │                              → sync-rules에서 writer_id 필터 적용
```

### `PS_JWT_K` 생성
```bash
# JWT_SECRET 문자열을 UTF-8 바이트로 보고 base64url 인코딩 (패딩·개행 제거 필수)
doppler secrets get JWT_SECRET --plain | tr -d '\r\n' | \
  base64 | tr -d '=' | tr '/+' '_-'
# 또는 Node:
node -e "console.log(Buffer.from(process.env.JWT_SECRET,'utf8').toString('base64url'))"
```

> **함정**: Windows Git Bash / Doppler CLI 조합에서 값 끝에 `\r`이 붙는 경우가 있다.  
> 서명 검증이 조용히 실패(`signature verification failed`)하므로 `tr -d '=\r\n'`를 반드시 파이프로 통과시킨다.

---

## 4. 클라이언트 레이어 (Electron)

### 4.1 패키지

```bash
pnpm add @powersync/web @powersync/react
```

| 패키지 | 역할 |
|--------|------|
| `@powersync/web` | WASM SQLite(`wa-sqlite`) + sync engine + `PowerSyncDatabase` |
| `@powersync/react` | `useQuery` · `usePowerSync` · `PowerSyncContext` React 훅 |

실행 위치: **렌더러 프로세스** (브라우저 컨텍스트)  
스토리지: OPFS(Origin Private File System) 우선 → IndexedDB 자동 폴백

### 4.2 Vite 설정 (`vite.renderer.config.ts`)

```typescript
optimizeDeps: {
  exclude: ['@powersync/web'],   // WASM 모듈 pre-bundle 제외 필수
},
worker: {
  format: 'es',                  // WASM Worker ES module 형식
},
```

### 4.3 SQLite 스키마 (`src/shared/sync/schema.ts`)

PowerSync `Table` 작성 규칙:
- `id` 컬럼은 자동 추가 (TEXT PK) — 직접 정의 금지
- 모든 컬럼은 NULL 허용 (SQLite 기본값)
- JSONB 필드(Plan.genres/moods)는 `column.text` + 클라에서 `JSON.stringify`

동기화 대상 12개 테이블:

| 테이블 | 주요 컬럼 |
|--------|-----------|
| `work` | writer_id, title, status, sort_order |
| `plan` | work_id, writer_id, genres(JSON text), moods(JSON text), content |
| `world_note` | work_id, writer_id, parent_id, name, content |
| `character` | work_id, writer_id, name, gender, age, mbti, personality |
| `character_custom_field` | character_id, field_name, field_value |
| `character_tag` | character_id, world_note_id |
| `plot` | work_id, writer_id, parent_id, title, status, content |
| `episode` | work_id, writer_id, parent_id, title, status, content, word_count |
| `plot_episode_link` | plot_id, episode_id |
| `foreshadow` | work_id, writer_id, title, status, importance |
| `foreshadow_link` | foreshadow_id, link_type, episode_id, plot_id, context_memo |
| `idea_archive` | work_id, writer_id, content, tag |

### 4.4 Sync Connector (`src/renderer/sync/connector.ts`) — **실제 구현본**

```typescript
// Windows Docker에서 localhost는 IPv6 우선 해석 → 컨테이너(IPv4 bind)에서 ECONNRESET.
// 기본값을 127.0.0.1로 고정.
const POWERSYNC_URL =
  import.meta.env.VITE_POWERSYNC_URL ?? 'http://127.0.0.1:8090';

export class StoryZipConnector implements PowerSyncBackendConnector {
  /**
   * PowerSync Service 연결용 JWT + 엔드포인트 제공.
   * 토큰 없으면 tryRestore()로 갱신 시도, 그래도 없으면 throw.
   */
  async fetchCredentials() {
    let token = await window.storyzip.auth.getAccessToken();
    if (!token) {
      await window.storyzip.auth.tryRestore();
      token = await window.storyzip.auth.getAccessToken();
    }
    if (!token) throw new Error('PowerSync: 인증 토큰 없음 — 로그인 필요');

    console.log('[sync] 인증 OK, PowerSync 연결 시도:', POWERSYNC_URL);
    return { endpoint: POWERSYNC_URL, token };
  }

  /**
   * 로컬 SQLite ps_crud 큐 → 백엔드 batch 업로드.
   * PowerSync가 로컬 쓰기 감지 시 자동 호출.
   *
   * 흐름:
   *   1. getNextCrudTransaction() — 한 트랜잭션의 모든 entry 조회
   *   2. POST /api/v1/sync/upload (List<SyncUploadEntry>)
   *   3. 204 No Content → transaction.complete() → 큐 제거
   *   4. 실패 → complete() 미호출 → PowerSync 자동 재시도
   *
   * 게스트 모드(토큰 없음): 큐 누적, 로그인 후 업로드.
   *
   * writer_id 전략:
   *   - 클라이언트 UUID(work.id 등)는 그대로 전송
   *   - writer_id는 백엔드에서 JWT sub로 덮어씀 (위변조 차단)
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    const token = await window.storyzip.auth.getAccessToken();
    if (!token) {
      console.log('[uploadData] 게스트 모드 — 큐 유지');
      return;
    }

    const entries = transaction.crud.map((e) => ({
      table: e.table,
      op: e.op,                                          // 'PUT' | 'PATCH' | 'DELETE'
      id: e.id,
      data: (e.opData as Record<string, unknown>) ?? null,
    }));

    try {
      await apiClient.post('/sync/upload', entries);
      await transaction.complete();
      console.log(`[sync] uploadData ${entries.length}건 업로드 성공`);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 'network';
      console.warn(`[sync] 업로드 실패(${status}) — 재시도 예정:`, e);
      // complete() 미호출 → PowerSync가 자동 재시도 (at-least-once)
    }
  }
}
```

### 4.5 DB 싱글턴 (`src/renderer/sync/db.ts`)

```typescript
export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'storyzip.db' },
});

// DevTools 콘솔 디버깅 용
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__db = db;
}
```

사용법:
```js
// ps_crud 큐 적재 확인 (업로드 대기 중인 항목)
__db.execute('SELECT * FROM ps_crud').then(r => console.table(r.rows._array))
```

### 4.6 라이프사이클 — **syncDecision 게이팅**

로그인만으로 `db.connect()`를 호출하면, 로컬 게스트 데이터가 즉시 업로드되면서 서버 기존 데이터와 섞일 수 있다.  
그래서 `authStore.syncDecision`이 결정되기 전까지 connect를 **게이팅**한다.

`src/renderer/App.tsx`:
```typescript
useEffect(() => {
  const canConnect = isAuthenticated && syncDecision !== null;
  if (canConnect) {
    void db.connect(connector);
  } else if (!isAuthenticated) {
    void db.disconnect();
  }
  // isAuthenticated && syncDecision === null: 사용자 결정 대기 → 아무 동작 없음
}, [isAuthenticated, syncDecision]);
```

#### syncDecision이 확정되는 4 시나리오

| # | 로컬 게스트 행 | `isNewUser` | 자동 결정 | UI |
|---|---------------|-------------|-----------|-----|
| 1 | 0 | true | `use-local` (스킵) | 없음 |
| 2 | 0 | false | `use-server` | 토스트 |
| 3 | >0 | true | `use-local` 자동 (writer_id 일괄 UPDATE) | 없음 |
| 4 | >0 | false | 사용자 선택 | `SyncDecisionDialog` |

`useSyncResolver` 훅이 로그인 직후 자동 판별:
```typescript
if (isNewUser) { await resolveSyncDecision('use-local'); return; }   // 시나리오 1·3
const count = await countRows(db, previousGuestId);                    // 게스트 행 수
if (count === 0) { await resolveSyncDecision('use-server'); return; } // 시나리오 2
setState({ showDialog: true });                                       // 시나리오 4
```

`resolveSyncDecision('use-local')`의 핵심 단계:
```typescript
// writer_id가 게스트 UUID로 기록된 모든 행을 실제 사용자 UUID로 UPDATE
// → ps_crud 큐에 PATCH가 적재됨 → 로그인 후 connect 시 uploadData로 서버 반영
for (const table of WRITER_ID_TABLES) {
  await db.execute(
    `UPDATE ${table} SET writer_id = ? WHERE writer_id = ?`,
    [userId, previousGuestId],
  );
}
```

### 4.7 로그아웃

로컬 SQLite는 **삭제하지 않는다**. 재로그인 시 증분 sync로 빠르게 복구.  
(계정 탈퇴 시에만 `db.disconnectAndClear()` + 파일 삭제 — 후속 구현)

---

## 5. 게스트 모드

### 5.1 개요

로그인 없이 앱을 처음 실행하면 **게스트 모드**로 자동 진입한다.

```
앱 최초 실행
  └─ tryRestore() 실패 (저장된 refresh token 없음)
       └─ getOrCreateGuestId() — userData/guest-id.txt에 UUID 생성·저장
            └─ isGuest = true, guestWriterId = UUID
                 └─ 편집 화면 즉시 진입
```

앱 재시작 시 동일한 guest UUID가 유지된다.

### 5.2 모드별 동작 비교

| 기능 | 게스트 | 로그인 |
|------|-------|--------|
| 로컬 SQLite 읽기/쓰기 | ✅ | ✅ |
| PowerSync `connect()` | ❌ | ✅ (syncDecision 확정 후) |
| 서버 자동 백업 | ❌ | ✅ |
| 다기기 동기화 | ❌ | ✅ |
| 내보내기·공유 | ❌ | ✅ (추후) |

### 5.3 쓰기 경로 — 게스트/로그인 **동일**

과거에는 "로그인: apiClient, 게스트: SQLite 직접" 이원화였으나,  
**현재는 양쪽 모두 SQLite 직접 쓰기**로 단일화됐다. PowerSync가 업로드를 담당:

```typescript
const writerId = useWriterId();    // guest UUID 또는 real UUID
const db       = usePowerSync();

async function createWork(title: string) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO work (id, writer_id, title, status, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, '연재중', 0, ?, ?)`,
    [id, writerId, title, now, now],
  );
  // useQuery가 자동 반응. 로그인 상태면 PowerSync가 ps_crud → uploadData → 서버
}
```

---

## 6. 게스트 → 로그인 전환 (신규 방식)

### 6.1 구 방식 폐기

과거 `migrate.ts`가 REST API (`POST /works`, `POST /world-notes` 등)를 개별 호출하며 서버가 발급한 새 ID로 매핑하는 복잡한 트리 순회 방식을 사용했다.  
→ **폐기.** 다음 이유로 유지 비용이 과도했다:
- 12 테이블 × 각자 REST 엔드포인트 필요
- 자기참조 트리(world_note/plot/episode) BFS
- 부분 실패 재시도용 `migration_log` 테이블
- 서버가 UUID를 재발급 → guestId→serverId 매핑 테이블 유지 필요

### 6.2 신규 방식 (현 구현)

**핵심 통찰**: 클라이언트 UUID를 그대로 서버에 저장하도록 백엔드를 바꿨으므로 (백엔드 `@GeneratedValue` 미사용), `writer_id`만 게스트 UUID → 사용자 UUID로 **일괄 UPDATE**하면 된다. FK 참조(work_id, character_id 등)는 건드릴 필요 없음.

```typescript
// resolveSyncDecision('use-local')
await db.writeTransaction(async (tx) => {
  for (const table of [
    'work', 'plan', 'world_note', 'character',
    'plot', 'episode', 'foreshadow', 'idea_archive',
  ]) {
    await tx.execute(
      `UPDATE ${table} SET writer_id = ? WHERE writer_id = ?`,
      [userId, previousGuestId],
    );
  }
});
// 이후 db.connect(connector) → PowerSync가 UPDATE를 PATCH로 감지
// → ps_crud 큐 → uploadData → POST /sync/upload → 서버 반영
```

| 테이블 | writer_id 보유 | UPDATE 대상 |
|--------|--------------|-------------|
| work, plan, world_note, character, plot, episode, foreshadow, idea_archive | ✅ | 8개 |
| character_custom_field, character_tag, plot_episode_link, foreshadow_link | ❌ | 부모의 writer_id로 간접 소유 (sync-rules parameters 쿼리가 자동 필터) |

### 6.3 서버 쪽 안전장치

- 백엔드 `SyncService`는 들어오는 `writer_id`를 **무시하고 JWT sub로 덮어쓴다** — 클라이언트 변조 불가.
- `PATCH`가 고아(서버에 해당 id 없음)일 경우 스킵 — PowerSync가 보낸 중복 PATCH도 안전.

---

## 7. 읽기 경로 — `useQuery` 사용법

```typescript
import { useQuery } from '@powersync/react';

export function WorkList() {
  const writerId = useWriterId();   // guest or real UUID

  const { data: works, isLoading } = useQuery(
    'SELECT * FROM work WHERE writer_id = ? ORDER BY sort_order',
    [writerId ?? ''],
  );

  if (isLoading) return <div>동기화 중…</div>;
  return <ul>{works.map((w) => <li key={w.id}>{w.title}</li>)}</ul>;
}
```

`useQuery`는 **반응형**이다. 해당 테이블 변경이 감지되면 자동 재렌더.

### JSONB 컬럼 파싱
```typescript
const genres: string[] = JSON.parse(plan.genres ?? '[]');
const moods:  string[] = JSON.parse(plan.moods  ?? '[]');
```

---

## 8. 오프라인 동작

| 상태 | 읽기 | 쓰기 |
|------|------|------|
| 온라인 · 로그인 | 로컬 SQLite (즉시) | SQLite → `ps_crud` → `uploadData` → 서버 (수 초) |
| 오프라인 · 로그인 | 로컬 SQLite (정상) | SQLite → `ps_crud` 누적 → 복귀 시 일괄 업로드 |
| 게스트 | 로컬 SQLite | SQLite (누적) → 로그인 후 `resolveSyncDecision` 결정에 따라 업로드 |
| 복귀 후 | — | `uploadData` 자동 호출 + sync down 증분 |

**at-least-once 보장**: 업로드 응답을 못 받으면 재시도. 백엔드 UPSERT는 멱등이므로 중복 수신해도 결과 동일.

---

## 9. 개발 환경 실행 및 검증

### 9.1 인프라 기동

```bash
cd infra/dev
doppler run -- docker compose -f docker-compose.dev.yml up -d

# 4개 서비스 모두 healthy 확인
docker compose ps

# PowerSync 헬스체크
curl http://127.0.0.1:8090/probes/liveness     # 200
curl http://127.0.0.1:8090/probes/readiness    # 200
```

### 9.2 Replication 상태 확인

```bash
# replication slot (PowerSync 기동 후 1개 생성됨)
docker exec -it storyzip-postgresql-dev psql -U storyzip -d storyzip -c \
  "SELECT slot_name, plugin, active FROM pg_replication_slots;"

# publication 테이블 (12개)
docker exec -it storyzip-postgresql-dev psql -U storyzip -d storyzip -c \
  "SELECT tablename FROM pg_publication_tables WHERE pubname='powersync';"
```

### 9.3 Electron 실행

```bash
cd frontend && pnpm dev
```

### 9.4 DevTools 검증 루틴

```js
// 1. 로컬 작성 직후 ps_crud 쌓였는지
__db.execute('SELECT * FROM ps_crud').then(r => console.table(r.rows._array))

// 2. 잠시 후 비어 있는지 (업로드 성공)
//    Console에 `[sync] uploadData N건 업로드 성공` 로그 동반

// 3. 다른 기기/브라우저에서 sync down 반영 확인
__db.execute('SELECT count(*) FROM work').then(r => console.log(r.rows._array))
```

### 9.5 PostgreSQL 검증
```bash
docker exec -it storyzip-postgresql-dev psql -U storyzip -d storyzip -c \
  "SELECT id, title, writer_id FROM work ORDER BY updated_at DESC LIMIT 5;"
```

---

## 10. 트러블슈팅

### `PSYNC_S2101` — algorithm mismatch / no key matched kid / signature verification failed

| 증상 | 원인 | 해결 |
|------|------|------|
| `algorithm mismatch` | `Keys.hmacShaKeyFor`가 키 길이 보고 HS384/512 자동 선택 | 백엔드 `signWith(key(), Jwts.SIG.HS256)` 명시 |
| `no key matched the token KID` | JWT header에 kid 없음 / yaml과 불일치 | `application.yml: jwt.key-id: storyzip-dev` + `JwtProvider.header().keyId(...)` |
| `signature verification failed` | `PS_JWT_K`에 CRLF(`\r`) 섞임 | `JWT_SECRET \| tr -d '=\r\n' \| base64url` 재생성 |

`application.yml`의 `jwt.key-id` 는 `powersync.yaml`의 `jwks.keys[].kid`와 **정확히 동일 문자열**.

### 401 Unauthorized

| 원인 | 확인 |
|------|------|
| JWT 만료 (AT 기본 30분) | `tryRestore()`가 refresh 하도록 connector 가드 이미 반영됨 |
| `aud` 누락 | 백엔드 `jwt.audience` 세팅 확인 |
| PS_JWT_K 인코딩 오류 | 위 `PSYNC_S2101` 케이스 |

### 컨테이너 env 변경 후에도 구 값 사용

`docker compose restart`는 env 갱신 안 됨 → **재생성** 필요.
```bash
docker compose stop powersync backend
docker compose rm -f powersync backend
doppler run -- docker compose up -d powersync backend
# 또는
doppler run -- docker compose up -d --force-recreate powersync backend
```

확인:
```bash
docker exec storyzip-powersync-dev printenv PS_JWT_K | head -c 20
docker exec storyzip-backend-dev printenv JWT_SECRET | head -c 20
```

### Windows localhost → ECONNRESET

일부 Windows 환경에서 `localhost`가 IPv6(`::1`)로 우선 해석되는데 컨테이너는 IPv4 bind.  
→ 프론트 기본 URL을 `http://127.0.0.1:*`로 고정.  
Doppler `VITE_POWERSYNC_URL`, `VITE_API_URL`도 `127.0.0.1` 사용.

### WASM Worker Vite 로딩 오류

```
Failed to load module script: Expected a JavaScript module script…
```

`vite.renderer.config.ts`:
```typescript
optimizeDeps: { exclude: ['@powersync/web'] },
worker:       { format: 'es' },
```

### OPFS 미지원

IndexedDB로 자동 폴백. 콘솔 `OPFS not supported` 메시지 출력되지만 기능 영향 없음.

### Replication slot 없음 / publication 없음

```
`powersync-init.sql`이 실행되지 않음 (기존 pgdata 볼륨 재사용)
```

```bash
# 전체 초기화 (dev only)
docker compose down -v && doppler run -- docker compose up -d

# 또는 수동 주입 (데이터 유지)
docker exec -i storyzip-postgresql-dev psql -U storyzip -d storyzip \
  < infra/db/powersync-init.sql
```

### 업로드는 성공했는데 다른 기기에 안 내려옴

| 원인 | 확인 |
|------|------|
| sync-rules의 bucket 변경 후 재배포 안 됨 | `docker compose restart powersync` |
| 해당 테이블이 publication에서 빠짐 | `SELECT * FROM pg_publication_tables` |
| writer_id가 틀림 | `SELECT writer_id, count(*) FROM work GROUP BY 1;` |

---

## 11. 파일 맵

| 파일 | 역할 |
|------|------|
| `infra/db/powersync-init.sql` | replication role + publication |
| `infra/powersync/powersync.yaml` | PowerSync Service 설정 (JWK, storage, replication) |
| `infra/powersync/sync-rules.yaml` | writer_id 기반 RLS bucket 정의 |
| `infra/dev/docker-compose.dev.yml` | postgres/mongo/powersync/backend |
| `backend/src/main/java/com/storyzip/auth/jwt/JwtProvider.java` | HS256 + kid 명시 JWT 발급 |
| `backend/src/main/java/com/storyzip/sync/controller/SyncController.java` | `POST /sync/upload` batch + depth sort |
| `backend/src/main/java/com/storyzip/sync/service/SyncService.java` | 12 테이블 UPSERT + PATCH skip |
| `frontend/src/shared/sync/schema.ts` | PowerSync SQLite 스키마 (12 테이블) |
| `frontend/src/renderer/sync/connector.ts` | JWT 제공 + `uploadData` 구현 |
| `frontend/src/renderer/sync/db.ts` | PowerSyncDatabase 싱글턴 + DevTools `__db` |
| `frontend/src/renderer/App.tsx` | PowerSyncContext + syncDecision 게이팅 |
| `frontend/src/shared/hooks/useSyncResolver.ts` | 로그인 후 자동 판별 (4 시나리오) |
| `frontend/src/shared/features/auth/SyncDecisionDialog.tsx` | 시나리오 4 — 사용자 선택 UI |
| `frontend/src/shared/stores/authStore.ts` | `syncDecision` 상태 + `resolveSyncDecision` |
| `frontend/vite.renderer.config.ts` | WASM Worker 설정 |

---

## 12. 의도적으로 제외한 것

- **PowerSync Cloud(유료) 기능** — dev는 Self-hosted Open Edition.
- **Conflict resolution UI** — PowerSync 기본 last-write-wins + `updated_at` 사용. 동시 편집 UX는 차기.
- **Sync 진행률/상태 바** — 현재는 Console 로그만. 필요 시 `SyncStatus` observable 구독.
- **양방향 병합 도구** — 시나리오 4에서 `use-local`이 서버 기존 + 로컬을 합치는 것은 사용자 책임.
- **테이블별 버킷 세분화** — 현재 단일 `user_workspace` 버킷. 작품별 분리 등은 데이터 폭증 시 재검토.
