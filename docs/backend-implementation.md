# StoryZip 백엔드 구현 상세 문서

> 작성 시점: 2026-04-16
> 대상 브랜치: `feat/S14P31F203-62_setEditor` (기동·sync 정상 검증 완료 시점)

오프라인 우선(offline-first) 집필 서비스 **StoryZip**의 Spring Boot 백엔드 구현을 정리한 문서다. 프론트(Electron + SQLite)와 PowerSync + PostgreSQL 사이의 인증·동기화 경로가 안정 동작하기까지 합의된 설계·규약을 담는다.

---

## 0. 기술 스택

| 영역 | 선택 |
|------|------|
| 런타임 | Java 21, Spring Boot 3.4 |
| 데이터 | PostgreSQL 16, Hibernate/JPA, Spring Data JPA |
| 캐시 | Redis 7 (Refresh Token 저장) |
| 보안 | Spring Security 6 (stateless, JWT), jjwt 0.12 |
| OAuth | Google (Electron PKCE 전용) |
| Sync | PowerSync Self-hosted (PostgreSQL WAL logical replication) |
| 문서화 | springdoc-openapi (Swagger UI) |
| 시크릿 | Doppler |
| 컨테이너 | Docker Compose (backend / postgres / redis / powersync) |

---

## 1. 시스템 개요

```
┌──────────────────────────────────┐
│ Electron 클라이언트                │
│  ├── Renderer (React, SQLite)     │
│  │    · 작업은 100% SQLite 선기록  │
│  │    · PowerSync JS SDK         │
│  └── Main (토큰 저장·OS 키체인)    │
└────┬─────────────────────┬───────┘
     │ Auth API            │ PowerSync WS (sync down / up)
     │ (/api/v1/auth/**)   │
     ▼                     ▼
┌──────────────────┐   ┌──────────────────┐
│  Backend (8080)  │   │  PowerSync (8090)│
│  Spring Boot     │   │  Self-hosted     │
│  ├─ JWT 발급      │◀─┤  · JWT kid 검증   │
│  ├─ /sync/upload │   │  · sync down     │
│  └─ JPA UPSERT   │   │    (WAL→WS)      │
└────┬─────────────┘   └────┬─────────────┘
     │                      │
     ▼                      ▼
         PostgreSQL (WAL logical replication)
```

**핵심 원칙 (협의 완료)**
1. **SQLite가 원천** — 사용자 작업은 항상 로컬 DB에 먼저 기록한다. 네트워크는 덤.
2. **업로드 단방향 REST** — `uploadData()`는 PowerSync SDK가 커스텀 백엔드 엔드포인트(`/api/v1/sync/upload`)를 호출하도록 구성. 다운로드는 PowerSync 서버가 WAL을 읽어 자동 push.
3. **writer_id 강제 덮어쓰기** — JWT sub만 신뢰. 요청 바디의 writer_id는 무시.
4. **멱등 UPSERT** — 네트워크/서버 실패 시 재전송해도 결과 동일.
5. **PATCH는 고아일 때 무시** — 기존 행 없는 상태의 PATCH를 신규 insert로 오해해 NOT NULL 위반을 유발하면 안 된다.

---

## 2. 인증 (Auth) 모듈

### 2.1 패키지 구조
```
com.storyzip.auth/
├── controller/AuthController.java           # /api/v1/auth/**
├── service/
│   ├── AuthService.java                     # Google 로그인·refresh·logout
│   └── RefreshTokenRedisService.java        # RT 저장소 (기기별 키)
├── jwt/
│   ├── JwtProvider.java                     # 발급/파싱
│   ├── JwtProperties.java                   # @ConfigurationProperties(prefix=jwt)
│   └── JwtAuthenticationFilter.java         # Bearer → SecurityContext
├── oauth/
│   ├── GoogleOAuthClient.java               # PKCE desktop + web
│   ├── GoogleOAuthProperties.java
│   └── GoogleUserInfo.java
├── domain/
│   ├── Writer.java                          # @GeneratedValue UUID
│   └── Role.java
├── repository/WriterRepository.java
└── dto/{LoginResponse, AccessTokenResponse, GoogleLoginRequest, RefreshRequest, WriterDto}.java
```

