# StoryZip — 프론트엔드 OAuth 로그인 구현

## 개요

Electron 데스크탑 앱에 Google OAuth 로그인을 PKCE 방식으로 구현했다.
Client Secret 없이 동작하며, Refresh Token은 OS 키체인(`safeStorage`)에 암호화 저장된다.

---

## 1. 구현 파일

```
frontend/src/
├── main/
│   ├── index.ts                       # IPC 핸들러 등록
│   ├── preload.ts                     # window.storyzip.auth 노출
│   └── auth/
│       ├── pkce.ts                    # PKCE code_verifier/challenge 생성
│       ├── deviceId.ts                # 기기 ID 영속 관리
│       ├── tokenStore.ts              # safeStorage 기반 refresh 저장
│       ├── oauthServer.ts             # 임시 로컬 HTTP 서버 (code 수신)
│       └── googleOAuth.ts             # 전체 플로우 오케스트레이션
└── shared/
    ├── types/auth.ts                  # DTO 타입 + window.storyzip 선언
    ├── stores/authStore.ts            # Zustand: 인증 상태
    ├── lib/apiClient.ts               # fetch + 401 자동 refresh
    └── features/auth/
        ├── LoginScreen.tsx
        └── AuthenticatedApp.tsx
```

---

## 2. 인증 흐름

```
[Renderer]                    [Main Process]                    [Google]     [Backend]
                                                                                │
login 버튼 클릭
  │
  └─ IPC: auth:login ───────→ loginWithGoogle()
                                 ├─ PKCE 생성
                                 ├─ deviceId 조회
                                 ├─ 로컬 HTTP 서버 기동 (랜덤 포트)
                                 ├─ shell.openExternal(Google URL) ──→ 시스템 브라우저
                                                                        │
                                                                     로그인/동의
                                                                        │
                              로컬 서버가 code 수신 ←────── redirect ┘
                                 │
                                 ├─ POST /auth/login/google ─────────────────→ code 교환
                                 │                                            ├─ Google에 토큰 요청
                                 │                                            ├─ id_token 검증
                                 │                                            ├─ Writer 생성/조회
                                 │                                            └─ JWT 발급
                                 │                                                        │
                                 │ ←──── { accessToken, refreshToken, writer } ─────────┘
                                 │
                                 ├─ refreshToken → safeStorage 암호화 저장
                                 ├─ accessToken → 메모리 + 암호화 저장 (자동 로그인용)
                                 │
  ←─── { accessToken, writer } ─┘
  │
authStore 상태 업데이트 → AuthenticatedApp 렌더링
```

---

## 3. 핵심 구현 상세

### 3.1 PKCE (pkce.ts)

```ts
codeVerifier:  Base64URL(random 48 bytes)   // 64자 랜덤
codeChallenge: Base64URL(SHA-256(verifier))
state:         Base64URL(random 24 bytes)    // CSRF 방지
```

Node `crypto` 내장 모듈만 사용. 외부 라이브러리 없음.

### 3.2 Device ID (deviceId.ts)

- 파일 위치: `{userData}/device-id.txt`
- 앱 최초 실행 시 `crypto.randomUUID()` 생성
- 재실행 시 파일에서 로드 → 동일 ID 유지
- Redis 키 `RT:{writerId}:{deviceId}` 일부로 사용

### 3.3 토큰 저장 (tokenStore.ts)

Electron `safeStorage` 사용:
| OS | 암호화 엔진 |
|----|------------|
| macOS | Keychain |
| Windows | DPAPI |
| Linux | libsecret / kwallet |

- `safeStorage.encryptString(token)` → Buffer
- 파일: `{userData}/refresh.bin`
- 복호화 실패 시 파일 삭제 후 null 반환 (OS 키체인 변경 등 대응)

**keytar 대신 `safeStorage` 선택 이유:**
- keytar는 native binary 컴파일 필요 (Windows에서 자주 깨짐)
- Electron 공식 API, 외부 의존성 불필요
- 동일한 OS 키체인 사용 → 보안 수준 동일

