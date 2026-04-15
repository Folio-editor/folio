# StoryZip — Sync 프론트엔드 구현 문서

> **작성 시점**: 2026-04-16 (sync 안정 검증 완료 시점 기준 최신화)
>
> **관련 문서**
> - [powersync.md](./powersync.md): PowerSync 인프라 · sync-rules · 클라이언트 연결
> - [backend-implementation.md](./backend-implementation.md): 백엔드 전반 (`/sync/upload` 포함)

## 개요

Electron 렌더러에서 동작하는 PowerSync 클라이언트 동기화 로직 문서.

**쓰기 흐름 한 줄 요약**
```
컴포넌트 → useLocalWrite → db.execute → SQLite 즉시 반영 + ps_crud 큐 누적
         → PowerSync가 uploadData 자동 호출 → POST /sync/upload → 204 OK → complete()
```

**핵심 설계 원칙**
- **모든 쓰기는 `db.execute()` 한 경로** — 과거의 "로그인: REST / 게스트: SQLite" 이원화는 폐기.
- **클라이언트가 UUID 생성** (`crypto.randomUUID()`) — 서버가 그 UUID를 그대로 저장하므로 마이그레이션 시 ID 재매핑 불필요.
- **게스트 모드에서도 정상 동작** — 토큰 없으면 uploadData가 early return하여 큐만 누적. 로그인 후 자동 전송.
- **`transaction.complete()`는 204 확인 후에만** — 무손실·멱등 보장.
- **로그인 후 `syncDecision` 게이팅** — `db.connect()` 호출은 사용자 의도가 확정된 뒤로 지연. 게스트 로컬 데이터가 서버 데이터를 덮어쓰는 사고 방지.

---

## 1. 전체 쓰기/동기화 흐름

```
┌──────────────────────────────────────────────────────────────┐
│ React 컴포넌트                                                │
│   const { createWork } = useLocalWrite();                    │
│   await createWork("새 소설");                                │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────────────┐
│ useLocalWrite                                                │
│   const id = crypto.randomUUID();                            │
│   const writerId = useWriterId();   // guest 또는 real UUID  │
│   await db.execute(                                          │
│     'INSERT INTO work (id, writer_id, title, ...) VALUES …', │
│     [id, writerId, title, ...]                               │
│   );                                                          │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────────────┐
│ PowerSyncDatabase (WASM SQLite)                              │
│   ├─ work 테이블 INSERT 즉시 반영 (useQuery 자동 재렌더)       │
│   └─ ps_crud 큐에 자동 누적                                    │
│        { id: N, table: "work", op: "PUT", row_id, opData }   │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
         PowerSync SDK가 자동 호출 (로그인 + connect 상태에서만)
                   ▼
┌──────────────────────────────────────────────────────────────┐
│ StoryZipConnector.uploadData(database)                       │
│   1. getNextCrudTransaction() → 한 트랜잭션의 entry 묶음       │
│   2. 토큰 없으면 early return (큐 보존)                        │
│   3. apiClient.post('/sync/upload', entries)  ← batch 1 RTT  │
│   4. 204 No Content → transaction.complete() → 큐 제거         │
│      실패 → complete() 미호출 → PowerSync 자동 재시도           │
└──────────────────────────────────────────────────────────────┘
                   ▼
              (서버 WAL → PowerSync Service → 다른 기기 sync down)
```

---

## 2. 핵심 파일

| 파일 | 역할 |
|------|------|
| [src/renderer/sync/db.ts](../frontend/src/renderer/sync/db.ts) | `PowerSyncDatabase` 싱글턴 (WASM SQLite + OPFS) |
| [src/renderer/sync/connector.ts](../frontend/src/renderer/sync/connector.ts) | `StoryZipConnector` — fetchCredentials + uploadData |
| [src/shared/sync/schema.ts](../frontend/src/shared/sync/schema.ts) | 12개 동기화 테이블 PowerSync 스키마 |
| [src/shared/hooks/useLocalWrite.ts](../frontend/src/shared/hooks/useLocalWrite.ts) | 12 테이블 INSERT/UPDATE 헬퍼 (UUID 생성 포함) |
| [src/shared/hooks/useWriterId.ts](../frontend/src/shared/hooks/useWriterId.ts) | 현재 writerId(게스트 or real) 구독 |
| [src/shared/hooks/useSyncResolver.ts](../frontend/src/shared/hooks/useSyncResolver.ts) | 로그인 후 4 시나리오 자동 판별 |
| [src/shared/features/auth/SyncDecisionDialog.tsx](../frontend/src/shared/features/auth/SyncDecisionDialog.tsx) | 시나리오 4 — 사용자 선택 UI |
| [src/shared/stores/authStore.ts](../frontend/src/shared/stores/authStore.ts) | `syncDecision` 상태 + `resolveSyncDecision` |
| [src/shared/lib/apiClient.ts](../frontend/src/shared/lib/apiClient.ts) | 백엔드 호출 래퍼 (JWT 자동 첨부, 401 재시도, 204 처리) |
| [src/renderer/App.tsx](../frontend/src/renderer/App.tsx) | `syncDecision` 기반 connect/disconnect 게이팅 |