### 2.2 엔드포인트

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| POST | `/api/v1/auth/login/google` | 공개 | Electron PKCE 로그인 — `code`+`code_verifier` → JWT 발급 |
| POST | `/api/v1/auth/refresh` | 만료 AT 헤더 | Refresh Token Rotation 적용 재발급 |
| POST | `/api/v1/auth/logout` | AT + `X-Device-Id` | 단일 기기 로그아웃 |
| POST | `/api/v1/auth/logout/all` | AT | 전 기기 로그아웃 |
| GET  | `/api/v1/auth/me` | AT | 내 정보 조회 |

### 2.3 LoginResponse — `isNewUser` 플래그

```java
public record LoginResponse(
    String accessToken,
    String refreshToken,
    WriterDto writer,
    boolean isNewUser   // 이번 로그인에서 writer가 방금 생성됐는지
) {}
```

- `AuthService#loginWithGoogleDesktop` 내부에서 `findByOauthProviderAndOauthId` 결과로 판정.
- 클라이언트는 이 값으로 로컬 게스트 데이터 처리 정책을 결정:
  - `true` — 서버는 확정 0건 → 게스트 로컬 데이터를 그대로 서버로 이관(writer_id 재매핑).
  - `false` — 기존 회원 → 충돌 위험 → SyncDecisionDialog로 사용자 선택.

### 2.4 JWT 구조 (PowerSync 연동 필수 규약)

PowerSync 서비스는 Backend가 발급한 JWT를 **자신의 keystore로 서명 검증**한다. 다음 3가지가 일치해야 한다.

| 항목 | 위치 | 검증 |
|------|------|------|
| **알고리즘** | JWT header `alg` | `HS256` 고정 |
| **kid** | JWT header `kid` | `powersync.yaml` → `client_auth.jwks.keys[].kid`와 동일 문자열 |
| **aud** | JWT payload `aud` | `PS_JWT_AUDIENCE` (기본 `powersync-dev`) |
| **서명 키** | HMAC 비밀 | 백엔드 `JWT_SECRET` == PowerSync `PS_JWT_K` Base64URL decode 값 |

#### 알고리즘 고정
`Keys.hmacShaKeyFor(byte[])`는 키 길이에 따라 HS256/384/512를 **자동 선택**한다.  
48바이트 이상이면 HS384가 골라져 PowerSync(HS256 기대)와 불일치 → `PSYNC_S2101 algorithm mismatch`.
→ `signWith(key(), Jwts.SIG.HS256)`로 **명시 고정**.

#### kid 설정
`application.yml`:
```yaml
jwt:
  secret: ${JWT_SECRET}
  access-expiry: ${JWT_ACCESS_EXPIRY:1800}
  refresh-expiry: ${JWT_REFRESH_EXPIRY:1209600}
  audience:  ${PS_JWT_AUDIENCE:powersync-dev}
  key-id:    ${PS_JWT_KID:storyzip-dev}
```

`JwtProvider`:
```java
JwtBuilder builder = Jwts.builder();
String keyId = properties.getKeyId();
if (keyId != null && !keyId.isBlank()) {
    builder.header().keyId(keyId);   // jjwt 0.12의 fluent header 체이닝
}
builder.subject(writerId.toString())
       .claim("email", email).claim("role", role)
       .audience().add(audience).and()
       .issuedAt(new Date(now)).expiration(new Date(exp));
return builder.signWith(key(), Jwts.SIG.HS256).compact();
```

### 2.5 Refresh Token — Rotation + Redis

- **Access Token**: JWT, `jwt.access-expiry`(기본 1800s) 후 만료.
- **Refresh Token**: JWT 아님. `SecureRandom` 48바이트 → Base64URL 인코딩한 **opaque** 문자열.
- 저장: Redis — Key `RT:{writerId}:{deviceId}`, Value = RT, TTL = `jwt.refresh-expiry`(기본 2주).
- `/refresh` 호출 시:
  1. 만료된 AT에서 `writerId` 추출 (`ExpiredJwtException.getClaims().getSubject()`).
  2. Redis의 `RT:{writerId}:{deviceId}` 와 클라이언트 RT 비교.
  3. 불일치 시 해당 키 강제 삭제 후 `INVALID_TOKEN` 반환 (**탈취 의심 처리**).
  4. 일치 시 새 AT+RT 발급, Redis 덮어쓰기 → 구 RT 무효화 (**Rotation**).

