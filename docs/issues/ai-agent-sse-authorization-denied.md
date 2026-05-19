# 🐛 AI Agent SSE 응답 후 클라이언트 `network error` 발생

> **status:** ✅ 해결 완료 (commit `49ed816` / master 머지 `1853b96`)
> **재현:** AI 회차 생성 같은 30초+ Agent stream 작업 후 항상 발생
> **사용자 영향:** 작업은 성공했는데 화면에 ⚠️ "전송 실패: network error" + DevTools `ERR_HTTP2_PROTOCOL_ERROR`
> **발견:** 2026-05-12 운영 환경
> **영향 사용자:** 시스템 전반 (모든 SSE 호출 사용자)

---

## 1. 증상 — 사용자가 본 것

```
[Folio AI 챗 화면]

4화 "첫 번째 아침"을 작성했습니다.
이 회차에서는 앤이 초록지붕 집에서의...
[본문 1200자 모두 정상 표시]
작가님의 승인을 기다리고 있습니다.

⚠️ 전송 실패: network error    ← 빨간 경고
```

```
[브라우저 DevTools Console]

POST https://folio-editor.co.kr/api/v1/agent/threads/.../messages/stream
net::ERR_HTTP2_PROTOCOL_ERROR 200 (OK)
```

**모순적 상황:**
- HTTP 상태 코드: 200 OK ✅
- 본문은 1200자 모두 도착 ✅
- 그런데 클라이언트는 "에러" 로 인지 ❌

---

## 2. 핵심 진실 정리

| 항목 | 실제 상태 |
|---|---|
| AI 본문 생성 | ✅ 성공 (LLM 호출 89.27초 후 정상 종료) |
| 토큰 차감 | ✅ 성공 (`balance 2026 → 1460`) |
| AGENT-RECEIPT 발급 | ✅ 성공 |
| SSE 본문 전송 | ✅ 성공 (19,558 bytes 클라이언트 도달) |
| **응답 종료 신호** | ❌ 실패 (HTTP/2 프레임 손상으로 강제 종료) |

**작업 자체는 100% 성공.** 문제는 응답을 "정상 종료" 했다고 클라이언트에 알리는 마지막 단계.

---

## 3. 왜 "network error" 가 떴나 — 클라이언트 측 원인 사슬

```
1. 백엔드가 SSE 본문 19KB 정상 송신 → 클라이언트 받음
2. 백엔드가 응답 마무리 단계에서 권한 거부 발생
3. Spring 이 에러 응답 보내려 함
4. 그러나 응답은 이미 송신 완료 상태 (committed)
5. HTTP 프로토콜상 한 번 committed 된 응답에 추가 송신 불가
6. Spring 이 처리 못하고 connection 강제 종료
7. nginx: "upstream prematurely closed connection"
8. nginx → 클라이언트: HTTP/2 프레임 손상 상태로 응답 끊김
9. 브라우저: ERR_HTTP2_PROTOCOL_ERROR 인지
10. 프론트엔드 SSE 라이브러리: connection 끊김 = 에러
11. 화면에 빨간 ⚠️ "전송 실패: network error" 표시
```

**핵심:** 본문은 다 받았는데, 백엔드가 "끝났습니다" 깨끗한 신호를 못 보내고 연결을 강제로 끊어서 클라이언트가 "비정상 종료" 로 인지.

---

## 4. 근본 원인 — 백엔드 측 원인 사슬

### Spring 의 비동기 응답 처리 메커니즘

SSE 같은 비동기 응답을 Spring 이 어떻게 처리하는지:

```
1. 클라이언트 요청 (Authorization 헤더 포함)
2. [SecurityFilterChain 1차 실행]
   - JwtAuthenticationFilter: 토큰 검증, SecurityContext 설정 ✅
   - AuthorizationFilter: URL 권한 검사 ✅
3. 컨트롤러 진입
4. SseEmitter 반환 → 컨트롤러 메서드 종료 (즉시 반환)
5. 가상 스레드가 89초 동안 SSE 본문 송신
6. 송신 완료 시 emitter.complete() 호출
7. ⭐ Spring 이 자동으로 ASYNC dispatch 발생
   - 같은 URL 로 가짜 servlet 요청 한 번 더 생성
   - 비동기 요청 마무리·자원 정리 목적
8. [SecurityFilterChain 2차 실행] ← 여기서 문제 발생
   - JwtAuthenticationFilter: 가짜 요청에 헤더 없음 → SecurityContext 못 채움
   - AnonymousAuthenticationFilter: anonymous 로 설정
   - AuthorizationFilter: anyRequest().authenticated() 룰 위반 → 거부
   - AuthorizationDeniedException 발생
9. ExceptionTranslationFilter 가 에러 응답 시도
   - response.isCommitted() == true (SSE 로 이미 송신 완료)
   - ServletException: "Unable to handle ... response is already committed"
10. Spring 이 응답 마무리 못 하고 connection 강제 종료
11. nginx 가 "upstream prematurely closed connection" 감지
12. 클라이언트에 HTTP/2 프레임 손상 상태로 종료 전달
```

