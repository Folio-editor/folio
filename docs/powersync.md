# StoryZip — PowerSync 연동 구현 문서

> **관련 문서**
> - 본 문서: PowerSync **인프라/스키마/연결 설정**
> - [sync-backend.md](./sync-backend.md): 백엔드 `POST /api/v1/sync/upload` API 구현
> - [sync-frontend.md](./sync-frontend.md): 클라이언트 connector + 쓰기 흐름

## 개요

StoryZip은 오프라인 우선(offline-first) 설계를 목표로 **PowerSync Open Edition**을 채택했다.
작가가 네트워크 없이 원고를 작성해도 로컬 SQLite에서 읽기가 가능하고, 온라인 복귀 후 백엔드 API로 쓰기를 보내면
PowerSync가 PostgreSQL 변경사항을 자동으로 Electron 클라이언트에 반영한다.

PowerSync는 두 레이어로 구성된다:

| 레이어 | 위치 | 역할 |
|--------|------|------|
| **PowerSync Service** | Docker 컨테이너 | PostgreSQL WAL 구독 → 버킷 관리 → 클라이언트에 sync stream 제공 |
| **PowerSync Client SDK** | Electron 렌더러 프로세스 | WASM SQLite + sync stream 수신 → 로컬 SQLite 유지 |

---

## 전체 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│  Electron (렌더러 프로세스)                                    │
│                                                              │
│  React 컴포넌트                                               │
│    └─ useQuery('SELECT * FROM work …')   ←─ 로컬 SQLite 읽기 │
│                                                              │
│  PowerSyncDatabase  (WASM SQLite + OPFS)                     │
│    ├─ connect(StoryZipConnector)                              │
│    │    └─ fetchCredentials()  →  window.storyzip.auth.      │
│    │                               getAccessToken() (IPC)    │
│    └─ sync stream  ────────────────────────────────────────┐ │
└────────────────────────────────────────────────────────────┼─┘
                                                             │
                                              HTTPS sync stream
                                                             │
┌────────────────────────────────────────────────────────────┼─┐
│  PowerSync Service (Docker :8090)                          │ │
│    ├─ JWT 검증 (HS256, Spring Boot와 동일 시크릿)           ◄─┘ │
│    ├─ sync-rules 기반 RLS → writer_id 필터                  │
│    └─ logical replication 구독  ────────────────────────┐   │
└────────────────────────────────────────────────────────┼───┘
                                                         │
                                            PostgreSQL WAL stream
                                                         │
┌────────────────────────────────────────────────────────┼───┐
│  PostgreSQL :5432                                       │   │
│    ├─ wal_level=logical                                 │   │
│    ├─ ROLE powersync_repl (REPLICATION)                ◄───┘ │
│    └─ PUBLICATION powersync (12개 테이블)               │   │
└────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  MongoDB (Docker, 내부 통신 전용)                             │
│    └─ PowerSync 버킷 메타데이터 저장소                        │
└──────────────────────────────────────────────────────────────┘

쓰기 경로 (PowerSync 미사용):
  Electron  →  apiClient.post/put/delete  →  Spring Boot  →  PostgreSQL
                                                               └→ WAL → PowerSync → SQLite (읽기 반영)
```

---

## 인프라 레이어 (Docker)

### docker-compose.dev.yml 서비스

```
postgresql   :5432   — 원본 DB, WAL logical replication 활성화
redis        :6379   — Refresh Token 저장 (PowerSync와 무관)
mongo        내부    — PowerSync 버킷 메타 저장소 (호스트 포트 미노출)
powersync    :8090   — 클라이언트 sync stream 서버
```

PostgreSQL은 다음 옵션으로 기동한다:
```
postgres -c wal_level=logical -c max_replication_slots=4 -c max_wal_senders=4
```

### infra/db/powersync-init.sql

PostgreSQL 최초 기동 시(`docker-entrypoint-initdb.d/02-powersync.sql`) 자동 실행된다.

```sql
-- replication 전용 role (dev: 하드코딩 비밀번호)
CREATE ROLE powersync_repl WITH LOGIN REPLICATION PASSWORD 'storyzip_repl_dev';

