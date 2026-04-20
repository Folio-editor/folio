# Folio — Google OAuth 인증 구현 문서

## 개요

Spring Boot 백엔드에 Google OAuth 2.0 + JWT 기반 인증을 구현했다.
Electron 데스크탑 앱은 PKCE 방식, Web 에디터는 추후 redirect 방식으로 확장한다.

**Refresh Token은 Redis에 기기별(deviceId)로 저장**하여 다중 기기 로그인 지원.

---

## 1. 전체 흐름

```
[Electron 앱]                       [Spring Boot]              [Google]
   │
   │ (1) PKCE code_verifier 생성
   │ (2) deviceId 로컬 생성/조회 (keytar에 영속 저장)
   │ (3) 시스템 브라우저 열기 ─────────────────────────────────→ 사용자 로그인
   │ (4) 로컬 HTTP 서버 기동 (랜덤 포트)
   │                                                                │
   │ ←──────── authorization code (http://localhost:{port}/callback) ┘
   │
   │ (5) POST /api/v1/auth/login/google
   │     { code, codeVerifier, redirectUri, deviceId }
   │        ──────────────→  ┌──────────────────────────┐
   │                         │ GoogleOAuthClient        │
   │                         │  - 토큰 엔드포인트 호출   │ ─→ exchange code
   │                         │  - id_token 서명 검증    │   (client_id + code_verifier)
   │                         └──────────────────────────┘ ←─ id_token + access_token
   │                         │ WriterService            │
   │                         │  - find or create writer │
   │                         │  - 프로필 정보 업데이트   │
   │                         └──────────────────────────┘
   │                         │ JwtProvider              │
   │                         │  - Access Token 발급      │
   │                         │  - Refresh Token 생성     │
   │                         └──────────────────────────┘
   │                         │ RefreshTokenRedisService │
   │                         │  - Redis 저장             │
   │                         │    Key: RT:{writerId}:{deviceId}
   │                         │    TTL: 14일               │
   │                         └──────────────────────────┘
   │ ←──── { accessToken, refreshToken, writer }
   │
   │ (6) keytar에 refresh_token 저장
   │ (7) 메모리에 access_token 저장
   │ (8) 로그인 완료 화면 전환
```

---

## 2. 다중 기기 로그인 지원

### Redis Key 구조

```
RT:{writerId}:{deviceId}  →  refreshToken (TTL: 14일)
```

예시:
```
RT:550e8400-e29b-41d4-a716-446655440000:device-pc-a     → eyJhbG...
RT:550e8400-e29b-41d4-a716-446655440000:device-pc-b     → eyJhbG...
RT:550e8400-e29b-41d4-a716-446655440000:device-mobile-1 → eyJhbG...
```

동일 사용자가 3개 기기에서 동시 로그인 가능. 한 기기에서 재로그인해도 다른 기기 토큰에 영향 없음.

### deviceId 생성 전략

클라이언트가 관리. Electron 최초 실행 시:
```ts
import { v4 as uuidv4 } from 'uuid';
const deviceId = await keytar.getPassword('storyzip', 'deviceId')
  ?? (() => {
    const id = uuidv4();
    keytar.setPassword('storyzip', 'deviceId', id);
    return id;
  })();
```

한 번 생성된 deviceId는 앱 삭제 전까지 유지. 앱 재설치 시 새 deviceId.

### 로그아웃 시나리오

| 시나리오 | 동작 | Redis 영향 |
|---------|------|-----------|
| 단일 기기 로그아웃 | `POST /logout` (X-Device-Id 헤더) | 해당 key만 삭제 |
| 전체 기기 로그아웃 | `POST /logout/all` | `RT:{writerId}:*` 전체 삭제 |
| 회원 탈퇴 | Soft delete + 전체 기기 로그아웃 | 동일 |
| Refresh Token 만료 | — | TTL 만료로 자동 삭제 |

---

## 3. 패키지 구조