> 구 `src/shared/sync/migrate.ts` (REST 개별 호출 + ID 재매핑 트리 순회)는 폐기됨. 신규 방식은 `authStore.resolveSyncDecision('use-local')`의 writer_id 일괄 UPDATE로 대체.

---

## 3. `db.ts` — PowerSync 싱글턴

```typescript
import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from '@shared/sync/schema';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'storyzip.db' },
});

// DEV: DevTools Console에서 직접 쿼리 가능
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__db = db;
}
```

> **실제 `.db` 파일은 디스크에 보이지 않는다.** OPFS(Origin Private File System) 또는 IndexedDB에 저장된다. DevTools Console을 통해서만 접근:
> ```js
> __db.execute('SELECT * FROM work').then(r => console.table(r.rows._array))
> __db.execute('SELECT * FROM ps_crud').then(r => console.table(r.rows._array))
> ```

---

## 4. `connector.ts` — `StoryZipConnector`

PowerSync SDK가 호출하는 두 콜백을 구현.

### 4.1 `fetchCredentials()` — JWT 제공

`db.connect(connector)` 시 PowerSync 서비스(`:8090`)에 붙기 위한 토큰 반환.

```typescript
async fetchCredentials() {
  let token = await window.storyzip.auth.getAccessToken();  // keytar IPC
  if (!token) {
    await window.storyzip.auth.tryRestore();                 // refresh 시도
    token = await window.storyzip.auth.getAccessToken();
  }
  if (!token) throw new Error('PowerSync: 인증 토큰 없음 — 로그인 필요');

  console.log('[sync] 인증 OK, PowerSync 연결 시도:', POWERSYNC_URL);
  return { endpoint: POWERSYNC_URL, token };
}
```

- Main 프로세스의 keytar(OS 키체인)에서 Access Token을 IPC로 조회.
- 만료 시 `tryRestore()`로 Refresh Token Rotation.
- 게스트 모드: `db.connect()` 자체를 호출하지 않으므로 이 함수도 호출되지 않음.

기본 URL: `http://127.0.0.1:8090` (Windows IPv6 localhost 회피).

### 4.2 `uploadData()` — batch 업로드

```typescript
async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
  const transaction = await database.getNextCrudTransaction();
  if (!transaction) return;                  // 큐 비어있음

  const token = await window.storyzip.auth.getAccessToken();
  if (!token) {
    console.log('[uploadData] 게스트 모드 — 큐 유지');
    return;                                   // complete() 미호출 → 큐 보존
  }

  const entries = transaction.crud.map((e) => ({
    table: e.table,
    op: e.op,                                 // 'PUT' | 'PATCH' | 'DELETE'
    id: e.id,
    data: (e.opData as Record<string, unknown>) ?? null,
  }));

  try {
    await apiClient.post('/sync/upload', entries);   // ★ batch 1회 전송
    await transaction.complete();                    // 204 확인 후에만 큐 제거
    console.log(`[sync] uploadData ${entries.length}건 업로드 성공`);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 'network';
    console.warn(`[sync] 업로드 실패(${status}) — 재시도 예정:`, e);
    // complete() 미호출 → PowerSync 자동 재시도 (at-least-once)
  }
}
```

**복수 행을 1요청으로 전송**하는 것이 성능·원자성 핵심 — 백엔드 `@Transactional`이 전체를 커밋/롤백.

---

## 5. `useLocalWrite` — 12 테이블 쓰기 헬퍼

모든 쓰기는 이 훅을 거친다. REST 직접 호출은 **금지**.