### 왜 ASYNC dispatch 가 일어나나

**Spring MVC 의 표준 동작.** 비동기 응답 마무리 시 자원 정리를 위해 같은 요청 흐름을 한 번 더 실행:

- AsyncContext 종료
- Servlet 응답 stream close
- Tomcat 워커 풀 반환
- 인터셉터 afterCompletion 콜백
- 트레이싱·로깅 정리

→ 우리가 끄거나 우회할 수 없는 Spring 내부 동작.

### 왜 dispatch 된 요청에 헤더가 없나

**Spring 의 구조적 한계.** ASYNC dispatch 가 만든 가짜 servlet 요청은 원래 클라이언트가 보낸 HTTP 헤더를 자동으로 상속받지 않음:

```
원래 요청 (클라이언트):
  Authorization: Bearer abc...    ← JWT 있음

ASYNC dispatch 시 가짜 요청 (Spring 내부):
  (헤더 없음)                     ← JWT 없음
```

→ JwtAuthenticationFilter 가 토큰 못 찾음 → SecurityContext 못 설정 → anonymous → 거부.

### 왜 거부 → 에러 응답이 깨지나

**HTTP 프로토콜 제약.** 응답 body 의 첫 바이트가 클라이언트에 송신되면 `response.isCommitted() == true` 상태.

- Committed 응답에는 헤더·상태코드 변경 불가
- 추가 body 데이터 송신 시 HTTP/2 프레이밍 깨짐
- Spring 이 에러 응답을 쓰려고 하면 ServletException 발생
- 결국 connection 강제 종료

### 증거 체인

#### 백엔드 로그 (수정 전)

```
[EXT_OK] op=streamAgentMessage elapsedMs=89270 status=ok          ← 정상 종료
                  ↓ (2ms 후)
AuthorizationDeniedException: Access Denied                       ← 1차 에러
  at AuthorizationFilter.doFilter(line 99)
                  ↓
Unable to handle the Spring Security Exception
because the response is already committed                          ← 2차 에러
                  ↓
Cannot render error page for request [null] as the response
has already been committed                                          ← 3차 에러
```

#### nginx 로그 (수정 전)

```
upstream prematurely closed connection while reading upstream
client: 14.50.47.100
request: "POST /api/v1/agent/threads/.../messages/stream HTTP/2.0"
status: 200, request_time: 89.292
```

#### 결정적 단서

- `[EXT_OK]` 와 `AuthorizationDeniedException` 사이 시간차 **2ms** = SSE 정상 종료 직후 발생
- Access Denied 로그의 MDC 가 비어있음 (`httpPath`, `userId` 없음) = 정상 요청 흐름 아닌 내부 dispatch 증거
- `Exception Processing [ErrorPage[errorCode=0, location=/error]]` = `/error` forward 시도

---

## 5. 시도한 해결책 — 6번의 여정

### Track 1️⃣ — AiClient 가상 스레드에 SecurityContext 전파

**가설:** 가상 스레드가 부모 스레드의 SecurityContext 를 상속받지 못해 거부됨.

**적용:** `TraceContextFilter.wrapMdcAndSecurity()` 헬퍼 추가. SecurityContext 를 명시 전파.

**결과:** ❌ 실패. dispatch 가 새 SecurityFilterChain 을 실행하면서 anonymous 로 덮어씀.

**보존 가치:** 가상 스레드 안에서의 정상 동작 안전망. 다른 코드 경로에도 유효.

### Track 2️⃣ — `/error` 를 PUBLIC_ENDPOINTS 에 추가

**가설:** `/error` 가 권한 가드에 막혀 forward 가 깨지는 게 원인.

**적용:** `SecurityConfig.PUBLIC_ENDPOINTS` 에 `"/error"` 추가.

**결과:** ❌ 실패. `/error` 통과는 했지만 응답이 이미 committed 라 `Cannot render error page` 로 또 깨짐.

**보존 가치:** Spring Boot 공식 권장 패턴. 다른 ErrorPage forward 안전망.

### Track 3️⃣ — nginx `chunked_transfer_encoding off` 제거

**가설:** nginx 의 chunked encoding 옵션이 HTTP/2 변환과 충돌해 프레이밍 손상.