```
com.storyzip/
├── StoryZipApplication.java          # @ConfigurationPropertiesScan, @EnableJpaAuditing
├── config/
│   ├── SecurityConfig.java            # JwtAuthenticationFilter 연결
│   └── RedisConfig.java
└── auth/
    ├── domain/
    │   ├── Writer.java                # writer 테이블 JPA 엔티티 (AuditingEntityListener)
    │   └── Role.java                  # USER / PREMIUM / ADMIN enum
    ├── repository/
    │   └── WriterRepository.java
    ├── jwt/
    │   ├── JwtProperties.java         # jwt.* 설정 매핑
    │   ├── JwtProvider.java           # Access/Refresh 토큰 생성, 파싱
    │   └── JwtAuthenticationFilter.java # Authorization 헤더 검증
    ├── oauth/
    │   ├── GoogleOAuthProperties.java
    │   ├── GoogleUserInfo.java
    │   └── GoogleOAuthClient.java     # Google 토큰 교환 + id_token 검증
    ├── dto/
    │   ├── GoogleLoginRequest.java    # + deviceId
    │   ├── RefreshRequest.java        # + deviceId
    │   ├── LoginResponse.java
    │   ├── AccessTokenResponse.java
    │   └── WriterDto.java
    ├── service/
    │   ├── AuthService.java           # 로그인/리프레시/로그아웃/me
    │   └── RefreshTokenRedisService.java # Redis 저장소 (기기별)
    └── controller/
        └── AuthController.java        # /api/v1/auth/**
```

**DB의 refresh_token 테이블은 제거됨.** 모든 Refresh Token은 Redis에 저장.

---

## 4. API 엔드포인트

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|:---:|------|
| POST | `/api/v1/auth/login/google` | X | Electron PKCE 로그인 |
| POST | `/api/v1/auth/refresh` | (만료 토큰 필요) | Access Token 재발급 |
| POST | `/api/v1/auth/logout` | O | 단일 기기 로그아웃 |
| POST | `/api/v1/auth/logout/all` | O | 전체 기기 로그아웃 |
| GET | `/api/v1/auth/me` | O | 현재 사용자 정보 |

### 4.1 POST /api/v1/auth/login/google

**Request:**
```json
{
  "code": "4/0Ab_...",
  "codeVerifier": "random-string-43-128-chars",
  "redirectUri": "http://localhost:23456/callback",
  "deviceId": "uuid-per-device"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbG...",
  "refreshToken": "opaque-base64url",
  "writer": {
    "id": "uuid",
    "email": "user@gmail.com",
    "nickname": "홍길동",
    "profileImageUrl": "https://lh3.googleusercontent.com/...",
    "role": "USER"
  }
}
```

### 4.2 POST /api/v1/auth/refresh

- 헤더: `Authorization: Bearer {만료된 Access Token}` — 사용자 식별용
- Body:
```json
{
  "refreshToken": "opaque-base64url",
  "deviceId": "uuid-per-device"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbG... (new)",
  "refreshToken": "opaque-base64url (new, rotated)"
}
```

### 4.3 POST /api/v1/auth/logout

- 헤더: `Authorization: Bearer {access_token}`, `X-Device-Id: {deviceId}`
- Response: `204 No Content`

### 4.4 POST /api/v1/auth/logout/all

- 헤더: `Authorization: Bearer {access_token}`
- Response: `204 No Content`

### 4.5 GET /api/v1/auth/me

- 헤더: `Authorization: Bearer {access_token}`
- Response: `WriterDto`

---

## 5. 토큰 설계

| 항목 | Access Token | Refresh Token |
|------|-------------|---------------|
| 형식 | JWT (HS256) | Opaque (Base64URL 랜덤 48바이트) |
| 수명 | 기본 30분 | 기본 14일 |
| 검증 방식 | 서명 검증 (self-contained) | Redis 조회 + 문자열 비교 |
| 저장소 (서버) | — (stateless) | Redis (`RT:{writerId}:{deviceId}`) |
| 저장소 (클라이언트) | 메모리 | keytar (OS 자격증명) |
| 페이로드 | `sub`(writerId), `email`, `role`, `iat`, `exp` | — |

**Refresh Token Rotation**: `/refresh` 호출 시 Redis 값을 새 토큰으로 덮어쓰기.
기존 토큰으로는 재사용 불가 → 탈취 피해 최소화.

---

## 6. 환경변수 (Doppler)

| 키 | 용도 |
|---|------|
| `JWT_SECRET` | JWT HS256 서명 키 (최소 32바이트) |
| `JWT_ACCESS_EXPIRY` | Access Token 수명(초) |
| `JWT_REFRESH_EXPIRY` | Refresh Token 수명(초) / Redis TTL |
| `GOOGLE_CLIENT_ID` | Web 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | Web 클라이언트 시크릿 |
| `GOOGLE_DESKTOP_CLIENT_ID` | Electron Desktop 클라이언트 ID |

---

## 7. Writer 엔티티

```java
@Entity
@Table(name = "writer")
@EntityListeners(AuditingEntityListener.class)  // createdAt 자동 설정
public class Writer {
    @Id @GeneratedValue
    private UUID id;

    @Column(unique = true, nullable = false)
    private String email;

    private String nickname;

    @Column(name = "profile_image_url", columnDefinition = "TEXT")
    private String profileImageUrl;

    @Enumerated(EnumType.STRING)
    private Role role;  // USER / PREMIUM / ADMIN

    private String oauthProvider;
    private String oauthId;

    @CreatedDate
    private LocalDateTime createdAt;

    private LocalDateTime deletedAt;  // 소프트 삭제
}
```

