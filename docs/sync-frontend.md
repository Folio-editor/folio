# StoryZip — Sync 프론트엔드 구현 문서

## 개요

Electron 렌더러에서 동작하는 PowerSync 클라이언트 측 동기화 로직.
**로컬 SQLite 즉시 반영 → CRUD 큐 자동 누적 → batch 업로드 → 서버 저장 확인 후 큐 제거**의 흐름을 다룬다.

**핵심 설계 원칙:**
- 모든 쓰기는 `db.execute()` 한 경로 (REST 직접 호출 금지)
- 클라이언트가 UUID 생성 (`crypto.randomUUID()`)
- 게스트 모드에서도 로컬 SQLite 동작, 토큰 없으면 큐만 누적
- `transaction.complete()`는 **서버 200 OK 후에만** 호출 → 무손실 보장

---

## 1. 전체 쓰기 흐름

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
│   await db.execute(                                          │
│     'INSERT INTO work (id, writer_id, title, ...) VALUES ?', │
│     [id, writerId, title, ...]                               │
│   );                                                          │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────────────┐
│ PowerSyncDatabase (WASM SQLite)                              │
│   ├─ work 테이블 INSERT 즉시 반영 (UI는 0ms 응답)              │
│   └─ ps_crud 큐에 자동 누적                                    │
│        { id: 1, table: "work", op: "PUT", row_id: id, data } │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
       PowerSync SDK가 자동 트리거
                   ▼
┌──────────────────────────────────────────────────────────────┐
│ StoryZipConnector.uploadData(database)                       │
│   1. getNextCrudTransaction() → 큐의 한 트랜잭션 묶음 조회      │
│   2. apiClient.post('/sync/upload', entries)  ← batch 1회    │
│   3. 200 OK 시 transaction.complete() → ps_crud 큐 제거       │
│      실패 시 complete() 미호출 → 다음 사이클 재시도             │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. 핵심 파일

| 파일 | 역할 |
|------|------|
| [src/renderer/sync/db.ts](../frontend/src/renderer/sync/db.ts) | `PowerSyncDatabase` 싱글턴 (WASM SQLite + OPFS) |
| [src/renderer/sync/connector.ts](../frontend/src/renderer/sync/connector.ts) | `StoryZipConnector` — fetchCredentials + uploadData |
| [src/shared/sync/schema.ts](../frontend/src/shared/sync/schema.ts) | 12개 동기화 테이블 PowerSync 스키마 |
| [src/shared/hooks/useLocalWrite.ts](../frontend/src/shared/hooks/useLocalWrite.ts) | UUID 생성 + INSERT 헬퍼 |
| [src/shared/sync/migrate.ts](../frontend/src/shared/sync/migrate.ts) | 게스트→로그인 시 SQLite 정리 |
| [src/shared/lib/apiClient.ts](../frontend/src/shared/lib/apiClient.ts) | 백엔드 호출 래퍼 (JWT 자동 첨부 + 401 재시도) |

---

## 3. db.ts — PowerSync 싱글턴

```typescript
import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from '@shared/sync/schema';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'storyzip.db' },
  // OPFS 지원 환경(Electron/Chrome): OPFS에 저장
  // 미지원 환경: IndexedDB 자동 폴백
});

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__db = db;
}
```

**중요: 실제 .db 파일은 디스크에 보이지 않는다.** `@powersync/web`은 OPFS(Origin Private File System) 또는 IndexedDB에 저장한다. DevTools Console로만 접근 가능:

```javascript
// DevTools Console
__db.execute('SELECT * FROM work').then(r => console.table(r.rows._array))
__db.execute('SELECT * FROM ps_crud').then(r => console.table(r.rows._array))  // 업로드 대기 큐
```

---

## 4. connector.ts — StoryZipConnector

PowerSync SDK가 호출하는 두 메서드를 구현한다.

### 4.1. fetchCredentials() — JWT 제공

PowerSync 서비스(:8090)에 sync stream 연결할 때 사용.