-- 12개 테이블에 SELECT 권한
GRANT SELECT ON
  work, plan, world_note, "character", character_custom_field, character_tag,
  plot, episode, plot_episode_link, foreshadow, foreshadow_link, idea_archive
TO powersync_repl;

-- publication (writer, payment 등 서버 전용 테이블 제외)
CREATE PUBLICATION powersync FOR TABLE
  work, plan, world_note, "character", character_custom_field, character_tag,
  plot, episode, plot_episode_link, foreshadow, foreshadow_link, idea_archive;
```

> `character`는 SQL 예약어이므로 큰따옴표로 쿼팅한다.

### infra/powersync/powersync.yaml

```yaml
replication:
  connections:
    - type: postgresql
      uri: postgresql://powersync_repl:storyzip_repl_dev@postgresql:5432/storyzip
      sslmode: disable

storage:
  type: mongodb
  uri: mongodb://mongo:27017/powersync

port: 8080  # 컨테이너 내부 포트 (호스트는 PS_PORT=8090)

sync_config:
  path: /app/sync-rules.yaml

client_auth:
  jwks:
    keys:
      - kty: 'oct'
        alg: 'HS256'
        kid: 'storyzip-dev'
        k: !env PS_JWT_K   # JWT_SECRET 문자열을 base64url 인코딩한 값
  audience: ['powersync-dev']
```

### infra/powersync/sync-rules.yaml

writer_id 기반 Row-Level Security. `request.user_id()`는 JWT `sub` 클레임에서 추출되며,
Spring Boot `JwtProvider`가 `.subject(writerId.toString())`으로 UUID를 넣는다.

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

  # character에 종속 — 내 character id 목록으로 필터 (JOIN 불가 제약 우회)
  character_children:
    parameters: select id as character_id from "character" where writer_id = request.user_id()
    data:
      - select * from character_custom_field where character_id = bucket.character_id
      - select * from character_tag          where character_id = bucket.character_id

  # plot에 종속
  plot_children:
    parameters: select id as plot_id from plot where writer_id = request.user_id()
    data:
      - select * from plot_episode_link where plot_id = bucket.plot_id

  # foreshadow에 종속
  foreshadow_children:
    parameters: select id as foreshadow_id from foreshadow where writer_id = request.user_id()
    data:
      - select * from foreshadow_link where foreshadow_id = bucket.foreshadow_id
```

---

## JWT 인증 흐름

```
Spring Boot                          PowerSync Service
  │                                        │
  │ createAccessToken(writerId)            │
  │  - sub = writerId (UUID 문자열)        │
  │  - aud = ["powersync-dev"]             │
  │  - alg = HS256, secret = JWT_SECRET    │
  │  → access token                        │
  │                                        │
Electron (렌더러)                          │
  │ StoryZipConnector.fetchCredentials()   │
  │  → getAccessToken() IPC               │
  │  → { endpoint, token }  ─────────────→│
  │                              JWT 검증: │
  │                                alg HS256
  │                                k = base64url(JWT_SECRET)
  │                                aud = powersync-dev
  │                              user_id = sub (writerId)
  │                              sync-rules에서 writer_id 필터링
```

`PS_JWT_K` 생성:
```bash
node -e "console.log(Buffer.from(process.env.JWT_SECRET, 'utf8').toString('base64url'))"
```

---

## 클라이언트 레이어 (Electron)

### 패키지

```bash
pnpm add @powersync/web @powersync/react
```

| 패키지 | 역할 |
|--------|------|
| `@powersync/web` | WASM SQLite(`@journeyapps/wa-sqlite`) + sync engine + `PowerSyncDatabase` |
| `@powersync/react` | `useQuery`, `usePowerSync`, `PowerSyncContext` React 훅 |

실행 위치: **렌더러 프로세스** (브라우저 컨텍스트)  
스토리지: OPFS(Origin Private File System) 우선 → IndexedDB 자동 폴백