### 2.6 JwtAuthenticationFilter

`OncePerRequestFilter`. Authorization 헤더에서 `Bearer` 토큰 추출 → `JwtProvider.parse` → `Claims.getSubject()`를 `Authentication.name`으로 세팅. 파싱 실패 시 예외 삼키고 통과(비공개 경로면 Spring Security가 401).

```java
Authentication.getName()  // = writerId(UUID) 문자열
```
→ 모든 protected 컨트롤러에서 `UUID.fromString(authentication.getName())` 관용구로 사용.

### 2.7 Google OAuth — PKCE Desktop 우선

- 웹 OAuth는 preserved되었지만 실제 운용 경로는 **Desktop PKCE**.
- Electron Main 프로세스가 `code_verifier` 생성 → 시스템 브라우저로 Google 인증 → 로컬 HTTP 서버로 `code` 수신 → 백엔드 `/login/google`로 교환 위임.
- `GoogleOAuthClient.exchangeDesktopCode(...)`가 Google Token Endpoint 호출 후 `id_token` 서명 검증(`GoogleIdTokenVerifier`) + `aud` 검사.
- `client_secret`이 비어 있어도 동작하도록 처리(순수 Desktop 클라이언트 타입 지원).

---

## 3. Security & CORS 설정

### 3.1 SecurityFilterChain
```java
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http
        .cors(Customizer.withDefaults())          // ← CorsConfigurationSource Bean 자동 주입
        .csrf(AbstractHttpConfigurer::disable)
        .formLogin(AbstractHttpConfigurer::disable)
        .httpBasic(AbstractHttpConfigurer::disable)
        .sessionManagement(s -> s.sessionCreationPolicy(STATELESS))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers(PUBLIC_ENDPOINTS).permitAll()
            .anyRequest().authenticated())
        .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
    return http.build();
}
```

공개 경로:
```
/actuator/health, /actuator/info
/swagger-ui.html, /swagger-ui/**, /v3/api-docs/**
/api/v1/auth/login/**, /api/v1/auth/refresh
```

### 3.2 CORS 정책

`credentials=true` + wildcard는 불가 → `allowedOriginPatterns` 사용.

```java
config.setAllowCredentials(true);
config.setAllowedOriginPatterns(List.of(
    "http://localhost:*",
    "http://127.0.0.1:*",
    "app://*",       // Electron 패키징 앱 스킴
    "file://*"       // Electron dev 일부 경로
));
config.setAllowedMethods(List.of("GET","POST","PUT","PATCH","DELETE","OPTIONS"));
config.setAllowedHeaders(List.of("*"));
config.setExposedHeaders(List.of("Authorization"));
config.setMaxAge(3600L);
```

> Electron Renderer는 보통 `http://localhost:5173` (Vite dev) 또는 `app://` (prod). Main 프로세스의 요청은 Node `fetch`라 CORS 대상 아님.

---

## 4. 동기화 (Sync) 모듈 — 핵심

### 4.1 패키지
```
com.storyzip.sync/
├── controller/SyncController.java       # POST /api/v1/sync/upload
├── service/SyncService.java             # table별 분기 + UPSERT + PATCH 무시
├── dto/SyncUploadRequest.java           # { table, op, id, data }
├── domain/                              # 12 엔티티
│   Work, Plan, WorldNote, Character, CharacterCustomField, CharacterTag,
│   Plot, Episode, PlotEpisodeLink, Foreshadow, ForeshadowLink, IdeaArchive
└── repository/                          # 12 JpaRepository<T, UUID>
    · PlanRepository: findByWorkId(UUID) 추가 (1:1 UNIQUE)
```