**적용:** `infra/prod/nginx/nginx.conf` 의 SSE location 블록에서 `chunked_transfer_encoding off;` 삭제.

**결과:** 부분 도움. nginx 측 프로토콜 위생은 해결. 하지만 백엔드 측 원인은 그대로.

**보존 가치:** HTTP/2 + SSE 환경에서 정확한 nginx 설정.

### Track 4️⃣ — GlobalExceptionHandler 에 AuthorizationDeniedException 핸들러

**가설:** 권한 거부 예외를 `@RestControllerAdvice` 에서 가로채 `response.isCommitted()` 시 조용히 무시.

**적용:** `GlobalExceptionHandler.handleAuthorizationDenied()` 추가.

**결과:** ❌ 실패. `@RestControllerAdvice` 는 Spring MVC DispatcherServlet 단계에서 작동하는데, `AuthorizationDeniedException` 은 그 이전 SecurityFilterChain 단계에서 발생. 핸들러에 도달조차 못 함.

**보존 가치:** 다른 권한 거부 케이스 안전망.

### Track 5️⃣ — SecurityConfig 에 accessDeniedHandler 등록

**가설:** Spring Security 의 공식 권한 거부 핸들러로 committed 가드.

**적용:** `SecurityConfig.exceptionHandling().accessDeniedHandler(...)` 람다 추가.

**결과:** ❌ 실패. Spring Security 의 `ExceptionTranslationFilter:140` 가 `response.isCommitted() == true` 면 `accessDeniedHandler` 를 호출하기 **전에** `ServletException` 을 던짐. 핸들러 도달 불가.

```java
// Spring Security 코드
if (response.isCommitted()) {
    throw new ServletException("Unable to handle the Spring Security Exception because the response is already committed.", ex);
}
this.accessDeniedHandler.handle(...);   // ← committed 면 이 줄 도달 못 함
```

**보존 가치:** 다른 권한 거부 케이스 안전망.

### Track 6️⃣ ⭐ — SSE 엔드포인트를 SecurityFilterChain 자체에서 우회 (성공)

**가설:** 권한 거부 발생 *후* 처리하는 모든 방법이 실패. 거부 자체를 발생시키지 말자.

**적용 1:** `SecurityConfig.PUBLIC_ENDPOINTS` 에 SSE 엔드포인트 추가.

```java
"/api/v1/agent/threads/*/messages/stream"
```

**적용 2:** `AgentController.streamMessage` 에 anonymous 차단 가드 추가.

```java
if (auth == null || "anonymousUser".equals(auth.getName())) {
    throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
}
```

**작동 원리:**
- `AuthorizationFilter` 가 SSE URL 을 permitAll 룰로 인식 → 검사 패스
- 1차 진입 시: 컨트롤러 첫 줄의 anonymous 가드 + thread owner 검증이 인증·인가 수행
- 2차 dispatch 시: AuthorizationFilter 또 패스 → 거부 발생 안 함 → 응답 충돌 없음
- 응답 정상 종료 → 클라이언트 `ERR_HTTP2_PROTOCOL_ERROR` 사라짐

**결과:** ✅ 성공

---

## 6. 최종 해결책 — 코드 변경 요약

### 변경 1: `SecurityConfig.java`

```diff
 private static final String[] PUBLIC_ENDPOINTS = {
     "/actuator/health",
     ...
     "/api/v1/admin/**",
+    // AI Agent SSE 스트리밍 — Spring Security 의 ASYNC dispatch 처리가 committed
+    // 응답에서 깨지는 구조적 이슈(ERR_HTTP2_PROTOCOL_ERROR) 우회.
+    // JwtAuthenticationFilter 는 permitAll 과 무관하게 동작하므로 SecurityContext 는
+    // 정상 채워지고, 컨트롤러의 Authentication auth 파라미터로 사용자 검증을 직접 수행.
+    "/api/v1/agent/threads/*/messages/stream",
 };
```

### 변경 2: `AgentController.java`

```diff
 public SseEmitter streamMessage(
         @PathVariable String threadId,
         @RequestBody MessageClientRequest body,
         Authentication auth,
         HttpServletResponse response
 ) {
+    // 본 엔드포인트는 SecurityConfig 의 PUBLIC_ENDPOINTS 에 등록되어
+    // AuthorizationFilter 의 거부를 우회한다. 대신 인증/소유권 검증은
+    // 본 컨트롤러에서 직접 수행.
+    if (auth == null || auth.getName() == null || "anonymousUser".equals(auth.getName())) {
+        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "authentication required");
+    }
     UUID writerUuid = UUID.fromString(auth.getName());
     Map<String, Object> thread = aiClient.getAgentThread(threadId);
     String scenario = (String) thread.get("scenario");
     if (!auth.getName().equals(thread.get("writer_id"))) {
         throw new ResponseStatusException(HttpStatus.FORBIDDEN, "thread owner mismatch");
     }
     ...
 }
```