### Vite 설정 (vite.renderer.config.ts)

```typescript
optimizeDeps: {
  exclude: ['@powersync/web'],  // WASM 모듈 pre-bundle 제외
},
worker: {
  format: 'es',  // WASM Worker ES module 형식
},
```

### SQLite 스키마 (src/shared/sync/schema.ts)

PowerSync `Table`의 규칙:
- `id` 컬럼은 자동 추가 (TEXT PK) — 직접 정의하지 않음
- 모든 컬럼은 NULL 허용 (SQLite 기본값)
- `string[]` 타입은 `column.text` + JSON 직렬화

동기화 대상 12개 테이블:

| 테이블 | 주요 컬럼 |
|--------|-----------|
| `work` | writer_id, title, status, sort_order |
| `plan` | work_id, writer_id, genres(JSON), moods(JSON), content |
| `world_note` | work_id, writer_id, parent_id, name, content |
| `character` | work_id, writer_id, name, gender, age, mbti |
| `character_custom_field` | character_id, field_name, field_value |
| `character_tag` | character_id, world_note_id |
| `plot` | work_id, writer_id, parent_id, title, status, content |
| `episode` | work_id, writer_id, parent_id, title, status, content, word_count |
| `plot_episode_link` | plot_id, episode_id |
| `foreshadow` | work_id, writer_id, title, status, importance |
| `foreshadow_link` | foreshadow_id, link_type, episode_id, plot_id |
| `idea_archive` | work_id, writer_id, content, tag |

### Sync Connector (src/renderer/sync/connector.ts)

```typescript
export class StoryZipConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    let token = await window.storyzip.auth.getAccessToken();
    if (!token) {
      // 토큰 만료 → tryRestore()로 갱신
      await window.storyzip.auth.tryRestore();
      token = await window.storyzip.auth.getAccessToken();
    }
    if (!token) throw new Error('PowerSync: 인증 토큰 없음');
    return {
      endpoint: import.meta.env.VITE_POWERSYNC_URL ?? 'http://localhost:8090',
      token,
    };
  }

  async uploadData(_database: AbstractPowerSyncDatabase): Promise<void> {
    // 로컬 직접 쓰기 없음 → CRUD 큐 항상 비어있음
    // 향후 오프라인 쓰기 지원 시 apiClient 호출 구현
  }
}
```

`getAccessToken()`은 기존 auth IPC를 그대로 재사용 — 새 IPC 채널 불필요.

### DB 싱글턴 (src/renderer/sync/db.ts)

```typescript
import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from '@shared/sync/schema';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'storyzip.db' },
});
```

### 라이프사이클 (src/renderer/App.tsx)

```typescript
const connector = new StoryZipConnector();

// isAuthenticated true → PowerSync 연결
// isAuthenticated false (로그아웃) → 연결 해제
useEffect(() => {
  if (isAuthenticated) {
    void db.connect(connector);
  } else {
    void db.disconnect();
  }
}, [isAuthenticated]);

// 앱 전체를 PowerSyncContext로 감싸 하위에서 useQuery 사용 가능
return (
  <PowerSyncContext.Provider value={db}>
    <MemoryRouter>…</MemoryRouter>
  </PowerSyncContext.Provider>
);
```

로그아웃 시 로컬 SQLite는 삭제하지 않는다. 재로그인 시 증분 sync만 수행해 빠르게 복구된다.
계정 탈퇴 시에만 SQLite 파일을 삭제한다 (후속 구현).

---

## 읽기 경로 — useQuery 사용법

```typescript
import { useQuery } from '@powersync/react';
import { useAuthStore } from '@shared/stores/authStore';

export function WorkList() {
  const writerId = useAuthStore((s) => s.writer?.id);

  const { data: works, isLoading } = useQuery(
    'SELECT * FROM work WHERE writer_id = ? ORDER BY sort_order',
    [writerId ?? ''],
  );

  if (isLoading) return <div>동기화 중…</div>;
  return <ul>{works.map((w) => <li key={w.id}>{w.title}</li>)}</ul>;
}
```

