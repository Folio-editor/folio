# StoryZip — 결제 기능 구현 문서

## 개요

StoryZip의 AI 토큰 경제(종량제 + 프로 구독)를 토스페이먼츠 기반으로 구현한다.
데스크탑(Electron) 앱은 시스템 브라우저로 결제창을 열고, 커스텀 스킴 리다이렉트로 앱에 복귀한다.

**Jira**: S14P31F203-56
**작업 브랜치**: `feat/S14P31F203-56_paymentFunction` (develop 기반)

---

## 1. 결제 모델

StoryZip 기획안 v4에서 확정된 토큰 경제를 그대로 반영한다.

| 유형 | 가격 | 지급 내용 | 결제 방식 |
|---|---|---|---|
| 무료 티어 | 0원 | 매달 토큰 500 자동 지급 | - |
| 종량제 (소) | 2,900원 | 토큰 5,000 (1년 유효) | 1회성 결제 |
| 종량제 (중) | 9,900원 | 토큰 20,000 (1년 유효) | 1회성 결제 |
| 종량제 (대) | 19,900원 | 토큰 50,000 (1년 유효) | 1회성 결제 |
| 프로 구독 | 월 9,900원 | 매월 토큰 25,000 자동 충전 | 정기결제 (빌링키) |

### 토큰 차감 기준 (내부 토큰 단위)

- 자동 요약(회차 저장 시): 100 토큰
- AI 검수 1회: 300 토큰
- AI 초안 생성 1회 (2개 초안): 1,500 토큰

---

## 2. PG사: 토스페이먼츠

### 선정 이유

- 국내 작가 타겟 → 국내 PG 선택
- **문서용 테스트 키**로 사업자등록 전부터 개발 가능
  - 클라이언트: `test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm`
  - 시크릿: `test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6`
- 개발자센터 회원가입 시 개발 연동 체험 상점 키 발급 → 웹훅/가상계좌 테스트 가능

### 운영 전환 일정

출시 3~4주 전까지 아래 절차를 완료한다. 테스트 키 → 라이브 키 교체만으로 전환.

1. 사업자등록 (홈택스, 당일 발급 가능)
2. 통신판매업 신고 (온라인 1~3일)
3. 토스페이먼츠 정식 심사 (서류 제출 후 1~3주)

---

## 3. Electron 연동 방식

기존 OAuth 구현([frontend/src/main/auth/oauthServer.ts](../frontend/src/main/auth/oauthServer.ts))의 외부 브라우저 + 로컬 서버 콜백 패턴을 재사용한다.

```
[Electron 앱]                    [시스템 브라우저]               [토스페이먼츠]
   │
   │ (1) 결제 요청 API 호출 → 백엔드에서 orderId 발급
   │ (2) shell.openExternal(결제창 URL) ───────────→
   │ (3) 로컬 HTTP 서버 기동 (랜덤 포트)
   │                                     사용자 결제 진행 ─────────→
   │                                                                │
   │ ←── successUrl/failUrl (http://localhost:{port}/callback) ─────┘
   │
   │ (4) paymentKey + orderId로 백엔드에 승인 요청
   │ (5) 백엔드: 토스 승인 API 호출 → 토큰 충전
   │ (6) 앱에서 잔액 갱신
```

**결제창을 앱 내부 웹뷰로 띄우지 않는 이유**: 카드사 앱 전환, 3DS 인증 등이 Electron 웹뷰에서는 꼬이기 쉽다.

---

## 4. DB 스키마

### 4.1 현재 상태 ([infra/db/schema.sql](../infra/db/schema.sql))

**이미 존재하는 테이블 4개**:

| 테이블 | 용도 |
|---|---|
| `payment` | 결제 기록 (orderId, paymentKey, amount, status) |
| `subscription` | 프로 구독 (빌링키, 상태, 다음 청구일) |
| `token_wallet` | 작가별 토큰 잔액 스냅샷 |
| `token_transaction` | 토큰 충전/차감 원장 (append-only) |

**신규 추가 1개**: `payment_event` (웹훅 멱등성 로그)

### 4.2 payment_event 테이블 (신규)

토스페이먼츠 웹훅은 최소 한 번(at-least-once) 전송을 보장한다. 같은 이벤트가 여러 번 도착할 수 있어 멱등성 처리가 필수다.