```typescript
export function useLocalWrite() {
  const db = usePowerSync();
  const writerId = useWriterId();   // 게스트 UUID or 로그인 사용자 UUID

  return {
    createWork, ensurePlan, updatePlan,
    createWorldNote, updateWorldNoteName, updateWorldNoteContent,
    createCharacter, updateCharacter,
    createPlot, updatePlot,
    createEpisode, updateEpisode,
    createForeshadow, updateForeshadow,
    createIdea, updateIdea,
  };
}
```

패턴:
```typescript
createWork: async (title: string): Promise<string> => {
  const id = crypto.randomUUID();               // ★ 클라이언트가 PK 생성
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO work (id, writer_id, title, status, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, '연재중', 0, ?, ?)`,
    [id, writerId, title, now, now],
  );
  return id;
},
```

### 부분 업데이트 패턴 (PATCH)
```typescript
updatePlan: async (id, patch) => {
  const fields = Object.keys(patch);
  if (fields.length === 0) return;
  const setClause = fields.map((f) => `${f} = ?`).join(', ');
  const values = fields.map((f) => patch[f] ?? null);
  await db.execute(
    `UPDATE plan SET ${setClause}, updated_at = ? WHERE id = ?`,
    [...values, new Date().toISOString(), id],
  );
}
```
→ SQLite UPDATE는 지정한 컬럼만 변경 → PowerSync는 해당 컬럼만 포함한 **PATCH**로 큐에 누적 → 백엔드 `containsKey` 헬퍼가 나머지 컬럼을 건드리지 않고 유지.

### `ensurePlan` — 1:1 특수 케이스
`plan.work_id UNIQUE` 제약 때문에 기존 plan이 있으면 그 id를 반환, 없으면 새 생성.  
(백엔드도 `PlanRepository.findByWorkId`로 상호 보완)

### 클라이언트 UUID 전략의 효과
- 게스트 모드 쓰기 → 로그인 후 동일 UUID로 서버 INSERT → **ID 재매핑 불필요**.
- writer_id만 일괄 UPDATE하면 로그인 사용자의 데이터로 전환됨 (게스트→로그인 전환 §7).
- UUID 충돌 가능성: v4는 2^122 공간 — 실무적 무시 가능.

---

## 6. 로그인 후 `syncDecision` 게이팅 — 4 시나리오

### 6.1 왜 필요한가

로그인 완료 순간 `db.connect()`를 호출하면, 누적된 `ps_crud` 큐(게스트 작성 데이터)가 즉시 서버로 업로드된다.  
이때 서버에 해당 사용자의 다른 기기 데이터가 이미 있다면 **두 세트가 섞인다**.  
→ 사용자 의도가 확정되기 전까지 connect를 **지연**한다.

### 6.2 상태: `authStore.syncDecision`

```typescript
export type SyncDecision = 'use-server' | 'use-local' | null;
```

- `null` — 결정 대기. `App.tsx`는 connect 금지.
- `'use-server'` — 로컬 폐기 + 서버 기준 sync down.
- `'use-local'` — 로컬 데이터 유지 + 자동 업로드 (신규 가입자 또는 "이전" 선택).

### 6.3 `App.tsx` 게이팅

```typescript
useEffect(() => {
  const canConnect = isAuthenticated && syncDecision !== null;
  if (canConnect) {
    void db.connect(connector);
  } else if (!isAuthenticated) {
    void db.disconnect();
  }
  // isAuthenticated && syncDecision === null: 대기 (connect/disconnect 모두 호출하지 않음)
}, [isAuthenticated, syncDecision]);
```

### 6.4 `useSyncResolver` — 4 시나리오 자동 판별

| # | 로컬 게스트 행 | `isNewUser` | 자동 결정 | UI |
|---|---------------|-------------|-----------|-----|
| 1 | 0 | true | `use-local` | 없음 |
| 2 | 0 | false | `use-server` | 없음 |
| 3 | >0 | true | `use-local` (writer_id 일괄 UPDATE) | 없음 |
| 4 | >0 | false | **사용자 선택** | `SyncDecisionDialog` |

```typescript
// 1·3: 신규 가입 → 무조건 로컬 보존 (자동 백업)
if (isNewUser) { await resolveSyncDecision('use-local'); return; }

// 2: 기존 회원 + 로컬 비어있음 → 서버 sync down
const count = await countRows(db, previousGuestId);
if (count === 0) { await resolveSyncDecision('use-server'); return; }