`useQuery`는 **반응형**이다. PowerSync가 해당 테이블에 변경을 감지하면 컴포넌트가 자동으로 재렌더링된다.

### JSON 컬럼 파싱 (genres, moods)

`plan` 테이블의 `genres`, `moods`는 PostgreSQL JSONB → SQLite TEXT(JSON)으로 저장된다.

```typescript
const genres: string[] = JSON.parse(plan.genres ?? '[]');
const moods: string[] = JSON.parse(plan.moods ?? '[]');
```

---

## 쓰기 경로

모든 쓰기는 기존 `apiClient`(HTTP)를 경유한다.

```
Electron 렌더러
  └─ apiClient.post('/works', { title, … })
       └─ Spring Boot → PostgreSQL UPDATE
            └─ WAL → PowerSync Service → sync stream
                 └─ Electron SQLite 자동 갱신 (수 초 내)
```

컴포넌트 예시:
```typescript
import { apiClient } from '@shared/lib/apiClient';
import { useAuthStore } from '@shared/stores/authStore';

async function createWork(title: string) {
  await apiClient.post('/works', { title });
  // useQuery가 자동으로 반응 — 별도 상태 업데이트 불필요
}
```

---

## 오프라인 동작

| 상태 | 읽기 | 쓰기 |
|------|------|------|
| 온라인 | 로컬 SQLite (즉시) | apiClient → 서버 → sync 반영 |
| 오프라인 | 로컬 SQLite (정상) | apiClient 실패 → UI에서 재시도 안내 |
| 오프라인→온라인 복귀 | — | PowerSync 자동 증분 sync |

오프라인 중 쓰기 큐(CRUD queue)는 현재 구현하지 않는다.
필요 시 `uploadData` 콜백에서 apiClient를 호출하도록 확장한다.

---

## 게스트 모드

### 개요

로그인 없이 앱을 처음 실행하면 **게스트 모드**로 자동 진입한다.
게스트 모드에서는 모든 로컬 편집 기능을 사용할 수 있으며, 클라우드 저장·동기화만 비활성화된다.

```
앱 최초 실행
  └─ tryRestore() 실패 (저장된 refresh token 없음)
       └─ getOrCreateGuestId() → userData/guest-id.txt 에 UUID 생성·저장
            └─ isGuest = true, guestWriterId = 생성된 UUID
                 └─ 편집 화면 즉시 진입 (로그인 화면 없음)
```

앱 재시작 시 동일한 guest UUID가 유지되어 이전 로컬 데이터에 계속 접근할 수 있다.

### 모드별 동작 비교

| 기능 | 게스트 모드 | 로그인 모드 |
|------|-------------|-------------|
| 편집 화면 진입 | 즉시 | 즉시 (자동 복원 성공 시) |
| 로컬 SQLite 읽기 | ✅ | ✅ |
| 로컬 SQLite 쓰기 (`db.execute`) | ✅ | ✅ |
| 클라우드 저장 (API → PostgreSQL) | ❌ | ✅ |
| PowerSync sync (서버 → SQLite) | ❌ | ✅ |
| 다기기 동기화 | ❌ | ✅ |
| 내보내기·공유 | ❌ | ✅ |

### 앱 모드 상태 전이

```
[isRestoring]  앱 시작, tryRestore 실행 중
     │
     ├─ 성공 → [authenticated]  PowerSync connect, 편집 화면
     │
     └─ 실패 → [guest]  로컬 전용 편집 화면
                  │
                  ├─ 로그인 버튼 클릭 → 마이그레이션 → [authenticated]
                  │
                  └─ (로그아웃 시 다시 [guest]로 복귀, 로그인 화면 없음)
```

### 게스트 모드 쓰기 경로

로그인 모드와 달리 서버 API를 거치지 않고 SQLite에 직접 쓴다.