### 4.2 요청 포맷

```java
public record SyncUploadRequest(
    @NotBlank String table,        // "work", "world_note", ...
    @NotBlank String op,           // "PUT" | "PATCH" | "DELETE"
    @NotBlank String id,           // 클라이언트 UUID (원칙: v4)
    Map<String,Object> data        // 컬럼명 → JSON 값. op=DELETE면 null 가능
) {}
```

컨트롤러는 `List<SyncUploadRequest>`를 받아 **batch** 처리한다. PowerSync의 `getNextCrudTransaction().crud`와 1:1.

### 4.3 op 시맨틱 (PowerSync 규약)

| op | data 포함 컬럼 | 처리 방침 |
|----|----------------|-----------|
| `PUT` | **NOT NULL인 모든 컬럼** (null 컬럼은 생략) | 전체 행으로 간주. `findById` → 없으면 신규 insert |
| `PATCH` | **변경된 컬럼만** | 존재 시 부분 업데이트. **없으면 스킵(return)** |
| `DELETE` | null / `{}` | `deleteById(id)` |

### 4.4 `SyncController.upload`

```java
@PostMapping("/upload")
@Transactional
public ResponseEntity<Void> upload(
        @RequestBody @NotEmpty List<@Valid SyncUploadRequest> entries,
        Authentication authentication) {
    UUID writerId = UUID.fromString(authentication.getName());
    // FK depth 기준 정렬
    List<SyncUploadRequest> ordered = new ArrayList<>(entries);
    ordered.sort(Comparator
        .comparingInt(SyncController::opPriority)     // PUT/PATCH 먼저, DELETE 나중
        .thenComparingInt(SyncController::entryDepth) // PUT: 얕은 depth 먼저 / DELETE: 깊은 depth 먼저
    );
    for (SyncUploadRequest e : ordered) {
        syncService.process(e, writerId);
    }
    return ResponseEntity.noContent().build();   // 204
}
```

#### FK depth 표

```java
private static final Map<String,Integer> TABLE_DEPTH = Map.ofEntries(
    Map.entry("work", 0),
    Map.entry("plan", 1), Map.entry("world_note", 1), Map.entry("character", 1),
    Map.entry("plot", 1), Map.entry("episode", 1),
    Map.entry("foreshadow", 1), Map.entry("idea_archive", 1),
    Map.entry("character_custom_field", 2), Map.entry("character_tag", 2),
    Map.entry("plot_episode_link", 2), Map.entry("foreshadow_link", 2)
);
```

- PUT/PATCH: `depth` 오름차순 — 부모(work)부터 저장해야 자식(episode 등) FK 제약 통과.
- DELETE: 부호 뒤집어 `-depth` 오름차순 → 깊은 것부터 삭제.

#### 왜 204 인가?
빈 body 200은 프론트 `apiClient`가 `JSON.parse('')`에서 터뜨려서 — 명시적 No Content로 통일.

### 4.5 `SyncService` — 패턴화된 12 process 메서드

공통 패턴 (work 예시):
```java
private void processWork(String op, UUID id, Map<String,Object> data, UUID writerId) {
    if ("DELETE".equals(op)) { workRepo.deleteById(id); return; }

    Work e = workRepo.findById(id).orElse(null);
    if (e == null) {
        if ("PATCH".equals(op)) return;   // ← 고아 PATCH는 무시 (NOT NULL 위반 방지)
        e = Work.builder().id(id).build();
    }
    e.setWriterId(writerId);              // JWT 값 강제 덮어씀

    applyStr(data, "title",       e::setTitle);
    applyStr(data, "author_name", e::setAuthorName);
    applyStr(data, "description", e::setDescription);
    applyStr(data, "status",      e::setStatus);
    applyInt(data, "sort_order",  e::setSortOrder);
    applyDt (data, "created_at",  e::setCreatedAt);
    e.setUpdatedAt(LocalDateTime.now());

    // 신규 insert 시 NOT NULL 기본값 보정
    if (e.getTitle()     == null) e.setTitle("제목 없음");
    if (e.getStatus()    == null) e.setStatus("연재중");
    if (e.getSortOrder() == null) e.setSortOrder(0);
    if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());

    workRepo.save(e);                     // INSERT or UPDATE (merge)
}
```