// 4: 기존 회원 + 로컬 데이터 있음 → 다이얼로그
setState({ showDialog: true, guestRowCount: count });
```

`countRows`는 8개 writer_id 테이블(`work`, `plan`, `world_note`, `character`, `plot`, `episode`, `foreshadow`, `idea_archive`)에 대해 `UNION ALL` 단일 쿼리.

### 6.5 `SyncDecisionDialog`

시나리오 4 전용. 사용자는 2지 선택:
- **서버 데이터 사용** (권장, 기본) → `resolveSyncDecision('use-server')` → `disconnectAndClear` 후 connect
- **취소** → `logout()` → 게스트 복귀

---

## 7. 게스트 → 로그인 전환 (신규 방식)

### 7.1 `resolveSyncDecision('use-local')` 내부

```typescript
await db.writeTransaction(async (tx) => {
  for (const table of WRITER_ID_TABLES) {    // 8개
    await tx.execute(
      `UPDATE ${table} SET writer_id = ? WHERE writer_id = ?`,
      [writer.id, previousGuestId],
    );
  }
});
```

효과:
1. `useQuery`가 `writer_id = 로그인사용자UUID`로 필터 중이므로 **즉시 로컬 데이터가 UI에 나타남**.
2. UPDATE는 `ps_crud`에 PATCH로 적재됨.
3. `db.connect()` 허용 → PowerSync가 PATCH를 `/sync/upload`로 전송.
4. 백엔드는 `writer_id`를 JWT sub로 덮어씀(동일 값) + PATCH 나머지 컬럼은 변경 없음 → 결국 **INSERT와 동일 효과**로 서버 저장.

### 7.2 `resolveSyncDecision('use-server')` 내부

```typescript
await db.disconnectAndClear();   // ps_crud + SQLite 모두 폐기
// 이후 App.tsx가 db.connect(connector) 호출 → sync down으로 서버 데이터 수신
```

### 7.3 왜 이전 방식(`migrate.ts` 트리 순회)보다 좋은가

| 과거 방식 | 현 방식 |
|-----------|--------|
| 12 테이블 × 각각 REST 엔드포인트 필요 | `/sync/upload` 하나로 전부 처리 |
| 자기참조 트리(world_note/plot/episode) BFS | 불필요 (UUID 그대로 유지) |
| guestId→serverId 매핑 테이블 필요 | 불필요 (ID 재발급 안 함) |
| 부분 실패 시 `migration_log` 필요 | PowerSync at-least-once 재시도 자동 |
| FK 참조 컬럼 일괄 재매핑 필요 | writer_id만 UPDATE |

---

## 8. 데이터 무손실 시나리오

| 상황 | 동작 | 결과 |
|------|------|------|
| 정상 | 204 → `complete()` | 큐 제거 |
| 오프라인 | fetch 실패 → `complete()` 미호출 | 큐 보존, 복귀 시 자동 재전송 |
| 게스트 모드 | 토큰 없음 → 함수 early return | 큐 누적, 로그인 후 `resolveSyncDecision`에 따라 전송 |
| 백엔드 5xx | catch 진입 → `complete()` 미호출 | 다음 PowerSync 사이클에 재시도 |
| 중복 요청(네트워크 끊김 재전송) | 백엔드 JPA save = UPSERT | 결과 동일, 중복 INSERT 없음 |
| 고아 PATCH 수신 | 백엔드가 `findById` empty + PATCH → skip | NOT NULL 위반 없이 안전 무시 |
| FK 제약 순서 문제 | `SyncController`가 depth 정렬(부모 → 자식) | 자식이 부모 INSERT 후에 처리 |
| 앱 강제 종료 | `ps_crud` 큐는 SQLite에 영속 | 재시작 시 그대로 복귀 |

> **`complete()`는 반드시 try 블록 안, `post` 성공 뒤에만 호출**. 실패 경로에서 호출되면 `ps_crud`에서 행이 사라져 데이터 유실.

---

## 9. DevTools 디버깅 가이드

```js
// 작품 목록
__db.execute('SELECT id, title, writer_id FROM work').then(r => console.table(r.rows._array))

// 업로드 대기 큐
__db.execute('SELECT * FROM ps_crud').then(r => console.table(r.rows._array))

// 강제 uploadData 트리거 (테스트)
__db.triggerCrudUpload()