### 프로필 자동 갱신

로그인 시 Google에서 받은 최신 프로필 이름/이미지로 DB 갱신 (`updateProfile` 메서드).

---

## 8. 서버 실행 방법

### 8.1 사전 요구

- Docker 인프라 기동 중 (`infra/dev/docker-compose.dev.yml`)
- Doppler에 `JWT_*`, `GOOGLE_*` 설정 완료
- Doppler CLI 설정 완료 (`doppler setup` 한 상태)

### 8.2 실행

```bash
# 1. Docker 인프라 기동 (PostgreSQL + Redis)
cd infra/dev
doppler run -- docker compose -f docker-compose.dev.yml up -d

# 2. 백엔드 실행 (별도 터미널)
cd backend
doppler run -- sh gradlew bootRun
```

### 8.3 기동 성공 확인

- 로그에 `Started StoryZipApplication in X seconds` 출력
- http://localhost:8080/swagger-ui.html — Swagger UI 접근
- http://localhost:8080/actuator/health — `{"status":"UP"}`

---

## 9. 테스트 방법

### 9.1 Swagger UI로 수동 테스트

http://localhost:8080/swagger-ui.html 접속

### 9.2 `/me` 엔드포인트 인증 동작 확인

```bash
# 토큰 없이 → 401
curl -i http://localhost:8080/api/v1/auth/me
```

### 9.3 Redis에 저장된 토큰 확인

```bash
# Redis 컨테이너 접속
docker exec -it storyzip-redis-dev redis-cli

# 모든 Refresh Token 키 조회
KEYS RT:*

# 특정 키 값 조회
GET RT:550e8400-e29b-41d4-a716-446655440000:device-pc-a

# TTL 확인 (남은 만료 시간, 초)
TTL RT:550e8400-e29b-41d4-a716-446655440000:device-pc-a
```

### 9.4 DB 스키마 확인

```bash
docker exec -it storyzip-postgresql-dev psql -U storyzip -d storyzip

\d writer
# profile_image_url TEXT 확인
# refresh_token 테이블은 없어야 함

\dt
```

### 9.5 다중 기기 로그인 시나리오 테스트

```
1. 기기 A로 로그인 → Redis에 RT:{id}:device-a 생성
2. 기기 B로 로그인 → Redis에 RT:{id}:device-b 생성 (A는 유지)
3. 기기 A 로그아웃 → Redis에 RT:{id}:device-a 만 삭제
4. 기기 B에서 refresh 시도 → 정상 동작 (A 로그아웃 영향 없음)
5. logout/all 호출 → Redis의 RT:{id}:* 전부 삭제
```

---

## 10. 향후 작업

- [ ] Electron: PKCE 플로우 + 로컬 HTTP 서버 + keytar + deviceId 관리
- [ ] 프론트 API 클라이언트: Authorization 헤더 자동 삽입 + 401 시 자동 refresh
- [ ] PowerSync 토큰 발급 엔드포인트 (`GET /api/v1/auth/powersync-token`)
- [ ] Web 에디터 로그인 (redirect 방식)
- [ ] 단위/통합 테스트 작성
- [ ] 활성 세션 목록 조회 (`GET /api/v1/auth/sessions`) + 원격 로그아웃

---

## 11. 트러블슈팅

### 서버 기동 시 `JWT_SECRET` 에러
- Doppler에 `JWT_SECRET` 값이 비어있음
- `doppler secrets set JWT_SECRET="최소-32바이트-랜덤-문자열"` 로 설정

### `401 Unauthorized` at `/me`
- Authorization 헤더 포맷 확인: `Bearer {token}` (접두사 필수)
- Access Token 만료 확인 (기본 30분)

### Redis 연결 실패
- Docker Redis 컨테이너 기동 확인: `docker ps | grep redis`
- `REDIS_HOST=localhost`, `REDIS_PORT=6379` 환경변수 확인

### refresh 시 `INVALID_TOKEN` 에러
- deviceId가 로그인 시와 다른 값인지 확인 (Redis 키 불일치)
- Refresh Token이 rotation 후 재사용 시도 (이미 무효화됨)

### Google 로그인 실패
- `GOOGLE_DESKTOP_CLIENT_ID`가 Doppler에 올바르게 저장되어 있는지 확인
- Google Cloud Console 리다이렉트 URI: `http://localhost` 등록 확인