#### `apply*` 헬퍼 — containsKey 기반 부분 업데이트
```java
private static void applyStr(Map<String,Object> data, String key, Consumer<String> setter) {
    if (data.containsKey(key)) {                    // ← 키가 들어온 경우에만 setter 호출
        Object v = data.get(key);
        setter.accept(v != null ? v.toString() : null);
    }
}
```

`data.containsKey(key)`를 확인하는 이유:
- `PATCH`는 변경되지 않은 컬럼을 **바디에서 생략**한다.
- `data.get(key)`만 검사하면 "생략된 키"와 "명시적 null로 보낸 키"를 구분할 수 없다.
- 생략된 key에도 setter를 호출하면 기존 값이 null로 덮어써져 **NOT NULL 제약 위반 (409)**.
- 같은 이유로 `applyInt` / `applyUuid` / `applyUuidN` / `applyDt` 모두 `containsKey` 가드.

#### 헬퍼별 타입 처리

| 헬퍼 | 동작 |
|------|------|
| `applyStr` | `toString()` 변환, null → setter(null) |
| `applyInt` | `Number` → intValue, 문자열 → parseInt, 파싱 실패 시 기존값 유지 |
| `applyUuid` | **필수 UUID** — null 허용 (setter(null) 호출) |
| `applyUuidN` | **선택 UUID** — null 또는 blank 문자열 → null 설정 |
| `applyDt` | ISO-8601 문자열 파싱, `...Z` 접미사 제거, 실패 시 기존값 유지 |

### 4.6 Plan 1:1 UNIQUE 특례

스키마: `plan.work_id UNIQUE` (work 1개 = plan 1개).  
PowerSync가 보낸 id(클라이언트 UUID)와 서버에 이미 있던 plan의 id가 다른데 **같은 work_id**일 수 있다(예: 다른 기기에서 먼저 생성). 그대로 save하면 `plan_work_id_key` UNIQUE 충돌.

해결: 저장 전 `work_id`로 먼저 조회.
```java
private void processPlan(String op, UUID id, Map<String,Object> data, UUID writerId) {
    if ("DELETE".equals(op)) { planRepo.deleteById(id); return; }

    UUID workId = uuid(data, "work_id");
    Plan e = null;
    if (workId != null) e = planRepo.findByWorkId(workId).orElse(null);
    if (e == null)      e = planRepo.findById(id).orElse(null);
    if (e == null) {
        if ("PATCH".equals(op)) return;
        e = Plan.builder().id(id).build();
    }
    // ... 공통 apply/save
}
```

`PlanRepository`:
```java
public interface PlanRepository extends JpaRepository<Plan, UUID> {
    Optional<Plan> findByWorkId(UUID workId);
}
```

### 4.7 writer_id 보유 테이블

8개 테이블이 `writer_id NOT NULL`을 갖는다 — **JWT 강제 덮어쓰기** 대상:

`work`, `plan`, `world_note`, `character`, `plot`, `episode`, `foreshadow`, `idea_archive`

연결 테이블(`character_custom_field`, `character_tag`, `plot_episode_link`, `foreshadow_link`)은 `writer_id` 없음 — 부모의 소유권으로 간접 관리.

### 4.8 엔티티 작성 규칙

```java
@Entity
@Table(name = "work")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class Work {
    @Id
    @Column(columnDefinition = "UUID")      // ❌ @GeneratedValue 금지
    private UUID id;

    @Column(name = "writer_id", nullable = false, columnDefinition = "UUID")
    private UUID writerId;
    ...
}
```

| 규칙 | 근거 |
|------|------|
| `@GeneratedValue` **금지** | 클라이언트가 이미 UUID를 생성해서 PowerSync 큐에 넣어놨다. 서버가 재생성하면 SQLite↔Postgres id가 어긋남 |
| `columnDefinition = "UUID"` | PostgreSQL 네이티브 UUID 타입 사용 |
| `@Setter` (Lombok) | UPSERT 시 필드 수정 필요 |
| `@Builder` | 신규 insert 시 `Xxx.builder().id(id).build()` 패턴 |
| `Plan.genres/moods` | `@JdbcTypeCode(SqlTypes.JSON)` + `columnDefinition = "JSONB"` — 클라이언트는 JSON.stringify된 문자열 전송 |