```typescript
// 에디터 기능 컴포넌트 내부 패턴
const writerId = useWriterId();   // guest UUID 또는 real UUID
const isGuest  = useIsGuest();
const db       = usePowerSync();

async function createWork(title: string) {
  if (isGuest) {
    // 게스트: SQLite 직접 INSERT
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO work (id, writer_id, title, status, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', 0, ?, ?)`,
      [id, writerId, title, now, now],
    );
  } else {
    // 로그인: API → PostgreSQL → PowerSync sync → SQLite
    await apiClient.post('/works', { title });
  }
}
```

---

## 게스트 → 로그인 마이그레이션

### 왜 단순 writer_id 교체로는 안 되는가

게스트 데이터를 서버로 올리면 **서버가 새 UUID를 발급한다.**
따라서 `writer_id` 하나만 바꾸는 것으로는 부족하고, 테이블 간 FK(외래 키) 참조도 전부 새 ID로 교체해야 한다.

**예시 — 게스트 SQLite 상태:**

```
work         id="W1"  writer_id=guestId
  episode    id="E1"  work_id="W1"          ← W1 참조
  episode    id="E2"  work_id="W1"          ← W1 참조
               foreshadow_link  episode_id="E2"  ← E2 참조
  character  id="C1"  work_id="W1"          ← W1 참조
               character_custom_field  character_id="C1"  ← C1 참조
```

**단순히 writer_id만 교체하면 (잘못된 방식):**

```
POST /works { title, writer_id: realId }
  → 서버 응답: id="W9999"  (서버가 새 UUID 발급)

POST /episodes { work_id: "W1", ... }
  → 서버: work_id="W1"인 work가 없음 → FK 오류 또는 고아 레코드 생성
```

**PowerSync가 서버 데이터를 내려받으면:**

```
SQLite:
  work    id="W9999"               ← 서버 ID로 정상 생성
  episode work_id="W1"             ← W9999를 가리키지 않음 (연결 끊김)
  episode work_id="W1"             ← 동일하게 끊김
```

### 올바른 마이그레이션 — ID 매핑 + 트리 순회

테이블 간 의존 관계가 트리 구조이므로 **부모를 먼저 업로드하고 발급받은 서버 ID를 매핑 테이블에 저장**한 뒤, 자식 업로드 시 매핑된 ID를 사용해야 한다.

**의존 트리 (업로드 순서):**

```
1. work                     (독립)
   ├─ 2. plan               (work_id → work)
   ├─ 3. world_note         (work_id → work, parent_id → world_note 자기참조)
   ├─ 4. character          (work_id → work)
   │    ├─ 5. character_custom_field  (character_id → character)
   │    └─ 6. character_tag          (character_id → character, world_note_id → world_note)
   ├─ 7. plot               (work_id → work, parent_id → plot 자기참조)
   ├─ 8. episode            (work_id → work, parent_id → episode 자기참조)
   │    └─ 9. plot_episode_link      (plot_id → plot, episode_id → episode)
   ├─ 10. foreshadow        (work_id → work)
   │    └─ 11. foreshadow_link       (foreshadow_id → foreshadow,
   │                                  episode_id → episode, plot_id → plot)
   └─ 12. idea_archive      (work_id → work)
```

**올바른 마이그레이션 알고리즘 (의사코드):**

```typescript
const idMap = new Map<string, string>(); // guestId → serverId

// 1단계: work 업로드
for (const work of guestWorks) {
  const { id: serverId } = await apiClient.post('/works', {
    title: work.title, ...
  });
  idMap.set(work.id, serverId);  // "W1" → "W9999"
}

// 2단계: plan 업로드 (work_id 교체)
for (const plan of guestPlans) {
  await apiClient.post('/works/' + idMap.get(plan.work_id) + '/plan', {
    ...plan,
    workId: idMap.get(plan.work_id),  // "W1" → "W9999"
  });
}

// 3단계: world_note 업로드 (트리 자기참조 — 루트부터 BFS)
const rootNotes = guestWorldNotes.filter(n => !n.parent_id);
const queue = [...rootNotes];
while (queue.length > 0) {
  const note = queue.shift()!;
  const { id: serverId } = await apiClient.post('/world-notes', {
    workId:   idMap.get(note.work_id),
    parentId: note.parent_id ? idMap.get(note.parent_id) : null,
    name:     note.name,
    content:  note.content,
  });
  idMap.set(note.id, serverId);  // 자식 노드가 참조할 수 있도록 등록
  // 자식 추가
  const children = guestWorldNotes.filter(n => n.parent_id === note.id);
  queue.push(...children);
}

