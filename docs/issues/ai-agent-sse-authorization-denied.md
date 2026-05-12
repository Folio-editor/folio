# 🐛 AI Agent SSE 응답 종료 직후 `AuthorizationDeniedException` 발생

> **status:** 원인 확정 (98%) / 미수정
> **재현:** AI 회차 생성 같은 장시간 Agent stream 작업 후 항상 발생
> **사용자 영향:** 작업 자체는 성공했는데 화면에 "전송 실패: network error" 빨간 경고
> **발견 시점:** 2026-05-12 운영 로그
> **영향 사용자:** `6c1117b3...` + `cffba617...` 동일 패턴 확인 → 전체 시스템 패턴

---

## 1. 증상

작가가 AI 챗에서 "4화 회차 작성해줘" 요청 → AI 가 본문 1200+자 정상 생성 → 화면에 실시간 출력 → 마지막 줄까지 표시 후 **빨간 ⚠️ "전송 실패: network error"**.

### 클라이언트 콘솔
```
streamSSE 에러 (구체 메시지 없음)
```

### 서버 응답
```
HTTP 200, body_bytes_sent=19558, request_time=89.292s
그러나 응답 끝맺음 직전 백엔드에서 connection 강제 종료
nginx: "upstream prematurely closed connection while reading upstream"
```

---

## 2. 핵심 진실

| 항목 | 상태 |
|---|---|
| AI 본문 생성 | ✅ 성공 (LLM 호출 89.27초 후 정상 종료) |
| 토큰 차감 | ✅ 성공 (`balance 2026 → 1460`) |
| AGENT-RECEIPT 발급 | ✅ 성공 |
| SSE 본문 전송 | ✅ 성공 (19,558 bytes 클라이언트 도달) |
| **응답 종료 신호** | ❌ 실패 (보안 거부 → 연결 강제 종료) |

**작업 자체는 100% 성공.** 단지 "정상 종료 신호" 만 클라이언트에 전달 못 함.

---

## 3. 원인

### 한 줄
**`SseEmitter.complete()` 후 Spring MVC 가 비동기 응답을 마무리하는 내부 dispatch 가 새 Tomcat 워커에서 처리되는데, 이 워커에는 `SecurityContext` 가 전파되지 않아 anonymous 사용자로 인지됨. `anyRequest().authenticated()` 룰에 막혀 `AuthorizationDeniedException`. `/error` 로 forward 도 권한 가드에 막혀서 연결 강제 종료.**

### 스레드 흐름

```
T0  Tomcat 워커 X
    POST /api/v1/agent/threads/.../messages/stream 도착
    JwtAuthenticationFilter → SecurityContext 설정 ✅
    AgentController.streamMessage() 실행
    SseEmitter emitter 생성 후 return → 워커 풀로 복귀

T1  virtual-521 (AiClient.streamAgentMessage)
    Thread.startVirtualThread(TraceContextFilter.wrapMdc(...))
    ↑ MDC 만 전파, SecurityContext 전파 안 함
    89초 동안 AI 서버에 HTTP POST → SSE 청크 수신 → emitter.send() 반복
    완료 후 emitter.complete()

T2  Tomcat 워커 9 (exec-9, 새 워커)
    Spring MVC 의 AsyncContext 가 dispatch 발생
    그러나 dispatch 된 요청에 JWT 헤더 없음
    → AnonymousAuthenticationFilter 가 anonymous 로 설정
    → AuthorizationFilter 가 anyRequest().authenticated() 룰에 막힘
    → AuthorizationDeniedException

T3  ExceptionTranslationFilter
    표준 에러 응답 시도 → 응답 이미 committed (T1 에서 SSE 송신 완료)
    → "Unable to handle the Spring Security Exception because
       the response is already committed"

T4  Spring Boot ErrorPage
    Exception Processing [ErrorPage[errorCode=0, location=/error]]
    → /error 로 forward 시도
    → /error 도 PUBLIC_ENDPOINTS 에 없어서 또 권한 가드 막힘
    → connection 강제 종료

T5  nginx
    upstream prematurely closed connection
    → 클라이언트 "network error"
```

---

## 4. 증거 체인 (98% 확정)

### 4-1. 로그 증거

#### 모든 정상 로그는 MDC 박혀있음
```
"httpPath":"/api/v1/agent/threads/.../messages/stream"
"userId":"6c1117b3..."
"role":"USER"
```

#### Access Denied 로그만 MDC 비어있음
```
httpPath 없음
userId 없음
role 없음
```
→ **정상 요청 처리 흐름이 아닌 Spring 내부 forward 라는 시그널**

#### `Exception Processing [ErrorPage[errorCode=0, location=/error]]`
→ `/error` 로 forward 시도 직접 확인

#### `exec-9` 워커의 1시간 히스토리
- 평소 처리: `/api/v1/sync/upload`, `/internal/v1/token-receipts`
- 평소엔 `/error` 한 번도 처리 안 함
- 05:22:40 에 갑자기 `/error` 관련 예외 처리
→ **이건 외부 요청이 아니라 내부 dispatch**

#### nginx access log
- 05:22:30 ~ 05:22:48 사이 사용자 IP 의 다른 요청 **없음**
- 오직 `POST /messages/stream` 1건 (status=200, 89.292s)
- → **클라이언트가 별도 호출한 게 아님 = 내부 dispatch 확정**

### 4-2. 코드 증거

#### `AiClient.streamAgentMessage` — SecurityContext 전파 누락
**위치:** `backend/src/main/java/com/storyzip/ai/client/AiClient.java:294`
```java
Thread.startVirtualThread(TraceContextFilter.wrapMdc(() -> {
    // MDC 만 전파, SecurityContext 안 전파
}));
```