---

## 5. 멱등성 & 재시도 안전성

PowerSync는 **at-least-once** 전송 시맨틱을 보장한다. 서버는 같은 요청이 여러 번 와도 결과가 동일해야 한다.

| 시나리오 | 동작 | 결과 |
|----------|------|------|
| 정상 | 커밋 → 204 → `transaction.complete()` | 큐 제거 |
| 네트워크 끊김(응답 못 받음) | 트랜잭션 커밋됐을 수도/아닐 수도. 클라가 complete() 미호출 → 다음 사이클 재전송 | 멱등 UPSERT로 중복 없이 처리 |
| 트랜잭션 중 실패 | `@Transactional` 롤백 → 5xx | 클라 재시도 |
| 알 수 없는 table | `IllegalArgumentException` → 롤백 → 5xx | **무한 재시도 발생 가능 → 운영 모니터링 필요** |
| writer_id 위변조 시도 | 요청 바디 무시, JWT 사용 | 위변조 불가 |

---

## 6. 새 테이블 추가 절차 (4단계)

1. `infra/db/schema.sql` + `infra/db/powersync-init.sql`의 PUBLICATION 등록.
2. 프론트 `frontend/src/shared/sync/schema.ts`에 PowerSync 테이블 정의 추가.
3. 백엔드 4파일:
   - `domain/Xxx.java` (엔티티 규칙 준수)
   - `repository/XxxRepository.java` (`extends JpaRepository<Xxx, UUID>`)
   - `SyncService`: 필드 `private final XxxRepository xxxRepo` + `processXxx(...)` + `switch` 1행
   - `SyncController.TABLE_DEPTH`에 depth 등록
4. 스키마 불일치 시 PowerSync `sync-rules.yaml`도 동기화.

---

## 7. 운영 주의사항 / 알려진 함정

| 주제 | 내용 |
|------|------|
| **Windows IPv6 localhost** | 프론트 기본 URL을 `http://127.0.0.1:8080`으로 고정 (일부 Windows 환경에서 `localhost → ::1`로 해석되며 Docker 대상에서 ECONNRESET) |
| **Doppler CRLF** | `doppler setup`을 Git Bash에서 수행 시 값에 `\r` 섞임. `PS_JWT_K` 갱신 시 `tr -d '=\r\n'` 필수 |
| **컨테이너 env 갱신** | `docker compose restart`로는 env가 안 바뀜 → `stop && rm -f && up -d` 또는 `up -d --force-recreate` |
| **PATCH 누락 컬럼** | `containsKey` 체크 생략 시 NOT NULL 위반 |
| **고아 PATCH** | `findById` empty + op=PATCH → **skip (return)** 해야 NOT NULL 없이 insert 시도하지 않음 |
| **Plan 1:1** | 반드시 `findByWorkId` 선조회 |
| **IllegalArgumentException** | table 이름 오탈자 시 무한 재시도의 씨앗. 배포 전 schema-sync 체크 |
| **JSONB 필드** | `Plan.genres/moods`는 String이지만 내용은 JSON 배열이어야. 클라가 `JSON.stringify(...)` 전송 |

---

## 8. 검증 방법

```bash
# 1. 컴파일
cd backend && ./gradlew compileJava

# 2. 기동
doppler run -- ./gradlew bootRun
# (또는 docker compose up -d backend)

# 3. Swagger
open http://127.0.0.1:8080/swagger-ui/index.html

# 4. 로그인 후 sync 동작 확인
#   프론트에서 작품 생성 → DevTools Console:
#   __db.execute('SELECT * FROM ps_crud').then(r => console.table(r.rows._array))
#   → 수 초 내 비면 업로드 OK
#   [sync] uploadData N건 업로드 성공  로그 확인

# 5. PostgreSQL 확인
docker compose exec postgres psql -U storyzip -d storyzip -c \
  "SELECT id, title, writer_id FROM work ORDER BY updated_at DESC LIMIT 5;"
```