```typescript
async fetchCredentials() {
  let token = await window.storyzip.auth.getAccessToken();   // IPC

  if (!token) {
    await window.storyzip.auth.tryRestore();                 // refresh 시도
    token = await window.storyzip.auth.getAccessToken();
  }

  if (!token) throw new Error('PowerSync: 인증 토큰 없음');

  return { endpoint: POWERSYNC_URL, token };
}
```

- Main 프로세스의 keytar에서 토큰 조회 (IPC)
- 만료 시 refresh 자동 시도
- 게스트 모드: connect() 자체를 호출하지 않으므로 fetchCredentials도 호출되지 않음

### 4.2. uploadData() — batch 업로드

```typescript
async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
  const transaction = await database.getNextCrudTransaction();
  if (!transaction) return;                  // 큐 비어있음

  const token = await window.storyzip.auth.getAccessToken();
  if (!token) {
    console.log('[uploadData] 게스트 모드 — 큐 유지');
    return;                                   // complete() 미호출 → 큐 보존
  }

  const entries = transaction.crud.map((entry) => ({
    table: entry.table,
    op: entry.op,
    id: entry.id,
    data: (entry.opData as Record<string, unknown>) ?? null,
  }));

  try {
    await apiClient.post('/sync/upload', entries);   // ★ batch 1회 전송
    await transaction.complete();                    // 200 OK 후에만 큐 제거
    console.log(`[uploadData] ${entries.length}개 항목 업로드 완료`);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 'network';
    console.warn(`[uploadData] 업로드 실패 (${status}) — 재시도 예정:`, e);
    // complete() 미호출 → PowerSync 자동 재시도
  }
}
```

**복수 행을 1요청으로 전송**하는 것이 성능 핵심 — 100행 변경도 RTT 1회로 끝.

---

## 5. useLocalWrite — 클라이언트 UUID 쓰기 헬퍼

모든 쓰기는 이 훅을 통과해야 한다 (REST 직접 호출 금지).

```typescript
export function useLocalWrite() {
  const db = usePowerSync();
  const writerId = useWriterId();   // 게스트 또는 로그인 사용자 UUID

  return {
    createWork: async (title: string): Promise<string> => {
      const id = crypto.randomUUID();                    // ★ 클라이언트가 PK 생성
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO work (id, writer_id, title, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, 'active', 0, ?, ?)`,
        [id, writerId, title, now, now],
      );
      return id;
    },
    createWorldNote: async (workId, name, sortOrder) => { ... },
    updateWorldNoteContent: async (id, content) => { ... },
    updateWorldNoteName: async (id, name) => { ... },
  };
}
```

**클라이언트 UUID 전략의 효과:**
- 게스트 모드 쓰기 → 로그인 후 backend는 같은 UUID 그대로 INSERT → **ID 재매핑 불필요**
- migrate.ts가 단순 DELETE만 하면 됨 (복잡한 매핑 로직 제거)

---

## 6. 데이터 무손실 시나리오

| 상황 | 동작 | 결과 |
|------|------|------|
| 정상 | 200 OK → complete() | 큐에서 제거 |
| 오프라인 | uploadData가 호출되어도 fetch 실패 | complete() 미호출 → 큐 보존, 온라인 복귀 시 자동 재전송 |
| 게스트 모드 | 토큰 없음 → 함수 즉시 return | complete() 미호출 → 큐에 누적, 로그인 시 자동 업로드 |
| 백엔드 5xx | catch에서 complete() 안 함 | 다음 PowerSync 사이클에 재시도 |
| 같은 요청 중복 도착 | 백엔드 JPA save가 멱등(UPSERT) | 결과 동일, 중복 INSERT 없음 |
| 앱 강제 종료 | ps_crud 큐는 SQLite에 영속 | 재시작 시 그대로 큐 유지 |

**`complete()`는 절대 try 바깥에서 호출하지 말 것.** 호출 즉시 ps_crud에서 행이 삭제되므로 서버 저장 실패 시 데이터 유실.

---

## 7. 게스트 ↔ 로그인 전환

### 게스트 모드 동작
- `userData/guest-id.txt`에 영속된 게스트 UUID를 `writer_id`로 사용
- `db.execute(INSERT)` 즉시 SQLite 반영 → UI 사용 가능
- `uploadData()`는 호출되지만 토큰 없으므로 큐만 누적

### 로그인 시
1. Google OAuth → 백엔드 JWT 발급
2. `cleanupGuestData(guestWriterId)` 호출 — SQLite에서 게스트 UUID 행 DELETE
   ```typescript
   await db.writeTransaction(async (tx) => {
     await tx.execute('DELETE FROM world_note WHERE writer_id = ?', [guestWriterId]);
     await tx.execute('DELETE FROM work WHERE writer_id = ?', [guestWriterId]);
   });
   ```
3. PowerSync `connect()` → fetchCredentials로 JWT 전달 → sync stream 시작
4. 큐에 남아있던 게스트 시절 변경사항이 uploadData()로 자동 업로드
   - 단, writer_id는 백엔드가 JWT에서 덮어쓰므로 게스트 UUID가 서버에 새지 않는다

---

## 8. DevTools 디버깅 가이드

DEV 모드에서 `window.__db`로 SQLite 직접 조회 가능.

```javascript
// 작품 목록
__db.execute('SELECT id, title FROM work').then(r => console.table(r.rows._array))