```sql
CREATE TABLE payment_event (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        VARCHAR(100) NOT NULL UNIQUE,   -- 토스가 발급하는 고유 이벤트 ID
    event_type      VARCHAR(50) NOT NULL,           -- PAYMENT.DONE, PAYMENT.CANCELED 등
    payload         JSONB NOT NULL,                 -- 웹훅 원본 (디버깅/감사용)
    processed_at    TIMESTAMP NOT NULL DEFAULT now()
);
```

**동작 원리**:

1. 웹훅 수신 → 맨 먼저 `INSERT INTO payment_event (event_id, ...)` 시도
2. 성공 → 처음 보는 이벤트, 결제 처리 로직 실행
3. UNIQUE 위반(이미 있는 event_id) → 이미 처리한 이벤트, 200 OK만 반환하고 무시

DB의 UNIQUE 제약은 원자적이라 두 요청이 동시에 와도 하나만 성공한다. 애플리케이션 레벨의 `if (있나?) then 스킵` 방식보다 안전하다.

### 4.3 기존 테이블 보완 필드

**payment 테이블 — 운영 추적용**

| 추가 필드 | 용도 |
|---|---|
| `approved_at TIMESTAMP` | 토스 승인 완료 시각 |
| `method VARCHAR(20)` | 결제 수단 (CARD, VIRTUAL_ACCOUNT 등) |
| `failure_reason TEXT` | 실패 시 원인 코드·메시지 |
| `order_id`에 UNIQUE 제약 | 동일 주문 중복 방지 |

**subscription 테이블 — 정기결제 운영용**

| 추가 필드 | 용도 |
|---|---|
| `customer_key VARCHAR(100) NOT NULL UNIQUE` | 토스에 전달하는 작가 식별자 (빌링키와 세트) |
| `last_payment_at TIMESTAMP` | 마지막 성공 결제 시각 (재시도 판단) |
| `retry_count INTEGER NOT NULL DEFAULT 0` | 결제 실패 연속 재시도 횟수 |
| (선택) `started_at`, `ended_at` | 체험/예약 구독 도입 시 필요 |

**token_transaction 테이블 — 만료 처리용**

| 추가 필드 | 용도 |
|---|---|
| `expires_at TIMESTAMP` | 토큰 1년 유효 만료일 (기획안 명시) |

---

## 5. 주요 개념

### 5.1 `customer_key` vs `billing_key`

정기결제(프로 구독)에 필요한 두 가지 식별자다. 용도가 완전히 다르다.

| 구분 | `customer_key` | `billing_key` |
|---|---|---|
| 누가 만드나 | **우리가** 생성해서 토스에 전달 | **토스가** 발급해서 우리에게 전달 |
| 의미 | "우리 시스템의 고객 한 명" 식별자 | "카드 정보를 대체하는 결제 티켓" |
| 보안 | 외부 노출 가능한 식별자 | 민감정보, 서버에만 보관 |

**흐름**:

```
1. 작가 A가 "프로 구독" 클릭
2. 백엔드: customer_key = "ck_8f3d..." 랜덤 생성 (또는 writer.id 기반)
3. 결제창에서 카드 등록 → 토스가 billing_key 발급해서 반환
4. subscription INSERT: (writer_id, customer_key, billing_key, status=ACTIVE)
5. 매달 스케줄러: 토스에 "billing_key로 9,900원 결제" API 호출
```

**왜 writer.id를 그대로 쓰지 않나**: 토스 보안 가이드는 내부 ID 노출을 피하도록 권장한다. 로그/분석에 쓰이는 내부 UUID와 PG 전달용 ID를 분리하면 나중에 PG를 바꾸거나 추가할 때 유연하다.

### 5.2 `created_at` vs `started_at`

| 필드 | 의미 | 기록 시점 |
|---|---|---|
| `created_at` | DB 레코드(행)가 INSERT된 시각 | INSERT 순간 자동 |
| `started_at` | 구독이 비즈니스적으로 시작된 시각 | 개발자가 로직으로 지정 |

StoryZip은 무료 체험이나 예약 구독이 기획에 없으므로 **`created_at`만으로 충분하다**. `started_at`은 향후 체험 기능 도입 시 추가.