---

## 9. 파일 맵 (주요)

| 경로 | 역할 |
|------|------|
| `backend/src/main/java/com/storyzip/config/SecurityConfig.java` | Spring Security + CORS 활성화 |
| `backend/src/main/java/com/storyzip/config/CorsConfig.java` | `CorsConfigurationSource` Bean |
| `backend/src/main/java/com/storyzip/auth/jwt/JwtProvider.java` | HS256 + kid 명시 JWT 발급 |
| `backend/src/main/java/com/storyzip/auth/jwt/JwtAuthenticationFilter.java` | Bearer → SecurityContext |
| `backend/src/main/java/com/storyzip/auth/service/AuthService.java` | Google OAuth → `isNewUser` 판정 + 토큰 발급 |
| `backend/src/main/java/com/storyzip/auth/service/RefreshTokenRedisService.java` | RT 저장 + RTR + 다기기 로그아웃 |
| `backend/src/main/java/com/storyzip/sync/controller/SyncController.java` | `/sync/upload` batch + depth 정렬 + 204 |
| `backend/src/main/java/com/storyzip/sync/service/SyncService.java` | 12 테이블 UPSERT, PATCH skip, containsKey 헬퍼 |
| `backend/src/main/java/com/storyzip/sync/repository/PlanRepository.java` | `findByWorkId` — 1:1 UNIQUE upsert |
| `backend/src/main/resources/application.yml` | jwt.key-id, audience, refresh-expiry |

---

## 10. 의도적으로 제외한 것

- **서버 rate limiting** — 개발 단계. 배포 전 gateway 수준에서 추가.
- **감사 로그(audit)** — 현재는 Hibernate SQL 로그 + sync 로그만. 사용자 활동 추적은 차기 에픽.
- **병합/충돌 UI 기반 resolution** — 현재는 last-write-wins (PowerSync 기본). 시나리오 4(양쪽 데이터)는 클라 다이얼로그로 선택.
- **관측성(Metrics/Tracing)** — Actuator health/info만 노출. Prometheus/OTel은 차기.
- **Sync 테스트 자동화** — 수동 검증 중. 통합 테스트는 sync가 안정된 시점에 추가.

---

## 11. 디버깅 이력 요약

(안정화까지 발생한 주요 장애와 원인 — 재발 방지용)

1. **PSYNC_S2101 algorithm mismatch** — `Keys.hmacShaKeyFor`가 키 길이 보고 HS384 자동 선택 → `Jwts.SIG.HS256` 명시 고정.
2. **PSYNC_S2101 kid mismatch** — 초기엔 kid 없이 발급 → `header().keyId(...)` 추가 + yaml 동기화.
3. **PSYNC_S2101 signature verification failed** — Doppler `PS_JWT_K` 값에 CRLF 섞임 → 재생성 시 `tr -d '=\r\n'`.
4. **컨테이너 env 묵은 값** — `restart`로는 env 갱신 안 됨 → `stop + rm -f + up -d`.
5. **CORS preflight 차단** — CorsConfig + `cors(withDefaults())` 누락 → 추가.
6. **200 빈 body JSON.parse 에러** — 프론트 apiClient empty check + 백엔드 204 반환.
7. **409 plan_work_id_key UNIQUE 위반** — `findByWorkId` upsert 도입.
8. **409 NOT NULL on UPDATE** — PATCH가 누락 필드를 null로 덮어씀 → `containsKey` 기반 `apply*` 헬퍼.
9. **409 NOT NULL on INSERT (고아 PATCH)** — `findById` empty + PATCH 시 신규 insert 시도 → 12 process 메서드 일괄 **PATCH skip**.
10. **로컬 게스트 데이터 소실** — 로그인 후 writer_id 필터로 쿼리 → 기존 게스트 UUID 행 안 보임 → `resolveSyncDecision('use-local')`에서 writer_id 일괄 UPDATE.
