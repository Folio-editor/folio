# StoryZip — Sync API 백엔드 구현 문서

## 개요

PowerSync 클라이언트의 `uploadData()`가 호출하는 **단일 batch 엔드포인트** `POST /api/v1/sync/upload`를 Spring Boot로 구현했다.
PowerSync는 백엔드 SDK를 제공하지 않으므로 클라이언트→서버 쓰기 경로는 직접 구현해야 한다 (서버→클라이언트는 PostgreSQL WAL 기반 자동 push로 처리).

**핵심 설계 원칙:**
- 엔드포인트 1개 (batch 입력) — 12개 테이블 모두 동일 진입점
- 클라이언트 UUID 그대로 저장 (`@GeneratedValue` 미사용)
- `writer_id`는 JWT subject에서 강제 추출 (요청 바디 신뢰 X)
- `@Transactional` 1요청 = 1트랜잭션 → 부분 저장 차단
- JPA `save()`로 UPSERT (멱등성)

---

## 1. 전체 요청 흐름

```
[Electron 클라이언트]
   │
   │ POST /api/v1/sync/upload
   │ Authorization: Bearer <JWT>
   │ Body: [
   │   { table: "work",       op: "PUT",    id: "uuid-1", data: { title, ... } },
   │   { table: "world_note", op: "PATCH",  id: "uuid-2", data: { content }    },
   │   { table: "world_note", op: "DELETE", id: "uuid-3", data: null           }
   │ ]
   ▼
┌─────────────────────────────────────────────┐
│ JwtAuthenticationFilter                     │
│   ├─ Bearer 토큰 추출/검증                    │
│   └─ SecurityContext 에 writerId 주입         │
└─────────────────┬───────────────────────────┘
                  ▼
┌─────────────────────────────────────────────┐
│ SyncController                              │
│   ├─ Authentication.getName() → writerId    │
│   ├─ @Transactional 시작                     │
│   └─ entries.forEach → SyncService.process  │
└─────────────────┬───────────────────────────┘
                  ▼
┌─────────────────────────────────────────────┐
│ SyncService                                  │
│   switch (entry.table) {                    │
│     case "work"       → workRepo.save(...)  │
│     case "world_note" → worldNoteRepo.save  │
│     case "plot"       → plotRepo.save(...)  │
│     ... (12 cases)                          │
│   }                                          │
└─────────────────┬───────────────────────────┘
                  ▼
            PostgreSQL UPSERT
                  │
                  ▼
            WAL → PowerSync 서비스 → 다른 클라이언트에 자동 push
```

---

## 2. 패키지 구조

```
com.storyzip.sync/
├── controller/
│   └── SyncController.java          # POST /api/v1/sync/upload
├── service/
│   └── SyncService.java             # table별 분기 + UPSERT
├── dto/
│   └── SyncUploadRequest.java       # { table, op, id, data }
├── domain/                           # 12개 JPA 엔티티 (PowerSync 동기화 대상)
│   ├── Work.java
│   ├── Plan.java
│   ├── WorldNote.java
│   ├── Character.java
│   ├── CharacterCustomField.java
│   ├── CharacterTag.java
│   ├── Plot.java
│   ├── Episode.java
│   ├── PlotEpisodeLink.java
│   ├── Foreshadow.java
│   ├── ForeshadowLink.java
│   └── IdeaArchive.java
└── repository/                       # 12개 JpaRepository<T, UUID>
    └── (Work|Plan|WorldNote|...)Repository.java
```

---

## 3. 요청 포맷 — `SyncUploadRequest`

```java
public record SyncUploadRequest(
    @NotBlank String table,                 // "work", "world_note", ...
    @NotBlank String op,                    // "PUT" | "PATCH" | "DELETE"
    @NotBlank String id,                    // 클라이언트 생성 UUID
    Map<String, Object> data                // 컬럼명 → 값 (DELETE 시 null 가능)
) {}
```

PowerSync `getNextCrudTransaction().crud[]`의 각 entry가 1:1로 매핑된다.
**컨트롤러는 `List<SyncUploadRequest>`를 받아** batch 처리한다 — 100행 변경도 HTTP 1회로 끝.

---

## 4. SyncController

```java
@PostMapping("/upload")
@Transactional
public ResponseEntity<Void> upload(
    @RequestBody @NotEmpty List<@Valid SyncUploadRequest> entries,
    Authentication authentication
) {
    UUID writerId = UUID.fromString(authentication.getName());  // JWT sub
    for (SyncUploadRequest entry : entries) {
        syncService.process(entry, writerId);
    }
    return ResponseEntity.ok().build();
}
```

**보안:**
- `@SecurityRequirement(name = "bearerAuth")` — Swagger UI에 자물쇠 표시
- `Authentication`은 `JwtAuthenticationFilter`가 주입한 컨텍스트 (`Authentication.getName()` = JWT subject = writer UUID)
- 요청 바디의 `writer_id`는 절대 사용하지 않는다 (위변조 차단)

**트랜잭션:**
- 메서드 전체가 1트랜잭션 → 도중 실패 시 모든 변경 롤백
- 클라이언트는 200 OK 받은 뒤에만 `transaction.complete()` 호출 → 부분 저장 불가능

---

## 5. SyncService — 분기 + UPSERT

핵심 패턴 (work 예시):