---

## 6. 구독 생명주기

### 6.1 만료·종료 케이스

| 케이스 | 처리 |
|---|---|
| A. 작가가 직접 취소 | 토스에 빌링키 삭제 → `status='CANCELLED'`, `cancelled_at` 기록. 이번 달 종료일까지 혜택 유지 |
| B. 정기결제 실패 | 3일 간격 3회 재시도 → 최종 실패 시 `status='PAYMENT_FAILED'` → 작가에게 카드 갱신 알림 |
| C. 카드 만료 | B와 동일 흐름 (결제 실패로 감지) |
| D. 작가 탈퇴 | 토스 빌링키 삭제 + 구독 레코드 soft delete |

### 6.2 재구독 정책

**B안 채택 — 새 레코드 생성**

- 재구독 시 기존 CANCELLED 레코드 재활용 대신 **새 subscription 레코드 INSERT**
- 이유: 구독 이력을 여러 건으로 쌓아 "지금까지 몇 번 구독했나" 등 분석 용이
- 한 작가의 활성 구독은 항상 최대 1건(`status='ACTIVE'`)

### 6.3 작가 로그인 시 구독 상태 체크

```
subscription 조회 (writer_id로 활성 구독 찾기)
  ├─ 없거나 CANCELLED/EXPIRED  →  "프로 구독 시작" 버튼
  ├─ ACTIVE + next_billing_at 미래  →  프로 기능 활성화
  └─ PAYMENT_FAILED  →  "결제 실패, 카드 업데이트" 배너
```

---

## 7. 구현 단계

### 1단계: DB 스키마 (현재 작업 대상)

- [ ] `payment_event` 테이블 추가
- [ ] `payment`, `subscription`, `token_transaction` 필드 보완
- [ ] 필요한 인덱스 추가 (`idx_payment_event_type` 등)

### 2단계: 백엔드 도메인 (`backend/src/main/java/com/storyzip/payment/`)

- [ ] 패키지 구조: controller / service / domain / dto / infra
- [ ] 토스페이먼츠 클라이언트 (문서용 테스트 키로 시작)
- [ ] 결제 요청 생성 API → 승인 API → 웹훅 수신 엔드포인트
- [ ] 토큰 충전/차감 서비스 (트랜잭션 원자성 보장)
- [ ] 멱등성 처리 (`payment_event` INSERT 기반)

### 3단계: 프론트 + Electron 연동

- [ ] 토큰 패키지 선택 UI
- [ ] `shell.openExternal`로 외부 브라우저 결제창 열기
- [ ] 커스텀 스킴(`storyzip://payment/success`) 콜백으로 앱 복귀
- [ ] 결제 성공 후 토큰 잔액 갱신

### 4단계: 프로 구독 (빌링키 + 스케줄러)

- [ ] 빌링키 발급 플로우
- [ ] 월별 정기결제 스케줄러 (Spring `@Scheduled` 또는 별도 작업 큐)
- [ ] 실패 재시도 로직 (3회, 3일 간격)
- [ ] 구독 취소/재개 API

---

## 8. 데이터 정책

기획안 6장 "작가에게 드리는 3가지 약속"과 정합성 유지.

- 결제 정보는 PG사(토스페이먼츠)에 저장되며, 우리 서버는 `paymentKey`, `orderId`, `billingKey`만 보관
- 카드 번호·CVC·유효기간 등 **민감정보는 절대 저장하지 않는다**
- `billing_key`는 토스의 결제 티켓이지 카드 정보가 아니며, 유출되어도 다른 가맹점에서는 사용 불가
- 탈퇴 시 토스 빌링키 삭제 + 결제 이력은 법정 보관 기간(전자상거래법: 5년) 이후 파기

---

## 9. 참고 자료

- 토스페이먼츠 개발자센터: https://docs.tosspayments.com/
- 문서용 테스트 키 가이드: https://docs.tosspayments.com/blog/test-payment-without-signup
- 기획안: 프로젝트 내부 문서 v4
- 인증 구현 참고: [docs/auth-implementation.md](auth-implementation.md)
- 프론트 인증 패턴: [docs/auth-frontend.md](auth-frontend.md)