---

## 7. 보안 영향 분석

| 검증 항목 | 변경 전 | 변경 후 |
|---|---|---|
| JWT 토큰 검증 | `JwtAuthenticationFilter` | `JwtAuthenticationFilter` (그대로) |
| 사용자 식별 | SecurityContext 자동 | SecurityContext 자동 (그대로) |
| anonymous 차단 | `AuthorizationFilter` (자동) | 컨트롤러 첫 줄 (수동) |
| Thread owner 검증 | 컨트롤러 | 컨트롤러 (그대로) |
| 토큰 잔액 검증 | 컨트롤러 | 컨트롤러 (그대로) |
| 거부 결과 | 401 / 403 | 401 / 403 (동일) |

**보호 동일.** 검사 위치만 SecurityFilterChain → 컨트롤러 첫 줄로 이동.

### 잠재 트레이드오프

1. **89초 사이 사용자 권한 변경 감지 불가** — Spring 의 2차 검사 목적 (세션 만료, 권한 박탈 감지) 이 사라짐. 그러나 89초는 짧고, 즉시 강퇴는 별도 메커니즘 (토큰 블랙리스트 등) 으로 처리 가능.

2. **새 SSE 엔드포인트 추가 시 같은 패턴 반복 필요** — `PUBLIC_ENDPOINTS` 추가 + 컨트롤러 가드. 팀 컨벤션으로 명문화 권장.

3. **컨트롤러에 보안 책임 추가** — 누군가 가드 빼먹으면 진짜 보안 구멍. 코드 리뷰 시 주의.

---

## 8. 적용 후 검증

### 백엔드 로그 (수정 후)

```
[EXT_OK] op=streamAgentMessage elapsedMs=89270 status=ok    ← 정상 종료
(이후 아무 ERROR 없음)
```

`AuthorizationDeniedException`, `Cannot render error page`, `response is already committed` 모두 사라짐.

### 클라이언트 측

- DevTools Console: `ERR_HTTP2_PROTOCOL_ERROR` 사라짐 ✅
- 화면 빨간 ⚠️ "전송 실패" 사라짐 ✅
- SSE 본문 정상 수신 + 깔끔한 종료 ✅

### nginx 로그

- `upstream prematurely closed connection` 사라짐 ✅

---

## 9. 향후 개선 (백로그)

### 단기

- [ ] 신규 SSE 엔드포인트 추가 시 본 패턴 적용을 보장하는 코드 리뷰 가이드 작성
- [ ] 컨트롤러의 anonymous 가드를 공통 유틸 메서드로 추출 (예: `ensureAuthenticated(auth)`)

### 중기

- [ ] Spring Security 의 별도 `SecurityFilterChain` Bean 분리 검토 — SSE 전용 정책
- [ ] `StreamingResponseBody` 등 비동기 메커니즘 대안 평가

### 장기

- [ ] WebSocket 전환 검토 (Spring 의 STOMP 또는 raw WebSocket) — 양방향 통신 + 더 안정적인 권한 처리

---

## 10. 변경 이력

| 커밋 | 내용 | 효과 |
|---|---|---|
| `1830f13` (Track 1) | `AiClient` 가상 스레드 SecurityContext 전파 | 안전망 |
| `225a747` (Track 2) | `/error` permitAll 추가 | 안전망 |
| `b3032ac` (Track 3) | nginx `chunked_transfer_encoding off` 제거 | 부분 해결 |
| `6d79a49` (Track 4) | `GlobalExceptionHandler` 권한 거부 핸들러 | 안전망 (미발화) |
| `0e66135` (Track 5) | `SecurityConfig.accessDeniedHandler` | 안전망 (미발화) |
| **`49ed816` (Track 6)** ⭐ | **SSE 엔드포인트 SecurityFilterChain 우회** | **진짜 해결** |
| `1853b96` | `develop → master` 머지 (Track 6 배포) | 운영 반영 |

---

## 11. 참고

- Spring Security 의 `ExceptionTranslationFilter` 동작: 응답 committed 시 핸들러 우회 후 ServletException
- Spring MVC 의 ASYNC dispatch: 비동기 응답 마무리 표준 절차
- HTTP/2 프레이밍 제약: committed 응답에 추가 송신 불가
- nginx 의 `proxy_buffering off` + HTTP/1.1 keep-alive: SSE 권장 설정