```java
private void processWork(String op, UUID id, Map<String, Object> data, UUID writerId) {
    if ("DELETE".equals(op)) {
        workRepo.deleteById(id);
        return;
    }
    Work entity = workRepo.findById(id).orElse(Work.builder().id(id).build());
    entity.setWriterId(writerId);                          // ★ JWT 값 강제 덮어씀
    entity.setTitle(str(data, "title", "제목 없음"));
    entity.setStatus(str(data, "status", "active"));
    entity.setSortOrder(integer(data, "sort_order", 0));
    entity.setCreatedAt(datetime(data, "created_at", entity.getCreatedAt()));
    entity.setUpdatedAt(datetime(data, "updated_at", LocalDateTime.now()));
    workRepo.save(entity);                                 // INSERT or UPDATE
}
```

### UPSERT 동작 원리

| 시나리오 | `findById` 결과 | `save` 동작 |
|----------|-----------------|-------------|
| 신규 PUT | empty | `EntityManager.persist()` → INSERT |
| 기존 PATCH | present | `EntityManager.merge()` → UPDATE |
| 중복 PUT (재전송) | present | UPDATE (멱등) |

→ 같은 요청이 여러 번 도착해도 결과 동일. PowerSync 재시도 안전.

### 타입 변환 헬퍼

JSON으로 들어온 `Map<String, Object>` 값을 안전하게 강타입으로 변환:

| 헬퍼 | 처리 |
|------|------|
| `str(data, key, default)` | toString 또는 default |
| `integer(data, key, default)` | Number → intValue, 문자열 → parseInt |
| `uuid(data, key)` | UUID.fromString (필수 컬럼) |
| `uuidOrNull(data, key)` | null/blank → null (선택 컬럼) |
| `datetime(data, key, default)` | ISO-8601 파싱, 실패 시 default |

---

## 6. 엔티티 작성 규칙

```java
@Entity
@Table(name = "work")
public class Work {
    @Id
    @Column(columnDefinition = "UUID")     // ❌ @GeneratedValue 사용 금지
    private UUID id;

    @Column(name = "writer_id", nullable = false, columnDefinition = "UUID")
    private UUID writerId;
    ...
}
```

| 규칙 | 이유 |
|------|------|
| `@GeneratedValue` **금지** | 클라이언트 UUID 그대로 저장 (게스트→로그인 ID 재매핑 불필요) |
| `columnDefinition = "UUID"` | PostgreSQL UUID 타입 명시 |
| `@Setter` 사용 (Lombok) | UPSERT 시 필드 수정 필요 |
| `@Builder` | 신규 entity 생성 (`Work.builder().id(id).build()`) |
| `Plan.genres/moods` | `@JdbcTypeCode(SqlTypes.JSON)` + `columnDefinition = "JSONB"` |

---

## 7. 멱등성 + 데이터 무손실 보장

| 시나리오 | 동작 | 결과 |
|---------|------|------|
| 정상 처리 | DB 커밋 → 200 OK → 클라이언트 complete() | 큐에서 제거, 정상 완료 |
| 네트워크 단절 | 클라이언트가 응답 못 받음 | complete() 미호출 → 다음 사이클 자동 재시도 → 멱등 UPSERT로 중복 없이 처리 |
| DB 도중 실패 | `@Transactional` 롤백 → 5xx 반환 | 클라이언트 complete() 미호출 → 재시도 |
| 잘못된 table 이름 | `IllegalArgumentException` 던짐 → 트랜잭션 롤백 | 5xx → 재시도 (코드 수정 시까지 무한 재시도되므로 모니터링 필요) |
| writer_id 위변조 시도 | 요청 바디 무시, JWT 값 사용 | 위변조 불가능 |

---

## 8. 새 동기화 테이블 추가 가이드

1. `infra/db/schema.sql` 에 테이블 추가
2. `infra/db/powersync-init.sql` 의 PUBLICATION에 테이블 추가
3. `frontend/src/shared/sync/schema.ts`에 PowerSync 테이블 정의 추가
4. **백엔드 변경 (4단계):**
   - `domain/Xxx.java` — 엔티티 작성 (위 규칙 준수)
   - `repository/XxxRepository.java` — `extends JpaRepository<Xxx, UUID>` 한 줄
   - `SyncService.java` — `private final XxxRepository xxxRepo;` 필드 + `processXxx()` 메서드 + `switch` 케이스 1줄
   - 테스트 (선택)

→ **3개 파일 + 1 메서드** 추가로 신규 테이블 동기화 완료.

---

## 9. 운영 시 주의사항

- `IllegalArgumentException`(알 수 없는 table)이 무한 재시도를 유발할 수 있다. PowerSync 큐 적체 시 가장 먼저 확인.
- DDL 변경 시 PowerSync `sync-rules.yaml` + 백엔드 엔티티 + 프론트 schema 3곳 모두 동기화 필요.
- `Plan.genres/moods` JSONB는 String으로 저장하므로 클라이언트가 JSON.stringify된 문자열을 보내야 한다.
- 트랜잭션 단위가 큰 batch(수백 행)는 가능하지만, 일반적으로 PowerSync `getNextCrudTransaction()`은 사용자 활동 1초 단위로 묶여 들어온다.

---

## 10. 검증 방법

```bash
# 1. 백엔드 컴파일 확인
cd backend && ./gradlew compileJava

# 2. 백엔드 기동 후 Swagger UI 접근
http://localhost:8080/swagger-ui/index.html
  → Sync 태그에서 POST /api/v1/sync/upload 확인

# 3. 클라이언트에서 글 작성 후 PostgreSQL 확인
psql -U storyzip -d storyzip
SELECT id, writer_id, title FROM work ORDER BY created_at DESC LIMIT 5;
SELECT id, name, length(content) FROM world_note ORDER BY updated_at DESC LIMIT 5;
```
