# Folio — PowerSync 통합 가이드

> **최종 갱신**: 2026-04-16
> **범위**: PowerSync 미들웨어의 인프라 · 동기화 규칙 · 백엔드 업로드 API · 프론트엔드 Connector · 로컬 SQLite 스키마
> **대상 독자**: 프로젝트 입문자. 이 한 문서로 PowerSync가 어떻게 Folio 안에서 동작하는지 파악할 수 있도록 구성

> 구 [sync-backend.md](./sync-backend.md) · [sync-frontend.md](./sync-frontend.md)는 본 문서로 통합되었습니다.

---

## 목차

1. [PowerSync란 무엇인가 · 왜 채택했는가](#1-powersync란-무엇인가--왜-채택했는가)
2. [한 눈에 보는 아키텍처](#2-한-눈에-보는-아키텍처)
3. [3가지 데이터 흐름](#3-3가지-데이터-흐름)
4. [인프라 레이어 (Docker Compose)](#4-인프라-레이어-docker-compose)
5. [JWT 인증 연동 — 3중 일치 규약](#5-jwt-인증-연동--3중-일치-규약)
6. [sync-rules — writer_id 기반 RLS](#6-sync-rules--writer_id-기반-rls)
7. [백엔드 업로드 엔드포인트 `/sync/upload`](#7-백엔드-업로드-엔드포인트-syncupload)
8. [프론트엔드 Sync Connector](#8-프론트엔드-sync-connector)
9. [로컬 SQLite 스키마](#9-로컬-sqlite-스키마)
10. [쓰기·읽기 패턴](#10-쓰기읽기-패턴)
11. [로그인 상태와 connect 게이팅](#11-로그인-상태와-connect-게이팅-개요)
12. [새 테이블 추가 — 4단계 가이드](#12-새-테이블-추가--4단계-가이드)
13. [운영 · 초기화 · 트러블슈팅](#13-운영--초기화--트러블슈팅)
14. [파일 맵](#14-파일-맵)
15. [의도적으로 제외한 것](#15-의도적으로-제외한-것)

---

## 1. PowerSync란 무엇인가 · 왜 채택했는가

### 1.1 핵심 아이디어

**PowerSync**는 PostgreSQL의 WAL(Write-Ahead Log)을 구독해 **클라이언트 로컬 SQLite**와 **서버 PostgreSQL**을 양방향 동기화해주는 오픈소스 미들웨어다.

Folio는 "사용자는 네트워크 없이도 원고를 쓰고, 연결되면 자동 백업된다"는 **offline-first** 서비스다. 이 요구에 맞는 구성:

- **모든 읽기·쓰기는 로컬 SQLite에 먼저 반영** → UI는 네트워크와 무관하게 0ms 응답
- **PowerSync가 로컬 변경을 큐잉 → 서버에 배치 업로드** → at-least-once + 멱등 UPSERT로 무손실
- **PostgreSQL WAL → PowerSync → 다른 기기 SQLite**로 자동 전파 → 다기기 동기화 무료

### 1.2 PowerSync Open Edition의 특징과 한계

| 항목 | 설명 |
|------|------|
| 라이선스 | AGPL — self-hosted (우리는 Docker) |
| sync down | SDK가 WebSocket으로 PowerSync Service에서 수신 (자동) |
| sync up | **SDK는 백엔드 업로드용 기본 구현을 제공하지 않음** → 우리가 직접 `POST /api/v1/sync/upload` 를 만들어 Connector.uploadData()에서 호출 |
| 충돌 해결 | last-write-wins (`updated_at` 기반) |
| RLS | YAML `sync-rules`로 선언. `request.user_id()`는 JWT `sub` 클레임 |
| 인증 | JWT를 우리 백엔드가 발급, PowerSync Service가 JWK로 검증 |

### 1.3 왜 "서버 API로 쓰기"가 아니라 "SQLite → Queue → 배치 업로드"인가

일반적인 서버-중심 앱:
```
UI → POST /works → 서버 → DB → UI refetch
```
→ 네트워크 없으면 UI 멈춤, 재시도 로직 각 호출마다 필요.

Folio(PowerSync):
```
UI → db.execute(INSERT) → SQLite (즉시) + ps_crud 큐
                       → PowerSync가 uploadData 자동 트리거
                       → POST /sync/upload (배치) → 204 → 큐 제거
                       → 실패 시 큐 유지, 자동 재시도 (멱등)
```
→ **네트워크 단절이 UX에 노출되지 않음**. 재시도·배치·무손실이 프레임워크 레벨에서 해결.

---

## 2. 한 눈에 보는 아키텍처

```
┌──────────────────────────────────────────────────────────────────┐
│ Electron 클라이언트 (렌더러 프로세스)                              │
│                                                                  │
│  React 컴포넌트                                                   │
│    ├─ useQuery('SELECT * FROM work …')  ── 로컬 SQLite 읽기 0ms   │
│    └─ useLocalWrite().createWork(...)   ── 로컬 SQLite 쓰기 0ms   │
│                                                                  │
│  PowerSyncDatabase (WASM SQLite + OPFS)                          │
│    ├─ ps_crud  — 로컬 쓰기 큐 (upload 대기)                        │
│    ├─ ps_oplog — sync down 체크포인트                              │
│    ├─ connect(FolioConnector)                                  │
│    │    ├─ fetchCredentials()  → JWT + endpoint                   │
│    │    └─ uploadData()        → POST /api/v1/sync/upload (배치)  │
│    └─ sync stream ◀────────────────────────────────────────┐      │
└────────────────────────────────────────────────────────────┼──────┘
           │ REST (쓰기 up)                                   │ WS (읽기 down)
           ▼                                                 │
┌────────────────────────────────────────────────────────┐   │
│ Spring Boot Backend (:8080)                            │   │
│   POST /api/v1/sync/upload                             │   │
│     ├─ JWT 검증 (writer_id 추출)                        │   │
│     ├─ FK depth 정렬 + @Transactional                   │   │
│     ├─ SyncService — 12 테이블 UPSERT, PATCH skip       │   │
│     └─ PostgreSQL INSERT/UPDATE/DELETE                 │   │
│           │                                             │   │
│           ▼ WAL logical replication                     │   │
└───────────────────────────────┬─────────────────────────┘   │
                                ▼                             │
┌───────────────────────────────────────────────────────────┐ │
│ PowerSync Service (:8090)                                 │ │
│   ├─ JWT 검증 (JWK: kty=oct, alg=HS256, kid=storyzip-dev)◀┼─┘
│   ├─ sync-rules.yaml → writer_id 기반 RLS                 │
│   ├─ PostgreSQL WAL 구독 → bucket 계산                    │
│   └─ MongoDB에 bucket 메타 저장                           │
└───────────────────────────────────────────────────────────┘
```

**중요 포인트**:
- PowerSync Service는 **다운로드만** 담당. 업로드는 우리가 만든 백엔드 `/sync/upload`가 담당한다.
- 데이터베이스는 둘: **PostgreSQL**(원본 앱 데이터) + **MongoDB**(PowerSync 버킷 메타).
- 클라이언트는 **단일 싱글턴** `PowerSyncDatabase` 인스턴스를 통해 모든 조작을 한다.

---

## 3. 3가지 데이터 흐름

### 3.1 읽기 — 로컬 SQLite 직접 (즉시)

```
useQuery('SELECT ...') ─► WASM SQLite ─► 결과 반환 (보통 <1ms)
                                 ▲
                                 │ 변경 감지
                                 │
              sync down ─────────┘ (PowerSync가 ps_oplog 업데이트 시)
```

- 네트워크 필요 없음. 오프라인에서도 정상.
- `useQuery`는 **반응형**: SQLite에 변경이 생기면 자동 재렌더.

### 3.2 쓰기 (로컬 → 서버) — 큐 + 배치 업로드

```
컴포넌트
  └─ useLocalWrite().createWork(title)
        └─ db.execute('INSERT INTO work ...')
              ├─ SQLite 즉시 반영 (0ms)
              └─ ps_crud 큐에 자동 적재
                    └─ PowerSync가 uploadData() 자동 호출
                          ├─ getNextCrudTransaction() — 한 트랜잭션 단위 모아오기
                          ├─ POST /api/v1/sync/upload [entries...]
                          ├─ 204 No Content
                          └─ transaction.complete() → ps_crud 제거
```

- 네트워크 끊겨도 `ps_crud`에 누적 → 복귀 후 자동 재시도.
- 백엔드 `@Transactional` + JPA `save()` UPSERT → 중복 수신해도 멱등.

### 3.3 서버 → 다른 기기 (sync down)

```
PostgreSQL WAL
  └─ PowerSync Service 구독 → bucket diff 계산
        └─ 다른 기기 WS sync stream으로 push
              └─ 해당 기기 SQLite에 반영
                    └─ useQuery 자동 재렌더
```

- 같은 `writer_id` 필터의 다른 기기들에 수 초 내 반영.
- sync-rules `user_workspace` bucket + 3개의 children bucket이 대상 행을 결정.

---

## 4. 인프라 레이어 (Docker Compose)

### 4.1 서비스 4개

| 서비스 | 포트 | 역할 |
|--------|------|------|
| `postgresql` | 5432 | 원본 앱 데이터. WAL logical replication 활성 |
| `redis` | 6379 | Refresh Token 저장 (PowerSync와 직접 무관) |
| `mongo` | 내부 | PowerSync 버킷 메타 저장. replica set 모드 |
| `powersync` | 8090 | 클라이언트 sync stream 서버. JWT 검증 + RLS |

### 4.2 PostgreSQL — WAL 구독 옵션

[docker-compose.dev.yml](../infra/dev/docker-compose.dev.yml):
```yaml
postgres -c wal_level=logical -c max_replication_slots=4 -c max_wal_senders=4
```
→ logical replication slot을 쓰려면 `wal_level=logical` 필수.

### 4.3 `powersync-init.sql` — 초기화 스크립트

PostgreSQL 최초 기동 시 자동 실행됨 (`/docker-entrypoint-initdb.d/02-powersync.sql`).

```sql
-- replication 전용 role
CREATE ROLE powersync_repl WITH LOGIN REPLICATION PASSWORD 'storyzip_repl_dev';

GRANT SELECT ON
  work, plan, world_note, "character", character_custom_field, character_tag,
  plot, episode, plot_episode_link, foreshadow, foreshadow_link, idea_archive
TO powersync_repl;

CREATE PUBLICATION powersync FOR TABLE
  work, plan, world_note, "character", character_custom_field, character_tag,
  plot, episode, plot_episode_link, foreshadow, foreshadow_link, idea_archive;
```

- `character`는 SQL 예약어 → 반드시 쌍따옴표로 인용.
- `writer`·`payment` 등 서버 전용 테이블은 publication에서 **제외**.

### 4.4 `powersync.yaml` — 서비스 설정

[infra/powersync/powersync.yaml](../infra/powersync/powersync.yaml):
```yaml
replication:
  connections:
    - type: postgresql
      uri: !env PS_DATA_SOURCE_URI
      sslmode: disable

storage:
  type: mongodb
  uri: !env PS_MONGO_URI

port: 8080                         # 컨테이너 내부. 호스트 매핑은 8090

sync_config:
  path: /app/sync-rules.yaml

client_auth:
  jwks:
    keys:
      - kty: 'oct'
        alg: 'HS256'                # ← 백엔드와 정확히 일치
        kid: 'storyzip-dev'         # ← JWT header.kid와 동일 문자열
        k: !env PS_JWT_K            # ← base64url(JWT_SECRET)
  audience: ['powersync-dev']       # ← JWT payload.aud와 매칭

system:
  logging:
    level: info
    format: text
```

### 4.5 Mongo replica set 자동 초기화

PowerSync는 MongoDB change streams를 쓰기 때문에 standalone이 아닌 replica set이 필요. docker-compose의 healthcheck가 `rs.initiate` 자동 실행:

```yaml
healthcheck:
  test: >
    mongosh --quiet --eval
    "try { rs.status().ok }
     catch (e) { rs.initiate({_id:'rs0',members:[{_id:0,host:'mongo:27017'}]}).ok }"
```

---

## 5. JWT 인증 연동 — 3중 일치 규약

PowerSync 서비스가 클라이언트 JWT를 **자체 keystore**로 검증한다. 백엔드 발급 파라미터와 `powersync.yaml` 설정이 아래 3가지 모두 일치해야 한다. 하나라도 어긋나면 `PSYNC_S2101` 오류.

| 항목 | JWT 위치 | powersync.yaml | 백엔드 설정 |
|------|----------|----------------|-------------|
| **알고리즘** | header `alg` | `jwks.keys[].alg: HS256` | `Jwts.SIG.HS256` 명시 |
| **kid** | header `kid` | `jwks.keys[].kid: storyzip-dev` | `jwt.key-id` (env `PS_JWT_KID`) |
| **서명키** | (HMAC) | `jwks.keys[].k: <PS_JWT_K>` | `JWT_SECRET` (base64url 인코딩 전 원본) |
| **aud** | payload `aud` | `audience: ['powersync-dev']` | `jwt.audience` |
| **sub** | payload `sub` | `request.user_id()`로 추출 | `writerId.toString()` |

### 5.1 백엔드 JWT 발급 요점

[JwtProvider.java](../backend/src/main/java/com/storyzip/auth/jwt/JwtProvider.java):
```java
JwtBuilder builder = Jwts.builder();
builder.header().keyId(properties.getKeyId());          // ★ kid 명시
builder.subject(writerId.toString())                    // ★ sub = writerId
       .claim("email", email).claim("role", role)
       .audience().add(properties.getAudience()).and()
       .issuedAt(new Date(now))
       .expiration(new Date(exp));
return builder.signWith(key(), Jwts.SIG.HS256).compact(); // ★ HS256 고정
```

주의: `Keys.hmacShaKeyFor(byte[])`는 키 길이에 따라 HS384·HS512를 **자동 선택**한다. 따라서 `Jwts.SIG.HS256`을 **명시**하지 않으면 알고리즘 불일치.

### 5.2 `PS_JWT_K` 생성

`JWT_SECRET`(백엔드 HMAC 원문)을 **UTF-8 바이트로 보고** base64url 인코딩한 값.

```bash
# Node
node -e "console.log(Buffer.from(process.env.JWT_SECRET,'utf8').toString('base64url'))"

# 또는 shell
doppler secrets get JWT_SECRET --plain | tr -d '\r\n' | \
  base64 | tr -d '=' | tr '/+' '_-'
```

> **Windows Git Bash / Doppler 함정**: 값 끝에 `\r`이 붙는 경우가 있다. 서명 검증이 조용히 실패(`signature verification failed`) → 생성 파이프에 `tr -d '=\r\n'` 반드시 포함.

---

## 6. sync-rules — writer_id 기반 RLS

[infra/powersync/sync-rules.yaml](../infra/powersync/sync-rules.yaml)에서 클라이언트가 받을 행을 선언적으로 지정한다.

```yaml
bucket_definitions:
  # writer_id 컬럼을 직접 가진 상위 엔티티 8개
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

  # writer_id가 없는 종속 테이블 — 부모 id 목록을 parameters로 먼저 뽑고 필터
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

**제약**:
- `data` 쿼리는 **단일 테이블 SELECT만 허용** (JOIN 금지).
- `writer_id` 컬럼이 없는 테이블은 `parameters`에서 부모 id 목록을 뽑아 간접 필터.
- `request.user_id()`는 JWT `sub` 클레임에서 추출. 백엔드가 `writerId.toString()`으로 세팅.

---

## 7. 백엔드 업로드 엔드포인트 `/sync/upload`

### 7.1 엔드포인트 개요

- Method: `POST /api/v1/sync/upload`
- Auth: `Authorization: Bearer <JWT>`
- Body: `List<SyncUploadRequest>` — 여러 CRUD 항목을 한 트랜잭션 단위로 batch
- Response: `204 No Content` (빈 body)
- Transaction: **메서드 전체가 @Transactional** — 도중 1건이라도 실패하면 전체 롤백

### 7.2 요청 포맷

```java
public record SyncUploadRequest(
    @NotBlank String table,                 // "work", "world_note", ...
    @NotBlank String op,                    // "PUT" | "PATCH" | "DELETE"
    @NotBlank String id,                    // 클라이언트 UUID
    Map<String, Object> data                // 컬럼 → 값. DELETE면 null 가능
) {}
```

**op 시맨틱 (PowerSync 규약)**:

| op | data 포함 컬럼 | 백엔드 처리 |
|----|----------------|-------------|
| `PUT` | NOT NULL인 모든 컬럼 (null 컬럼은 생략됨) | 전체 행. `findById` → 없으면 insert |
| `PATCH` | **변경된 컬럼만** | 존재 시 부분 업데이트. **없으면 skip** (★ 고아 PATCH 방지) |
| `DELETE` | null/`{}` | `deleteById(id)` |

### 7.3 FK depth 정렬

PowerSync가 보내는 순서는 사용자 작업 순 → 부모(work)보다 자식(episode)이 먼저 올 수 있다. 그대로 save 시 FK 제약 위반. `SyncController`가 batch를 **depth 기준으로 재정렬**한다:

```java
private static final Map<String, Integer> TABLE_DEPTH = Map.ofEntries(
    Map.entry("work", 0),
    Map.entry("plan", 1), Map.entry("world_note", 1), Map.entry("character", 1),
    Map.entry("plot", 1), Map.entry("episode", 1),
    Map.entry("foreshadow", 1), Map.entry("idea_archive", 1),
    Map.entry("character_custom_field", 2), Map.entry("character_tag", 2),
    Map.entry("plot_episode_link", 2), Map.entry("foreshadow_link", 2)
);

ordered.sort(Comparator
    .comparingInt(SyncController::opPriority)    // PUT/PATCH 먼저, DELETE 나중
    .thenComparingInt(SyncController::entryDepth) // PUT: 얕은 depth 먼저 / DELETE: 깊은 depth 먼저
);
```

- PUT/PATCH: `depth` 오름차순 — 부모부터 insert.
- DELETE: `depth` 내림차순 — 자식부터 delete (FK 위반 방지).

### 7.4 `SyncService` — 12 테이블 공통 패턴

모든 process 메서드가 동일한 5단계:

```java
private void processXxx(String op, UUID id, Map<String,Object> data, UUID writerId) {
  // 1. DELETE면 바로 삭제 후 종료
  if ("DELETE".equals(op)) { xxxRepo.deleteById(id); return; }

  // 2. entity 로드 — 없으면 신규 빌드. 단 PATCH는 고아이므로 skip
  Xxx e = xxxRepo.findById(id).orElse(null);
  if (e == null) {
    if ("PATCH".equals(op)) return;           // ★ 고아 PATCH 무시
    e = Xxx.builder().id(id).build();
  }

  // 3. writer_id는 JWT sub로 강제 덮어쓰기 (위변조 차단)
  e.setWriterId(writerId);

  // 4. containsKey 기반 부분 업데이트
  applyStr(data, "title",      e::setTitle);
  applyInt(data, "sort_order", e::setSortOrder);
  applyDt (data, "created_at", e::setCreatedAt);
  e.setUpdatedAt(LocalDateTime.now());

  // 5. NOT NULL 기본값 보정 (신규 insert 대비)
  if (e.getTitle()     == null) e.setTitle("제목 없음");
  if (e.getSortOrder() == null) e.setSortOrder(0);
  if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());

  xxxRepo.save(e);    // INSERT or UPDATE (merge)
}
```

### 7.5 `containsKey` 헬퍼 — PATCH가 NOT NULL을 덮어쓰지 않게

PATCH는 **생략된 컬럼**과 **명시적 null**을 구분해야 한다. `data.get(key)`만 확인하면 생략된 key도 null setter를 호출해 NOT NULL 제약 위반 발생.

```java
private static void applyStr(Map<String,Object> data, String key, Consumer<String> setter) {
  if (data.containsKey(key)) {                 // ← 키가 들어온 경우에만
    Object v = data.get(key);
    setter.accept(v != null ? v.toString() : null);
  }
}
// 같은 이유로 applyInt / applyUuid / applyUuidN / applyDt 모두 containsKey 가드
```

### 7.6 Plan 1:1 UNIQUE 특례

`plan.work_id UNIQUE` 제약 때문에 다른 기기에서 이미 plan이 있는데 우리 클라이언트가 다른 id로 PUT 시도 시 `plan_work_id_key` 충돌. 해결: `findByWorkId` 선조회로 upsert.

```java
UUID workId = uuid(data, "work_id");
Plan e = null;
if (workId != null) e = planRepo.findByWorkId(workId).orElse(null);
if (e == null)      e = planRepo.findById(id).orElse(null);
```

### 7.7 멱등성 · 안전성 요약

| 상황 | 결과 |
|------|------|
| 정상 | 204 → 큐 제거 |
| 네트워크 끊김(응답 못 받음) | 큐 유지 → 다음 사이클 재전송 → 동일 UUID UPSERT → 결과 동일 |
| 트랜잭션 중 실패 | 롤백 → 5xx → 재시도 |
| writer_id 위변조 시도 | 요청 바디 무시, JWT 값 사용 |
| 고아 PATCH 수신 | skip — NOT NULL 위반 없이 안전 무시 |
| FK 순서 문제 | depth 정렬로 부모→자식 보장 |

---

## 8. 프론트엔드 Sync Connector

### 8.1 싱글턴 `db` 인스턴스

[frontend/src/renderer/sync/db.ts](../frontend/src/renderer/sync/db.ts):
```typescript
import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from '@shared/sync/schema';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'storyzip.db' },
});

// DEV 모드: DevTools Console에서 직접 쿼리 가능
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__db = db;
}
```

> **실제 `.db` 파일은 디스크에 보이지 않는다.** OPFS(Origin Private File System) 또는 IndexedDB에 저장된다. 내부 구조는 `@powersync/web`이 관리.

### 8.2 `FolioConnector` — PowerSync SDK 콜백 2개

[frontend/src/renderer/sync/connector.ts](../frontend/src/renderer/sync/connector.ts):

```typescript
// Windows IPv6 localhost 회피
const POWERSYNC_URL = import.meta.env.VITE_POWERSYNC_URL ?? 'http://127.0.0.1:8090';

export class FolioConnector implements PowerSyncBackendConnector {
  /** PowerSync 서비스 WS 연결용 JWT + endpoint 반환 */
  async fetchCredentials() {
    let token = await window.storyzip.auth.getAccessToken();
    if (!token) {
      await window.storyzip.auth.tryRestore();
      token = await window.storyzip.auth.getAccessToken();
    }
    if (!token) throw new Error('PowerSync: 인증 토큰 없음');
    return { endpoint: POWERSYNC_URL, token };
  }

  /** ps_crud 큐 → 백엔드 /sync/upload 배치 전송 */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    const token = await window.storyzip.auth.getAccessToken();
    if (!token) {
      // 게스트 모드 — 큐 유지, 로그인 후 재시도
      console.log('[uploadData] 게스트 모드 — 큐 유지');
      return;
    }

    const entries = transaction.crud.map((e) => ({
      table: e.table,
      op: e.op,
      id: e.id,
      data: (e.opData as Record<string, unknown>) ?? null,
    }));

    try {
      await apiClient.post('/sync/upload', entries);
      await transaction.complete();                     // 204 후에만
      console.log(`[sync] uploadData ${entries.length}건 업로드 성공`);
    } catch (e) {
      // complete() 미호출 → PowerSync 자동 재시도
      console.warn('[sync] 업로드 실패 — 재시도 예정:', e);
    }
  }
}
```

### 8.3 Vite 설정 — WASM Worker

[frontend/vite.renderer.config.ts](../frontend/vite.renderer.config.ts):
```typescript
optimizeDeps: {
  exclude: ['@powersync/web'],   // WASM pre-bundle 제외 필수
},
worker: {
  format: 'es',                  // WASM Worker ES module
},
```

---

## 9. 로컬 SQLite 스키마

[frontend/src/shared/sync/schema.ts](../frontend/src/shared/sync/schema.ts) — PowerSync `Table` 12개 정의. PostgreSQL의 대응 테이블(sync-rules의 bucket)과 1:1.

### 9.1 스키마 작성 규칙

- **`id` 컬럼은 자동 추가** (TEXT PK) — 직접 정의 금지.
- **모든 컬럼 NULL 허용** (SQLite 기본값) — NOT NULL 제약은 백엔드에서만 검증.
- JSONB 컬럼(`work.genres`, `work.moods`)은 `column.text`로 저장하고 클라이언트가 `JSON.stringify`/`JSON.parse`.

```typescript
const work = new Table({
  writer_id:   column.text,
  title:       column.text,
  author_name: column.text,
  description: column.text,
  status:      column.text,
  sort_order:  column.integer,
  created_at:  column.text,
  updated_at:  column.text,
});
// ... plan, world_note, character, ... (총 12개)

export const AppSchema = new Schema({ work, plan, ..., idea_archive });
```

### 9.2 12 테이블 한눈에

| 테이블 | writer_id 보유 | 주요 컬럼 |
|--------|----------------|-----------|
| `work` | ✅ | title, status, sort_order |
| `plan` | ✅ | work_id, genres(JSON), moods(JSON), content |
| `world_note` | ✅ | work_id, parent_id, name, content |
| `character` | ✅ | work_id, name, gender, age, mbti, personality |
| `plot` | ✅ | work_id, parent_id, title, status, content |
| `episode` | ✅ | work_id, parent_id, title, status, content, word_count |
| `foreshadow` | ✅ | work_id, title, status, importance |
| `idea_archive` | ✅ | work_id, content, tag |
| `character_custom_field` | ❌ | character_id, field_name, field_value |
| `character_tag` | ❌ | character_id, world_note_id |
| `plot_episode_link` | ❌ | plot_id, episode_id |
| `foreshadow_link` | ❌ | foreshadow_id, link_type, episode_id, plot_id |

---

## 10. 쓰기·읽기 패턴

### 10.1 쓰기 — `useLocalWrite`

[frontend/src/shared/hooks/useLocalWrite.ts](../frontend/src/shared/hooks/useLocalWrite.ts) — **모든 쓰기 유일 진입점**. REST 직접 호출은 금지.

기본 패턴:
```typescript
export function useLocalWrite() {
  const db = usePowerSync();
  const writerId = useWriterId();   // 게스트 or 로그인 사용자 UUID

  return {
    createWork: async (title: string): Promise<string> => {
      const id = crypto.randomUUID();            // ★ 클라이언트 PK 생성
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO work (id, writer_id, title, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, '연재중', 0, ?, ?)`,
        [id, writerId, title, now, now],
      );
      return id;
    },
    updateWork, ensurePlan, updatePlan,
    createWorldNote, updateWorldNoteName, updateWorldNoteContent,
    createCharacter, updateCharacter,
    createPlot, updatePlot,
    createEpisode, updateEpisode,
    createForeshadow, updateForeshadow,
    createIdea, updateIdea,
  };
}
```

**부분 업데이트 패턴 (PATCH와 1:1 매핑)**:
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
→ SQLite UPDATE는 지정 컬럼만 변경 → PowerSync PATCH로 큐에 적재 → 백엔드 `containsKey` 헬퍼가 나머지 유지.

### 10.2 클라이언트 UUID 전략

```
클라이언트에서 crypto.randomUUID() 생성
         ↓
SQLite INSERT (id = UUID)
         ↓
ps_crud에 entry.id = UUID
         ↓
POST /sync/upload [{id: UUID, ...}]
         ↓
백엔드 @GeneratedValue 미사용 → 그대로 INSERT (id = UUID)
```

**효과**:
- 게스트 모드 쓰기 → 로그인 후 같은 UUID 그대로 서버 저장 → ID 재매핑 불필요.
- writer_id만 게스트 UUID → 사용자 UUID로 UPDATE하면 전체 이전 완료.
- UUID v4 충돌 확률(2^122)은 실무적 무시.

### 10.3 읽기 — `useQuery` + `useWriterId`

```typescript
import { useQuery } from '@powersync/react';
import { useWriterId } from '@shared/hooks/useWriterId';

export function WorkList() {
  const writerId = useWriterId();

  const { data: works, isLoading } = useQuery(
    'SELECT * FROM work WHERE writer_id = ? ORDER BY sort_order',
    [writerId ?? ''],
  );

  if (isLoading) return <div>동기화 중…</div>;
  return <ul>{works.map((w) => <li key={w.id}>{w.title}</li>)}</ul>;
}
```

- **반응형**: SQLite에 INSERT/UPDATE/DELETE 들어오면 자동 재렌더.
- **필터 `writer_id = ?`**: `useWriterId`가 반환하는 UUID로 필터. 로그인/게스트/로그아웃 상태 변화에 따라 자동 변경.

### 10.4 JSONB 컬럼 파싱

```typescript
const genres: string[] = JSON.parse(work.genres ?? '[]');
const moods:  string[] = JSON.parse(work.moods  ?? '[]');
```

---

## 11. 로그인 상태와 connect 게이팅 (개요)

PowerSync의 `db.connect(connector)`는 **게스트 작성 데이터가 의도와 다르게 서버로 올라가는 것을 막기 위해** 로그인 직후 바로 호출되지 않는다. 앱 `authStore`가 `syncDecision` 상태로 게이팅:

```typescript
// App.tsx
useEffect(() => {
  if (isAuthenticated && syncDecision !== null) {
    void db.connect(connector);
  } else if (!isAuthenticated) {
    void db.disconnect();
  }
}, [isAuthenticated, syncDecision]);
```

### 4 시나리오 자동 판정 (요약)

| # | 로컬 게스트 행 | `isNewUser` | 자동 동작 |
|---|---------------|-------------|-----------|
| 1 | 0 | true | `use-local` (아무것도 안 함) |
| 2 | 0 | false | `use-server` (disconnectAndClear → connect) |
| 3 | >0 | true | `use-local` + writer_id 재매핑 (자동 업로드) |
| 4 | >0 | false | `SyncDecisionDialog` 사용자 선택 |

`resolveSyncDecision('use-local')`의 writer_id 재매핑:
```typescript
await db.writeTransaction(async (tx) => {
  for (const table of WRITER_ID_TABLES) {
    await tx.execute(
      `UPDATE ${table} SET writer_id = ? WHERE writer_id = ?`,
      [writer.id, previousGuestId],
    );
  }
});
// → ps_crud에 PATCH 적재 → connect 시 /sync/upload로 자동 전송
```

> 상세 auth 플로우(syncDecision·lastKnownWriterId·SyncDecisionDialog·tokenRefreshScheduler)는 본 문서 범위 밖. 별도 auth 문서 참조.

---

## 12. 새 테이블 추가 — 4단계 가이드

### Step 1. DDL + publication
[infra/db/schema.sql](../infra/db/schema.sql) + [infra/db/powersync-init.sql](../infra/db/powersync-init.sql)에 테이블 및 `GRANT`/`PUBLICATION` 추가.

### Step 2. sync-rules
[infra/powersync/sync-rules.yaml](../infra/powersync/sync-rules.yaml)의 적절한 bucket에 `select * from <table> where writer_id = bucket.user_id` 추가.

### Step 3. 프론트엔드 스키마
[frontend/src/shared/sync/schema.ts](../frontend/src/shared/sync/schema.ts)에 `Table` 정의 + `AppSchema`에 등록.

### Step 4. 백엔드 4 파일
- `domain/Xxx.java` — JPA 엔티티 (엔티티 작성 규칙: `@GeneratedValue` 금지, `columnDefinition = "UUID"`, Lombok `@Setter @Builder`)
- `repository/XxxRepository.java` — `extends JpaRepository<Xxx, UUID>`
- `SyncService` — 필드 + `processXxx()` 메서드 + `switch` 한 줄
- `SyncController.TABLE_DEPTH` — FK depth 등록

### Step 5. 쓰기 헬퍼 (선택)
[useLocalWrite.ts](../frontend/src/shared/hooks/useLocalWrite.ts)에 `createXxx` / `updateXxx` 메서드 추가.

**→ 프론트/백 양쪽 ~10개 파일 수정으로 새 테이블 완전 동기화.**

---

## 13. 운영 · 초기화 · 트러블슈팅

### 13.1 개발 환경 실행

```bash
cd c:/WorkSpace/Final/S14P31F203/infra/dev
doppler run -- docker compose -f docker-compose.dev.yml up -d

docker compose ps                               # 4개 서비스 healthy 확인
curl http://127.0.0.1:8090/probes/liveness      # 200
curl http://127.0.0.1:8090/probes/readiness     # 200
```

### 13.2 Replication 상태 확인

```bash
# slot (PowerSync 기동 후 1개 이상)
docker exec -it storyzip-postgresql-dev psql -U storyzip -d storyzip -c \
  "SELECT slot_name, plugin, active FROM pg_replication_slots;"

# publication 테이블 수 (기대: 12)
docker exec -it storyzip-postgresql-dev psql -U storyzip -d storyzip -c \
  "SELECT count(*) FROM pg_publication_tables WHERE pubname='powersync';"
```

### 13.3 DevTools 디버깅

```js
// 큐 상태 — 업로드 대기 중인 PUT/PATCH/DELETE
__db.execute('SELECT * FROM ps_crud').then(r => console.table(r.rows._array))

// 로컬 데이터 확인
__db.execute('SELECT id, title, writer_id FROM work').then(r => console.table(r.rows._array))

// 강제 업로드 트리거 (테스트)
__db.triggerCrudUpload()

// 현재 writerId 확인
useAuthStore.getState().currentWriterId()

// 큐 + SQLite 모두 초기화
await __db.disconnectAndClear()
```

### 13.4 완전 초기화 — `reset.sh`

[infra/dev/reset.sh](../infra/dev/reset.sh)에 네 계층(PostgreSQL·PowerSync·Redis·앱 userData)을 한 번에 비우는 스크립트가 있다.

```bash
# HARD: 볼륨 삭제 → 컨테이너 재생성 (가장 깨끗)
./reset.sh

# SOFT: TRUNCATE만 (빠름)
./reset.sh --soft

# 앱 userData는 유지 (토큰 유지하고 서버만 비움)
./reset.sh --no-app
```

> Electron 앱이 실행 중이면 OPFS 파일 락 때문에 로컬 SQLite가 완전 삭제되지 않는다. 스크립트가 감지하여 자동 중단.

### 13.5 자주 발생하는 오류

#### `PSYNC_S2101` — JWT 검증 실패

| 증상 | 원인 | 해결 |
|------|------|------|
| `algorithm mismatch` | `Keys.hmacShaKeyFor` 자동 선택 | `signWith(key(), Jwts.SIG.HS256)` 명시 |
| `no key matched the token KID` | JWT에 kid 없음 / yaml과 불일치 | `jwt.key-id: storyzip-dev` + `header().keyId(...)` |
| `signature verification failed` | `PS_JWT_K` CRLF 섞임 | `tr -d '=\r\n'` 포함해서 재생성 |

#### 컨테이너 env 변경 무반영

`docker compose restart`는 env 갱신 안 됨 → **재생성 필요**:
```bash
docker compose stop powersync backend
docker compose rm -f powersync backend
doppler run -- docker compose up -d
```

#### Windows localhost → ECONNRESET

일부 Windows에서 `localhost`가 IPv6(`::1`)로 해석되는데 컨테이너는 IPv4 bind.
→ 프론트 기본 URL을 **`http://127.0.0.1:*`로 고정**. Doppler `VITE_POWERSYNC_URL`·`VITE_API_URL`도 동일.

#### WASM Worker 로딩 오류

```
Failed to load module script: Expected a JavaScript module script…
```
→ `vite.renderer.config.ts`에 `optimizeDeps.exclude: ['@powersync/web']` + `worker.format: 'es'` 확인.

#### `ps_crud` 큐 무한 누적

- Console 로그 `[sync] 업로드 실패` 확인
- Network 탭 `/sync/upload` 응답 코드 확인:
  - 400 — 스키마 불일치
  - 409 — NOT NULL/UNIQUE 위반
  - 5xx — 서버 오류
  - 200 `<empty>` — 백엔드가 204 대신 빈 200 반환 중 (apiClient가 파싱 실패) → 백엔드 `ResponseEntity.noContent()` 사용 확인

#### 업로드 성공했는데 다른 기기 sync down 안 됨

| 확인 | 방법 |
|------|------|
| sync-rules 반영 | `docker compose restart powersync` |
| publication 등록 | `SELECT tablename FROM pg_publication_tables WHERE pubname='powersync';` |
| 필터 일치 | `SELECT writer_id, count(*) FROM work GROUP BY 1;` |

### 13.6 OPFS 대 IndexedDB

`@powersync/web`은 OPFS 우선, 미지원 시 IndexedDB 자동 폴백. Console에 `OPFS not supported` 메시지가 떠도 기능 영향은 없음.

---

## 14. 파일 맵

### 인프라
| 파일 | 역할 |
|------|------|
| [infra/dev/docker-compose.dev.yml](../infra/dev/docker-compose.dev.yml) | 4 서비스 orchestration |
| [infra/db/schema.sql](../infra/db/schema.sql) | 앱 테이블 DDL |
| [infra/db/powersync-init.sql](../infra/db/powersync-init.sql) | replication role + publication |
| [infra/powersync/powersync.yaml](../infra/powersync/powersync.yaml) | PowerSync Service 설정 (JWK·storage·replication) |
| [infra/powersync/sync-rules.yaml](../infra/powersync/sync-rules.yaml) | writer_id RLS bucket 정의 |
| [infra/dev/reset.sh](../infra/dev/reset.sh) | 전체 초기화 스크립트 |

### 백엔드
| 파일 | 역할 |
|------|------|
| [auth/jwt/JwtProvider.java](../backend/src/main/java/com/storyzip/auth/jwt/JwtProvider.java) | HS256 + kid 명시 JWT 발급 |
| [sync/controller/SyncController.java](../backend/src/main/java/com/storyzip/sync/controller/SyncController.java) | `/sync/upload` batch + FK depth 정렬 + 204 |
| [sync/service/SyncService.java](../backend/src/main/java/com/storyzip/sync/service/SyncService.java) | 12 테이블 UPSERT · PATCH skip · containsKey 헬퍼 |
| [sync/dto/SyncUploadRequest.java](../backend/src/main/java/com/storyzip/sync/dto/SyncUploadRequest.java) | 업로드 DTO |
| [sync/repository/PlanRepository.java](../backend/src/main/java/com/storyzip/sync/repository/PlanRepository.java) | `findByWorkId` — 1:1 UNIQUE upsert |

### 프론트엔드
| 파일 | 역할 |
|------|------|
| [shared/sync/schema.ts](../frontend/src/shared/sync/schema.ts) | 12 테이블 PowerSync 스키마 |
| [renderer/sync/db.ts](../frontend/src/renderer/sync/db.ts) | `PowerSyncDatabase` 싱글턴 + DevTools `__db` |
| [renderer/sync/connector.ts](../frontend/src/renderer/sync/connector.ts) | fetchCredentials + uploadData 구현 |
| [shared/hooks/useLocalWrite.ts](../frontend/src/shared/hooks/useLocalWrite.ts) | 12 테이블 쓰기 헬퍼 (UUID 생성 포함) |
| [shared/hooks/useWriterId.ts](../frontend/src/shared/hooks/useWriterId.ts) | useQuery 필터용 writerId |
| [shared/lib/apiClient.ts](../frontend/src/shared/lib/apiClient.ts) | `/sync/upload` HTTP 래퍼 (JWT 자동 첨부) |
| [renderer/App.tsx](../frontend/src/renderer/App.tsx) | `PowerSyncContext` 주입 + connect 게이팅 |
| [vite.renderer.config.ts](../frontend/vite.renderer.config.ts) | WASM Worker 빌드 설정 |

---

## 15. 의도적으로 제외한 것

- **PowerSync Cloud(유료) 기능** — dev는 Self-hosted Open Edition만.
- **conflict resolution UI** — PowerSync 기본 last-write-wins + `updated_at` 사용. 동시 편집 UX는 차기.
- **실시간 sync 진행률 바** — 현재는 Console 로그만. 필요 시 PowerSync `SyncStatus` observable 구독.
- **테이블별 버킷 세분화** — 현재 단일 `user_workspace` bucket. 작품별 분리는 데이터 폭증 시 재검토.
- **오프라인 큐 용량 제한** — `ps_crud` 무한 누적. 극단적 장기 오프라인 시나리오는 후속 검토.
- **auth / syncDecision / lastKnownWriterId / tokenRefreshScheduler** — PowerSync 자체가 아닌 앱 레벨 인증 플로우. 별도 auth 문서 참조.