// 4단계: character 업로드 (work_id 교체)
for (const char of guestCharacters) {
  const { id: serverId } = await apiClient.post('/characters', {
    workId: idMap.get(char.work_id),
    ...
  });
  idMap.set(char.id, serverId);
}

// 5단계: character_custom_field (character_id 교체)
for (const field of guestCustomFields) {
  await apiClient.post('/characters/' + idMap.get(field.character_id) + '/fields', {
    characterId: idMap.get(field.character_id),
    ...
  });
}

// ... episode, plot, foreshadow, foreshadow_link, plot_episode_link, idea_archive 동일 패턴

// 최종: 게스트 rows 삭제 (PowerSync가 real writerId 데이터로 대체)
await db.writeTransaction(async (tx) => {
  await tx.execute('DELETE FROM work WHERE writer_id = ?', [guestWriterId]);
  await tx.execute('DELETE FROM plan WHERE writer_id = ?', [guestWriterId]);
  // ... 나머지 12개 테이블
});
```

### 자기참조 테이블 주의사항

`world_note`, `plot`, `episode`는 `parent_id`로 자기 자신을 참조한다.
DFS/BFS로 **루트 노드(parent_id = NULL)부터** 업로드해야 자식이 부모 서버 ID를 참조할 수 있다.

```
잘못된 순서:
  episode("2화", parent_id="1화id") 먼저 업로드
    → idMap에 "1화id"의 서버 ID가 없음 → parent_id 교체 불가

올바른 순서:
  episode("1화", parent_id=NULL) 업로드 → serverId 획득 → idMap 등록
  episode("2화", parent_id="1화id") 업로드 → idMap.get("1화id")로 교체
```

### 마이그레이션 실패 처리

네트워크 오류 등으로 중간에 실패하면 **일부만 서버에 올라간 상태**가 된다.
재시도 시 이미 서버에 있는 항목이 중복 생성될 수 있으므로, 업로드 전 서버 상태를 확인하거나 멱등성(idempotent) API를 사용해야 한다.

```
권장 전략:
  - 업로드 성공한 guestId → serverId 매핑을 SQLite에 저장 (migration_log 테이블)
  - 재시도 시 이미 매핑된 항목은 건너뜀
  - 전체 성공 후 migration_log + guest rows 삭제
```

### 현재 구현 상태 (migrate.ts)

`src/shared/sync/migrate.ts`는 현재 **work 테이블만 업로드하는 scaffold** 상태다.
에디터 기능이 구현될 때마다 해당 entity의 마이그레이션 로직을 추가해야 한다.

| 단계 | 상태 |
|------|------|
| work 업로드 | ⚠️ 구현됨 (ID 매핑 미완성) |
| plan, world_note, character 등 | ❌ 미구현 |
| 자기참조 트리 BFS 순회 | ❌ 미구현 |
| 실패 재시도 (migration_log) | ❌ 미구현 |
| 게스트 rows 삭제 | ⚠️ work만 구현 |

---

## 개발 환경 실행 및 검증

### 인프라 기동

```bash
cd infra/dev
doppler run -- docker compose -f docker-compose.dev.yml up -d

# 4개 서비스 모두 healthy 확인
docker compose ps

# PowerSync 헬스체크
curl http://localhost:8090/probes/liveness    # 200
curl http://localhost:8090/probes/readiness   # 200
```

### PostgreSQL replication 상태 확인

```bash
# replication slot 확인 (PowerSync 기동 후 1개 생성)
docker exec -it storyzip-postgresql-dev psql -U storyzip -d storyzip -c \
  "SELECT slot_name, plugin, active FROM pg_replication_slots;"