#### `SecurityConfig.PUBLIC_ENDPOINTS` — `/error` 누락
**위치:** `backend/src/main/java/com/storyzip/config/SecurityConfig.java:20-51`
```java
private static final String[] PUBLIC_ENDPOINTS = {
    "/actuator/health",
    "/actuator/info",
    ...
    "/api/v1/admin/**"
    // "/error" 누락
};
```

### 4-3. 재현 패턴
- 동일 증상이 다른 사용자 `cffba617...` 의 51초 작업에서도 발생
- 사용자별 권한 문제 아니라 **시스템 패턴**

---

## 5. 영향 범위

### 직접 영향
- **사용자 경험**: AI Agent stream API 사용 시 마지막에 "network error" 표시. 작업은 성공했는데 실패한 것처럼 보임.
- **운영 로그 오염**: 정상 시나리오인데 `AuthorizationDeniedException` ERROR 레벨로 매번 4건씩 쌓임.

### 잠재 영향
- **다른 SSE 호출도 같은 문제 가능성**: `AiClient.streamDraft` 등 같은 패턴이면 동일 버그.
- **`/error` 가 평소 권한 가드에 막힘**: 다른 컨트롤러에서 예외 발생 시에도 잠재적 영향. Spring Boot 공식 권장 위반.

### 영향 없는 것
- AI 작업 결과 (본문, 토큰 차감, 영수증 발급 모두 정상)
- 사용자 데이터 손실 없음
- 시스템 안정성 (단지 한 요청의 응답 마무리만 깨짐)

---

## 6. 해결책

### Track 1 — 응급 패치 (1줄, 1분)
**`/error` 를 PUBLIC_ENDPOINTS 에 추가**

```diff
// backend/src/main/java/com/storyzip/config/SecurityConfig.java

 private static final String[] PUBLIC_ENDPOINTS = {
     "/actuator/health",
     ...
-    "/api/v1/admin/**"
+    "/api/v1/admin/**",
+    "/error"
 };
```

**효과:**
- 비동기 dispatch 가 `/error` 로 forward 되면 통과
- 응답 정상 마무리
- 클라이언트 "network error" 안 뜸

**한계:**
- 근본 원인 (SecurityContext 미전파) 은 그대로
- 로그에 anonymous + `/error` forward 패턴 여전히 찍힘 (오염은 줄지만 깨끗하진 않음)

**Spring Boot 공식 권장이기도 함** — `/error` 는 일반적으로 permitAll 처리.

### Track 2 — 근본 해결 (10줄+, 30분)
**`AiClient` 의 virtual thread 에 SecurityContext 명시 전파**

```diff
// backend/src/main/java/com/storyzip/ai/client/AiClient.java

 public void streamAgentMessage(
         String threadId,
         AgentMessageRequest body,
         SseEmitter emitter
 ) {
+    SecurityContext context = SecurityContextHolder.getContext();
+
     Thread.startVirtualThread(TraceContextFilter.wrapMdc(() -> {
+        SecurityContextHolder.setContext(context);
+        try {
             // 기존 로직
+        } finally {
+            SecurityContextHolder.clearContext();
+        }
     }));
 }
```

**효과:**
- 모든 dispatch 워커가 SecurityContext 가져감
- AuthorizationFilter 가 정상 사용자로 인식
- `/error` forward 자체가 안 일어남
- 로그 깨끗

**적용 범위:**
- `streamAgentMessage`
- `streamDraft`
- 기타 `Thread.startVirtualThread` 로 SSE 송신하는 모든 메서드

**선택:** `wrapMdc` 와 합쳐서 `wrapMdcAndSecurity` 같은 헬퍼 함수로 추출하면 깔끔.

---

## 7. 권장 진행

### 단기 (시연 영상 직전)
**Track 1 적용 → 자동 배포 → 시연 영상 진행**

근거:
- 1줄 수정, 영향 명확, 즉시 가능
- Spring Boot 공식 권장과 일치
- 시연 영상 녹화 중 또 발생 시 짜증

### 중기 (정식 출시 준비)
**Track 2 적용 → 코드 리팩토링**

근거:
- 진짜 근본 원인 제거
- 다른 SSE 호출에서도 같은 문제 재발 방지
- 로그 깨끗

### 둘 다 적용 시
- Track 1 은 그대로 두는 게 안전 (Spring Boot 권장)
- Track 2 적용 후 Track 1 은 백업 안전망 역할

---

## 8. 백로그 등록 정보

### 제목
```
AI Agent SSE 응답 종료 시 AuthorizationDeniedException 발생 — SecurityContext virtual thread 전파 누락
```

### 라벨
- `bug`
- `priority: high`
- `area: agent`
- `area: security`

### 우선순위 근거
- 모든 AI Agent stream 호출에서 항상 발생
- 사용자 경험 직접 손상 (성공한 작업이 실패한 것처럼 보임)
- 정식 출시 전 필수 수정

### 재현 절차
1. 작가 계정으로 로그인
2. AI 챗에서 회차 생성 같은 30초+ 작업 요청
3. 작업 완료 후 화면 우하단 확인
4. "전송 실패: network error" 빨간 경고 표시
5. 백엔드 로그에서 `AuthorizationDeniedException` 확인

### 작업 항목
- [ ] Track 1: `SecurityConfig.PUBLIC_ENDPOINTS` 에 `/error` 추가
- [ ] Track 2: `AiClient.streamAgentMessage` 에 SecurityContext 전파
- [ ] Track 2: `AiClient.streamDraft` 등 다른 SSE 메서드도 동일 패턴 적용
- [ ] `wrapMdc` 와 `wrapSecurityContext` 를 합친 헬퍼 함수 추출
- [ ] 회귀 테스트 추가 (Agent stream 호출 후 응답 정상 종료 확인)