### 3.4 로컬 HTTP 서버 (oauthServer.ts)

- `http.createServer` 랜덤 포트로 기동 (`port 0` 바인딩)
- redirect URI: `http://localhost:{port}/callback`
- code 수신 즉시 응답 후 서버 종료
- state 불일치 시 거부 (CSRF 방지)
- 5분 타임아웃 (사용자 방치 대응)

**Google Cloud Console 설정:**
- Desktop 클라이언트 타입 (Web application으로 생성)
- 승인된 리다이렉션 URI: `http://localhost` (포트 와일드카드 자동 허용)

### 3.5 자동 로그인 (tryRestoreLogin)

앱 재시작 시 흐름:
1. `refresh.bin`, `last-access.bin` 존재 확인
2. `POST /auth/refresh` 호출 (만료된 Access Token을 Authorization 헤더로, refreshToken + deviceId를 body로)
3. 새 Access/Refresh Token 수신 → 저장
4. `GET /auth/me` 호출 → 사용자 정보 로드
5. 실패 시 토큰 전체 폐기 → 로그인 화면 표시

`last-access.bin`이 필요한 이유:
백엔드 refresh 엔드포인트가 writerId 식별을 위해 만료된 Access Token을 요구하기 때문.

### 3.6 IPC 인터페이스

`window.storyzip.auth`:
```ts
{
  loginWithGoogle: () => Promise<LoginResult>;
  logout: () => Promise<void>;
  tryRestore: () => Promise<LoginResult | null>;
  getAccessToken: () => Promise<string | null>;
}
```

**보안 원칙:**
- `refreshToken`은 Renderer에 **노출하지 않음** (Main 프로세스에만 존재)
- `accessToken`은 필요시 조회 가능 (API 호출용)
- Context Isolation 활성화 + Node Integration 비활성화

### 3.7 Zustand 스토어 (authStore.ts)

| 상태 | 설명 |
|------|------|
| writer | 로그인 사용자 정보 |
| isAuthenticated | 로그인 여부 |
| isRestoring | 앱 시작 시 자동 로그인 시도 중 |
| isLoggingIn | 로그인 버튼 클릭 후 진행 중 |
| error | 에러 메시지 |

메서드:
- `restore()`: 앱 시작 시 자동 호출
- `login()`: Google 로그인 플로우 시작
- `logout()`: 로그아웃 + 로컬 토큰 정리

### 3.8 API 클라이언트 (apiClient.ts)

```ts
apiClient.get<T>(path)
apiClient.post<T>(path, body)
apiClient.delete<T>(path)
```

- Authorization 헤더 자동 삽입
- 401 응답 → `tryRestore()` 자동 호출 → 성공 시 1회 재시도
- 실패 시 `ApiError` 던짐

---

## 4. 환경변수

Doppler dev 환경에 설정:

| 키 | 값 |
|---|------|
| `VITE_API_URL` | `http://localhost:8080/api/v1` |
| `VITE_GOOGLE_DESKTOP_CLIENT_ID` | Google Cloud Console에서 발급한 Desktop 클라이언트 ID |

`VITE_` 접두사 덕분에 Vite 번들에 포함됨.
Main 프로세스도 `process.env.VITE_*`로 접근 (Doppler가 실행 시 주입).

---

## 5. 실행 및 테스트

### 5.1 전체 실행 순서

```bash
# 1. Docker 인프라 (PostgreSQL + Redis)
cd infra/dev
doppler run -- docker compose -f docker-compose.dev.yml up -d

# 2. 백엔드 (별도 터미널)
cd backend
doppler run -- sh gradlew bootRun

# 3. 프론트엔드 (별도 터미널)
cd frontend
doppler run -- pnpm dev
```

### 5.2 E2E 테스트 시나리오

1. **최초 로그인:**
   - Electron 앱 → LoginScreen 표시
   - "Google로 로그인" 버튼 클릭
   - 시스템 브라우저 열림 → Google 계정 선택/동의
   - 브라우저에 "로그인 성공, 이 창을 닫고 앱으로 돌아가세요" 표시
   - Electron 앱 → AuthenticatedApp 전환 (사용자 정보 표시)