// 업로드 대기 큐 (uploadData 미실행 / 실패 시 여기에 쌓임)
__db.execute('SELECT * FROM ps_crud').then(r => console.table(r.rows._array))

// 강제로 uploadData 트리거 (테스트용)
__db.triggerCrudUpload()
```

### 흔한 디버깅 시나리오

| 증상 | 확인 위치 |
|------|----------|
| UI에 변경사항 안 보임 | `db.execute(SELECT)` 결과 확인 — INSERT가 실제 됐는지 |
| 서버에 안 올라감 | Console에서 `[uploadData]` 로그 확인, 없으면 토큰 부재 가능성 |
| 큐가 무한 누적 | `SELECT * FROM ps_crud` — 백엔드 5xx 응답 또는 잘못된 table 이름 |
| 다른 기기에 안 동기화 | PowerSync 서비스 로그(:8090) 및 sync-rules.yaml writer_id 필터 |

---

## 9. 새 쓰기 추가 가이드

새 테이블에 쓰기 기능을 추가할 때:

1. `useLocalWrite.ts`에 메서드 추가 — `crypto.randomUUID()` + `db.execute(INSERT)`
2. React에서 호출 — `await createXxx(...)`
3. PowerSync가 자동으로 ps_crud 큐 누적 → uploadData → 백엔드
4. **백엔드 측 작업** — `docs/sync-backend.md` §8 참고 (엔티티 + 레포 + SyncService 케이스 추가)

→ 프론트엔드는 INSERT 한 줄 추가하면 동기화까지 자동 처리된다.

---

## 10. 검증 시나리오

### 클라이언트→서버
```
1. 앱 실행 → 게스트 모드 진입
2. 사이드바 [+ 새 작품] → 제목 입력
3. DevTools Console:
   __db.execute('SELECT * FROM work').then(r => console.table(r.rows._array))
   → 새 작품 행 확인
   __db.execute('SELECT * FROM ps_crud').then(r => console.table(r.rows._array))
   → 게스트 모드면 누적되어 있음
4. 로그인 → 백엔드 콘솔 + Console 로그 [uploadData] N개 항목 업로드 완료 확인
5. psql: SELECT id, writer_id, title FROM work; → 같은 UUID로 저장됨 (writer_id는 로그인 사용자 UUID)
```

### 서버→클라이언트
```
1. psql로 직접 INSERT:
   INSERT INTO work (id, writer_id, title, status, sort_order, created_at, updated_at)
   VALUES (gen_random_uuid(), '<로그인_사용자_id>', '서버 작품', 'active', 99, now(), now());
2. Electron 사이드바에 자동 출현 → PowerSync WAL 동기화 검증
```