// 현재 writerId 확인
useAuthStore.getState().currentWriterId()

// 현재 syncDecision 확인
useAuthStore.getState().syncDecision
```

### 흔한 진단 루틴

| 증상 | 확인 |
|------|------|
| UI에 변경사항 안 보임 | `SELECT` 결과 확인 + `useQuery`의 writerId 필터 확인 |
| 서버에 안 올라감 | 로그 `[sync] 인증 OK` / `[sync] uploadData ...` 순서 확인 |
| 큐가 무한 누적 | `SELECT * FROM ps_crud` + Network 탭 응답 코드 확인 (400 = 스키마 오차, 409 = NOT NULL/UNIQUE, 5xx = 서버 오류) |
| 로그인 후 로컬 데이터 안 보임 | `useAuthStore.getState()` 확인 — `syncDecision`이 결정됐는지 / `writer_id` UPDATE가 성공했는지 |
| 다른 기기 동기화 안 됨 | PowerSync 서비스 로그 + `sync-rules.yaml` writer_id 필터 |

---

## 10. 새 쓰기 기능 추가 가이드

1. `useLocalWrite.ts`에 메서드 추가 — `crypto.randomUUID()` + `db.execute(INSERT/UPDATE)`.
2. React 컴포넌트에서 `useLocalWrite()` 훅 호출 후 사용.
3. PowerSync가 자동으로 `ps_crud` 큐 누적 → `uploadData` → 백엔드.
4. **백엔드 작업** — [backend-implementation.md §6](./backend-implementation.md#6-새-테이블-추가-절차-4단계) 참고.

> 프론트엔드는 SQLite INSERT/UPDATE 한 줄만 추가하면 네트워크 단에서 배치·재시도·멱등 UPSERT가 자동 처리된다.

---

## 11. 검증 시나리오

### 클라이언트 → 서버 (offline → online)
```
1. 앱 실행 → 게스트 모드 진입
2. [+ 새 작품] → 제목 입력
3. DevTools:
   __db.execute('SELECT * FROM work').then(r => console.table(r.rows._array))
     → 새 작품 행 확인
   __db.execute('SELECT * FROM ps_crud').then(r => console.table(r.rows._array))
     → 게스트면 PUT 항목 누적
4. 로그인
     → isNewUser=true → 자동 'use-local' → writer_id UPDATE는 없음(게스트 0건이면)
       또는 writer_id 재매핑 후 connect
     → 콘솔 [sync] uploadData N건 업로드 성공 확인
5. psql 검증:
   SELECT id, writer_id, title FROM work ORDER BY created_at DESC LIMIT 5;
     → 클라이언트 UUID 그대로, writer_id는 로그인 사용자 UUID
```

### 서버 → 클라이언트 (sync down)
```
1. psql에서 직접 INSERT (로그인 상태 유지):
   INSERT INTO work (id, writer_id, title, status, sort_order, created_at, updated_at)
   VALUES (gen_random_uuid(), '<로그인_사용자_uuid>', '서버 작품', '연재중', 99, now(), now());
2. Electron 사이드바에 자동 출현 (수 초 이내) — useQuery 자동 재렌더
```

### 시나리오 4 검증 (기존 회원 + 로컬 데이터)
```
1. 로그아웃 후 게스트 모드에서 작품 여러 개 작성
2. 다시 같은 Google 계정으로 로그인
3. SyncDecisionDialog 팝업 확인
4. "서버 데이터 사용" 선택 → disconnectAndClear → connect → 로컬 데이터 사라지고 서버 데이터만 표시
   "취소" 선택 → logout → 게스트 데이터 유지
```

---

## 12. 의도적으로 제외한 것

- **병합(merge) UI** — 시나리오 4에서 로컬/서버 양쪽을 합치는 기능은 미제공 (사용자는 서버 우선 또는 로그아웃 선택).
- **실시간 sync 진행률 바** — 현재는 Console 로그만. 필요 시 PowerSync `SyncStatus` observable 구독하여 별도 UI 추가.
- **conflict resolution UI** — PowerSync 기본 last-write-wins + `updated_at`.
- **오프라인 큐 용량 제한** — 현재 ps_crud 무한 누적. 극단적 장기 오프라인 시나리오는 후속 검토.
- **마이그레이션 로그 테이블** — 구 `migrate.ts` 방식에서 필요했으나 신규 방식에선 불필요.