# publication 테이블 확인 (12개)
docker exec -it storyzip-postgresql-dev psql -U storyzip -d storyzip -c \
  "SELECT tablename FROM pg_publication_tables WHERE pubname='powersync';"
```

### Electron 실행 및 DevTools 검증

```bash
cd frontend && pnpm dev
```

로그인 후 DevTools 콘솔:

```javascript
// PowerSync 연결 상태 확인
// (App.tsx의 db 인스턴스는 모듈 스코프에 있어 직접 접근 불가 — 컴포넌트 안에서 usePowerSync() 사용)

// 대신 DevTools Network 탭에서 ws:// 또는 https://localhost:8090/sync/stream 연결 확인
```

### 동기화 검증 시나리오

1. Electron 로그인
2. 백엔드 API로 work 생성: `POST http://localhost:8080/api/v1/works { "title": "테스트 작품" }`
3. Electron 화면에서 work 목록 자동 갱신 확인 (수 초 이내)

---

## 트러블슈팅

### WASM Worker Vite 오류

증상: `Failed to load module script: Expected a JavaScript module script…`

원인: `@powersync/web` 패키지가 Vite pre-bundle(optimizeDeps)에서 처리되면 WASM Worker URL이 깨짐.

해결: `vite.renderer.config.ts`에 아래 설정 추가됐는지 확인:
```typescript
optimizeDeps: { exclude: ['@powersync/web'] },
worker: { format: 'es' },
```

### 401 Unauthorized (PowerSync)

증상: sync stream 연결 시 401 응답.

원인 후보:
1. `PS_JWT_K` 값이 JWT_SECRET 원본 문자열이 아닌 다른 인코딩으로 설정됨
2. JWT `aud` 클레임이 없음 (Spring Boot가 발급 시 미포함)
3. JWT 만료 (access token 30분)

확인:
```bash
# PS_JWT_K 재생성 (JWT_SECRET = 5U4eV37KqP5bd3NYk6CARcLKjwCX37U5OtPgiXHE5V8=)
node -e "console.log(Buffer.from('5U4eV37KqP5bd3NYk6CARcLKjwCX37U5OtPgiXHE5V8=', 'utf8').toString('base64url'))"
# 결과: NVU0ZVYzN0txUDViZDNOWWs2Q0FSY0xLandDWDM3VTVPdFBnaVhIRTVWOD0

docker compose logs powersync | grep -i "auth\|jwt\|401"
```

### OPFS 미지원

증상: IndexedDB 폴백으로 자동 전환, 콘솔에 `OPFS not supported` 메시지.

영향: 없음. `@powersync/web`이 자동으로 IndexedDB를 사용한다.

### replication slot 없음

증상: `docker compose logs powersync`에 `replication slot` 관련 오류.

원인: `powersync-init.sql`이 실행되지 않음 (기존 pgdata 볼륨 사용).

해결:
```bash
# 데이터 초기화 허용 시
docker compose down -v && docker compose up -d

# 데이터 유지 시
docker exec -i storyzip-postgresql-dev psql -U storyzip -d storyzip \
  < ../../infra/db/powersync-init.sql
```

---

## 파일 목록

| 파일 | 역할 |
|------|------|
| `infra/db/powersync-init.sql` | replication role + publication (PostgreSQL 초기화) |
| `infra/powersync/powersync.yaml` | PowerSync Service 설정 (replication, auth, storage) |
| `infra/powersync/sync-rules.yaml` | writer_id 기반 RLS sync rules |
| `infra/dev/docker-compose.dev.yml` | mongo + powersync 서비스 포함 |
| `frontend/src/shared/sync/schema.ts` | PowerSync SQLite 스키마 (12개 테이블) |
| `frontend/src/renderer/sync/connector.ts` | sync connector (JWT 제공, uploadData stub) |
| `frontend/src/renderer/sync/db.ts` | PowerSyncDatabase 싱글턴 |
| `frontend/src/renderer/App.tsx` | PowerSyncContext 주입 + 라이프사이클 |
| `frontend/vite.renderer.config.ts` | WASM Worker Vite 설정 |