2. **DB 확인:**
   ```bash
   docker exec -it storyzip-postgresql-dev psql -U storyzip -d storyzip \
     -c "SELECT id, email, nickname, profile_image_url, role FROM writer;"
   ```

3. **Redis 확인:**
   ```bash
   docker exec -it storyzip-redis-dev redis-cli KEYS "RT:*"
   docker exec -it storyzip-redis-dev redis-cli TTL "RT:{writerId}:{deviceId}"
   ```

4. **앱 재시작 자동 로그인:**
   - Electron 앱 종료 → 재실행
   - "로딩 중..." 짧게 표시
   - 자동으로 AuthenticatedApp 전환 (재로그인 불필요)

5. **로그아웃:**
   - AuthenticatedApp에서 "로그아웃" 버튼 클릭
   - LoginScreen으로 전환
   - Redis에서 `RT:{writerId}:{deviceId}` 키 삭제 확인

6. **다중 기기 시뮬레이션:**
   - 첫 번째 기기에서 로그인 → Redis에 `RT:{id}:device-a`
   - `{userData}/device-id.txt`를 수정하거나 다른 PC 시뮬레이션
   - 두 번째 기기에서 로그인 → Redis에 `RT:{id}:device-b` (첫 번째 유지)

---

## 6. 보안 체크리스트

- [x] Client Secret은 백엔드에만 존재 (Electron은 PKCE Desktop 클라이언트 사용)
- [x] Refresh Token은 OS 키체인 암호화 저장
- [x] Refresh Token은 Renderer에 노출 안 됨 (Main 전용)
- [x] Context Isolation + Node Integration Off
- [x] PKCE state 검증으로 CSRF 방지
- [x] 시스템 브라우저 사용 (Electron 내장 브라우저 X) — 피싱 방지
- [x] HTTPS 백엔드 통신 (운영 환경)

---

## 7. 향후 작업

- [ ] 웹 에디터 로그인 (redirect 방식, `src/web/App.tsx` 분기)
- [ ] 에러 UI 개선 (토스트, 재시도 버튼)
- [ ] 프로필 수정 / 탈퇴 UI
- [x] PowerSync 인증 (dev) — HS256 공유 시크릿. Access Token에 `aud=powersync-dev` 클레임 포함, PowerSync가 `JWT_SECRET`으로 검증
- [ ] PowerSync 인증 (prod) — RS256 + JWKS, `GET /auth/powersync-token` 별도 엔드포인트
- [ ] 활성 세션 목록 조회 UI + 원격 로그아웃
- [ ] 단위/통합 테스트 (Vitest + Playwright)

---

## 8. 트러블슈팅

### 로그인 버튼 클릭 후 브라우저가 안 열림
- Doppler 환경변수 `VITE_GOOGLE_DESKTOP_CLIENT_ID` 설정 확인
- Main 프로세스 로그에서 에러 확인 (DevTools → Console 아님, 터미널)

### "VITE_GOOGLE_DESKTOP_CLIENT_ID is not set"
- `doppler run -- pnpm dev` 로 실행했는지 확인
- `doppler secrets` 로 값 존재 확인

### Google 로그인 후 "state mismatch" 오류
- 브라우저 캐시/쿠키 정리 후 재시도
- 서로 다른 로그인 세션이 혼용된 경우

### `safeStorage is not available`
- 일부 Linux 환경에서 발생
- `libsecret-1-dev` 패키지 설치 (Ubuntu/Debian)

### 로그인은 되지만 다음 요청이 401
- Access Token 메모리 초기화 여부 확인
- apiClient의 Authorization 헤더 정상 삽입 여부

### 앱 재시작 시 자동 로그인 안 됨
- `{userData}/refresh.bin`, `last-access.bin` 파일 존재 확인
- 백엔드 Redis 키 TTL 만료 여부 확인
- 네트워크 오류 시 자동 폐기되어 재로그인 필요
