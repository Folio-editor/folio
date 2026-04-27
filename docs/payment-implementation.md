# Folio — 결제 기능 구현 문서

## 개요

Folio의 AI 크레딧 경제(종량제 + 프로 구독 + 신규 가입 보너스)를 토스페이먼츠 기반으로 구현한다.
데스크탑(Electron) 앱은 시스템 브라우저로 결제창을 열고, 커스텀 스킴 리다이렉트로 앱에 복귀한다.

**Jira**: S14P31F203-56
**작업 브랜치**: `fix/S14P31F203-56_paymentFunction` (develop 기반)
**최종 개정**: 2026-04-24

---

## 1. 크레딧 경제 모델

### 1.1 기본 원칙

- **1크레딧 = 8원** (고정)
- **기능 사용 시 차감 = ROUND(API 원가 × 1.3 ÷ 8)** — 30% 마진 자동 확보
- **토큰 기반 실시간 정산** — 원고 길이 편차 흡수
- 상세 산정 근거는 [Folio_팀논의_AI크레딧정책.md](Folio_팀논의_AI크레딧정책.md) 참고

### 1.2 결제 상품

| 유형 | 가격 | 지급 내용 | 결제 방식 |
|---|---|---|---|
| 신규 가입 보너스 | 0원 | 100 크레딧 (90일 만료) | 자동 지급 |
| 종량제 (소) | 3,000원 | 300 크레딧 (영구) | 1회성 결제 |
| 종량제 (중) | 5,000원 | 550 크레딧 (영구) | 1회성 결제 |
| 종량제 (대) | 10,000원 | 1,200 크레딧 (영구) | 1회성 결제 |
| 프로 구독 | 월 9,900원 | 월 1,300 크레딧 (월말 소멸) | 정기결제 (빌링키) |

### 1.3 크레딧 3종 버킷

유저 지갑의 크레딧은 출처별로 **세 가지 버킷**으로 분리 관리한다. 만료 조건·이월 여부가 다르기 때문이다.

| 버킷 | 출처 | 만료 | 이월 |
|---|---|---|---|
| **구독(subscription)** | 프로 구독 월 갱신 시 지급 | 다음 구독 갱신 시 잔여분 전부 소멸 | 불가 |
| **보너스(bonus)** | 신규 가입 시 100 크레딧 | 가입일 +90일 | 불가 |
| **종량제(purchase)** | 종량제 상품 구매 | 영구 | 가능 |

### 1.4 차감 우선순위

기능 사용 시 **빨리 소멸하는 순서**로 차감한다:

```
구독 → 보너스 → 종량제
```

한 버킷이 부족하면 다음 버킷으로 **자동 이어서 차감**한다.

**예시 — 검수 1회 (29 크레딧) 실행:**

```
유저 지갑:
  구독 잔여   : 10
  보너스 잔여 : 50  (만료 60일 전)
  종량제 잔여 : 500

차감 결과:
  구독에서 10 차감  (0 남음)
  보너스에서 19 차감 (31 남음)
  종량제에서 0 차감 (500 유지)

원장(token_transaction)에 2건 기록:
  - SUBSCRIPTION_USAGE  -10
  - BONUS_USAGE         -19
```

---

## 2. 기능별 크레딧 차감

토큰 기반 실시간 계산식으로 매번 산출한다.

```
API 원가(원) = 입력토큰 × 입력단가 + 출력토큰 × 출력단가
차감 크레딧 = ROUND(API 원가 × 1.3 ÷ 8)
```

### 2.1 모델별 단가 (환율 $1 = 1,450원)

| 모델 | 입력 (1토큰당) | 출력 (1토큰당) |
|---|---|---|
| Haiku 4.5 | 0.00145원 | 0.00725원 |
| Sonnet 4.6 | 0.00435원 | 0.02175원 |
| Opus 4.7 | 0.00725원 | 0.03625원 |
| OpenAI Embedding | 0.0000290원 | - |

### 2.2 대표 차감 예시

| 기능 | 모델 | API 원가 | 차감 크레딧 |
|---|---|---|---|
| 검수 | Sonnet | ~180원 | ~29 |
| 초안 (Sonnet) | Sonnet | ~234원 | ~38 |
| 초안 (Opus) | Opus | ~428원 | ~70 |
| 설정 추출 | Haiku | ~14원 | ~2 |
| 인덱싱 (회차 완료) | OpenAI Embedding | 0.1원 미만 | 0 (무료) |

---

## 3. PG사: 토스페이먼츠

### 3.1 선정 이유

- 국내 작가 타겟 → 국내 PG 선택
- **문서용 테스트 키**로 사업자등록 전부터 개발 가능
  - 클라이언트: `test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm`
  - 시크릿: `test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6`
- 개발자센터 회원가입 시 개발 연동 체험 상점 키 발급 → 웹훅/가상계좌 테스트 가능

### 3.2 운영 전환 일정

출시 3~4주 전까지 아래 절차를 완료한다. 테스트 키 → 라이브 키 교체만으로 전환.

1. 사업자등록 (홈택스, 당일 발급 가능)
2. 통신판매업 신고 (온라인 1~3일)
3. 토스페이먼츠 정식 심사 (서류 제출 후 1~3주)

---

## 4. Electron 연동 방식

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
   │ (5) 백엔드: 토스 승인 API 호출 → 크레딧 충전
   │ (6) 앱에서 잔액 갱신
```

**결제창을 앱 내부 웹뷰로 띄우지 않는 이유**: 카드사 앱 전환, 3DS 인증 등이 Electron 웹뷰에서는 꼬이기 쉽다.

---

## 5. DB 스키마

### 5.1 테이블 구조

| 테이블 | 용도 |
|---|---|
| `payment` | 결제 기록 (orderId, paymentKey, amount, status) |
| `subscription` | 프로 구독 (빌링키, 상태, 다음 청구일) |
| `token_wallet` | 작가별 크레딧 잔액 스냅샷 (3버킷) |
| `token_transaction` | 크레딧 충전/차감 원장 (append-only) |
| `payment_event` | 웹훅 멱등성 로그 |

### 5.2 token_wallet — 3버킷 구조

```sql
CREATE TABLE token_wallet (
    writer_id              UUID PRIMARY KEY REFERENCES writer(id),
    subscription_balance   INTEGER NOT NULL DEFAULT 0,
    bonus_balance          INTEGER NOT NULL DEFAULT 0,
    bonus_expires_at       TIMESTAMP,
    purchase_balance       INTEGER NOT NULL DEFAULT 0,
    updated_at             TIMESTAMP NOT NULL DEFAULT now()
);
```

**필드 설명**:

| 필드 | 설명 |
|---|---|
| `subscription_balance` | 이번 구독 주기의 잔여 크레딧. 다음 갱신 시 0으로 리셋 |
| `bonus_balance` | 신규 가입 보너스 잔여. 소진 또는 만료 시 0 |
| `bonus_expires_at` | 보너스 만료 시각. `NULL`이면 보너스 미지급 |
| `purchase_balance` | 종량제 구매 잔여. 영구 |

**총 잔액** = `subscription_balance + bonus_balance + purchase_balance`
(단, 보너스는 `bonus_expires_at > now()` 경우만 유효)

### 5.3 token_transaction — 원장(append-only)

```sql
CREATE TABLE token_transaction (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    writer_id       UUID NOT NULL REFERENCES writer(id),
    bucket          VARCHAR(20) NOT NULL,       -- SUBSCRIPTION | BONUS | PURCHASE
    amount          INTEGER NOT NULL,           -- 양수=충전, 음수=차감
    type            VARCHAR(30) NOT NULL,       -- CHARGE | USAGE | REFUND | EXPIRE
    reason          VARCHAR(100),
    reference_id    UUID,                       -- 연관 Payment/사용 기록 ID
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_tx_writer_created ON token_transaction(writer_id, created_at DESC);
```

**`bucket` 컬럼이 중요한 이유**: 혼합 차감(검수 1회에 구독 10 + 보너스 19) 시 **2건의 원장 레코드로 분리 기록**되어야 감사/리포트가 정확하다.

### 5.4 payment_event — 웹훅 멱등성

토스페이먼츠 웹훅은 최소 한 번(at-least-once) 전송을 보장한다. 같은 이벤트가 여러 번 도착할 수 있어 멱등성 처리가 필수다.

```sql
CREATE TABLE payment_event (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        VARCHAR(100) NOT NULL UNIQUE,
    event_type      VARCHAR(50) NOT NULL,
    payload         JSONB NOT NULL,
    processed_at    TIMESTAMP NOT NULL DEFAULT now()
);
```

**동작 원리**:

1. 웹훅 수신 → 맨 먼저 `INSERT INTO payment_event (event_id, ...)` 시도
2. 성공 → 처음 보는 이벤트, 결제 처리 로직 실행
3. UNIQUE 위반(이미 있는 event_id) → 이미 처리한 이벤트, 200 OK만 반환하고 무시

DB의 UNIQUE 제약은 원자적이라 두 요청이 동시에 와도 하나만 성공한다.

### 5.5 payment — 필수 필드

| 필드 | 용도 |
|---|---|
| `order_id` UNIQUE | 주문 식별자 (`SZ-` 종량제 / `SUB-` 구독) |
| `payment_key` | 토스 승인 시 발급 |
| `amount` | 결제 금액(원) |
| `credit_qty` | 지급 크레딧 (종량제 상품 또는 구독 플랜 기준) |
| `status` | READY / IN_PROGRESS / DONE / FAILED / CANCELED |
| `method` | CARD / VIRTUAL_ACCOUNT / EASY_PAY 등 |
| `approved_at` | 토스 승인 완료 시각 |
| `failure_reason` | 실패 시 원인 |

### 5.6 subscription — 필수 필드

| 필드 | 용도 |
|---|---|
| `customer_key` UNIQUE | 토스에 전달하는 고객 식별자 |
| `billing_key` | 토스 빌링키 (민감정보) |
| `plan` | PRO_MONTHLY 등 플랜 코드 |
| `monthly_credits` | 월 지급 크레딧 (1,300) |
| `monthly_amount` | 월 요금 (9,900원) |
| `status` | ACTIVE / CANCELLED / PAYMENT_FAILED |
| `next_billing_at` | 다음 청구일 |
| `last_payment_at` | 마지막 성공 결제 시각 |
| `retry_count` | 결제 실패 연속 재시도 횟수 |
| `cancelled_at` | 해지 예약 시점 (status=ACTIVE 유지, 다음 갱신 시 expire) |

---

## 6. 주요 개념

### 6.1 `customer_key` vs `billing_key`

정기결제(프로 구독)에 필요한 두 가지 식별자. 용도가 완전히 다르다.

| 구분 | `customer_key` | `billing_key` |
|---|---|---|
| 누가 만드나 | **백엔드가** 생성해서 프론트 → 토스 전달 | **토스가** 발급해서 백엔드 수신 |
| 값 | `"ck_" + UUID.randomUUID()` (writer_id 무관) | 토스 내부 토큰 |
| 의미 | "우리 시스템의 고객 한 명" 식별자 | "카드 정보를 대체하는 결제 티켓" |
| 노출 가능 | O | X (서버 DB에만 보관) |

**왜 writer.id를 그대로 쓰지 않나**: 토스 보안 가이드는 내부 ID 노출을 피하도록 권장한다. 내부 UUID와 PG 전달용 ID를 분리하면 나중에 PG를 바꾸거나 추가할 때 유연하다.

### 6.2 `paymentKey` vs `billingKey` vs `orderId`

| 식별자 | 발급 주체 | 1회성/재사용 | 용도 |
|---|---|---|---|
| `orderId` | 백엔드 | 1회성 | 주문 식별자 |
| `paymentKey` | 토스 | 1회성 | 단일 결제 건 식별 |
| `billingKey` | 토스 | 재사용 | 정기결제용 카드 참조 토큰 |

---

## 7. 구독 생명주기

### 7.1 만료·종료 케이스

| 케이스 | 처리 |
|---|---|
| A. 작가가 직접 해지 | `cancelled_at` 기록, `status=ACTIVE` 유지. 다음 `next_billing_at` 도달 시 `expire()` → 구독 크레딧 소멸 |
| B. 정기결제 실패 | 3일 간격 3회 재시도 → 최종 실패 시 `status=PAYMENT_FAILED` |
| C. 카드 만료 | B와 동일 흐름 |
| D. 작가 탈퇴 | 토스 빌링키 삭제 + 구독 레코드 soft delete |

### 7.2 해지 시 크레딧 처리

```
1월 1일 : 구독 가입 → subscription_balance = 1,300
1월 5일 : 500 사용 → subscription_balance = 800
1월 20일 : 해지 (cancelled_at 기록, status=ACTIVE 유지)
1월 1일 ~ 1월 31일 : subscription_balance 800 계속 사용 가능
2월 1일 00:00 : 스케줄러가 expire() 호출
              → status=CANCELLED
              → subscription_balance = 0
              → 원장에 EXPIRE 레코드 기록
```

**종량제 크레딧과 보너스 크레딧은 해지와 무관하게 유지**.

### 7.3 재구독 정책

- 재구독 시 **새 subscription 레코드 INSERT** (기존 CANCELLED 재활용 X)
- 한 작가의 활성 구독은 항상 최대 1건
- 재구독 시 `subscription_balance = 1,300` 새로 지급

### 7.4 해지-재구독 어뷰징 방어

> 문제: 월내 해지 → 다음 주기에 재구독을 반복하면 크레딧 무한 누적?

**방어 장치**:
- 구독 크레딧은 `subscription_balance` 단일 필드이므로 **재구독 시 덮어쓰기**만 일어남 (누적 X)
- 이전 주기 잔여분은 `expire()`에서 0으로 초기화되어 소멸
- **종량제/보너스 크레딧은 영향 없음** (의도된 정책)

### 7.5 작가 로그인 시 구독 상태 체크

```
subscription 조회 (writer_id로 활성 구독 찾기)
  ├─ 없거나 CANCELLED                 → "프로 구독 시작" 버튼
  ├─ ACTIVE + cancelled_at 없음       → 프로 기능 활성화
  ├─ ACTIVE + cancelled_at 있음       → 프로 활성 + "해지 예약됨" 배너
  └─ PAYMENT_FAILED                   → "결제 실패, 카드 업데이트" 배너
```

---

## 8. 서비스 로직

### 8.1 TokenWalletService — 충전

```
charge(writerId, bucket, amount, reason, referenceId)
  ├─ SUBSCRIPTION: subscription_balance에 가산 (월 갱신 시 덮어쓰기 방식)
  ├─ BONUS       : bonus_balance = amount, bonus_expires_at = now + 90일
  └─ PURCHASE    : purchase_balance에 가산 (누적)

원장에 bucket/amount/type=CHARGE 기록
```

### 8.2 TokenWalletService — 차감 (혼합 차감)

```
deduct(writerId, requiredAmount, reason, referenceId)
  1. 지갑 락 획득 (PESSIMISTIC_WRITE)
  2. 유효 보너스 확인: bonus_expires_at > now() 이면 bonus_balance 유효
  3. 우선순위대로 차감:
       remaining = requiredAmount
       구독:   deduct_sub = min(remaining, subscription_balance)
              subscription_balance -= deduct_sub
              remaining            -= deduct_sub
       보너스: deduct_bonus = min(remaining, validBonusBalance)
              bonus_balance -= deduct_bonus
              remaining     -= deduct_bonus
       종량제: deduct_pur = min(remaining, purchase_balance)
              purchase_balance -= deduct_pur
              remaining        -= deduct_pur
  4. remaining > 0 이면 INSUFFICIENT_CREDITS 예외
  5. 차감된 버킷별로 원장 레코드 분리 기록 (최대 3건)
```

### 8.3 TokenWalletService — 환불

```
refund(writerId, amount, reason, referenceId)
  — 어느 버킷 크레딧으로 썼는지 무관하게
    purchase_balance에서 우선 차감 (종량제 환불만 허용)
  — purchase_balance 부족 시 가진 만큼만 차감 (에러 X)
```

### 8.4 만료 처리 스케줄러

**구독 크레딧 만료**:
- 별도 스케줄러 불필요. `BillingScheduler`가 월 갱신 결제 성공 시 `subscription_balance = 1,300`으로 덮어쓰기 + 이전 잔여분을 EXPIRE 원장에 기록
- 해지 예약(`cancelled_at != null`) 구독은 `Subscription.expire()`에서 `subscription_balance = 0` + EXPIRE 원장 기록

**보너스 크레딧 만료** (신규 스케줄러 필요):
- 매일 1회 (예: 03:00 UTC) 실행
- `bonus_expires_at < now() AND bonus_balance > 0` 조건 지갑 조회
- `bonus_balance → 0` + EXPIRE 원장 기록

---

## 9. 구현 단계

### 1단계: DB 스키마 마이그레이션

- [ ] `token_wallet`에 `subscription_balance`, `bonus_balance`, `bonus_expires_at`, `purchase_balance` 컬럼 추가
- [ ] 기존 `balance` 값을 `purchase_balance`로 이관 (유저 보호)
- [ ] `token_transaction`에 `bucket` 컬럼 추가 (기존 레코드는 `PURCHASE`로 백필)
- [ ] `payment.token_qty` → `credit_qty` 네이밍 통일 (선택)
- [ ] `subscription.monthly_tokens` → `monthly_credits` 네이밍 통일 (선택)

### 2단계: 백엔드 서비스 로직

- [ ] `TokenWallet` 엔티티에 3버킷 필드 추가
- [ ] `TokenWalletService.charge()` — `bucket` 파라미터 추가
- [ ] `TokenWalletService.deduct()` — 혼합 차감 로직 신설
- [ ] `PaymentService` 종량제 성공 시 `PURCHASE` 버킷 충전
- [ ] `SubscriptionService` 월 갱신 성공 시 `SUBSCRIPTION` 버킷 덮어쓰기
- [ ] `Subscription.expire()` 호출 시 구독 크레딧 0으로 초기화

### 3단계: 신규 가입 보너스

- [ ] 가입 완료 시점에 `bonus_balance = 100`, `bonus_expires_at = now + 90일` 초기화
- [ ] `BonusExpireScheduler` 추가 (일 1회)

### 4단계: 프론트 표시

- [ ] 지갑 UI에 3버킷 잔액 분리 표시 (또는 총합 + 상세보기)
- [ ] 보너스 만료일 D-day 표시
- [ ] 구독 크레딧 "이달 소멸 예정" 안내

### 5단계: 결제/구독 공통 마무리

- [ ] 이전 감사에서 지적된 CRITICAL 이슈 (트랜잭션 경계, Saga 패턴) 반영
- [ ] 웹훅 복구 경로 점검

---

## 10. 데이터 정책

기획안 6장 "작가에게 드리는 3가지 약속"과 정합성 유지.

- 결제 정보는 PG사(토스페이먼츠)에 저장되며, 우리 서버는 `paymentKey`, `orderId`, `billingKey`만 보관
- 카드 번호·CVC·유효기간 등 **민감정보는 절대 저장하지 않는다**
- `billing_key`는 토스의 결제 티켓이지 카드 정보가 아니며, 유출되어도 다른 가맹점에서는 사용 불가
- 탈퇴 시 토스 빌링키 삭제 + 결제 이력은 법정 보관 기간(전자상거래법: 5년) 이후 파기

---

## 11. 결정 이력

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-04-24 | 1크레딧 = 8원 고정 | 원가 변동 대응 유연성 |
| 2026-04-24 | 차감 = ROUND(원가 × 1.3 ÷ 8) | 30% 마진 자동 확보 |
| 2026-04-24 | 3버킷 구조(구독/보너스/종량제) | 만료 정책 차등 적용 |
| 2026-04-24 | 차감 우선순위: 구독 → 보너스 → 종량제 | 빨리 소멸하는 순 |
| 2026-04-24 | 혼합 차감 허용 | 한 버킷 부족 시 이어서 차감 |
| 2026-04-24 | 구독 크레딧 월 소멸, 종량제 영구 이월 | 넷플릭스형 이용권 개념 |
| 2026-04-24 | 신규 가입 보너스 100 크레딧, 90일 만료 | 어뷰징 방어 |

---

## 12. 관련 문서

- [Folio_팀논의_AI크레딧정책.md](Folio_팀논의_AI크레딧정책.md) — 크레딧 단가/마진 산정 상세
- [Folio_AI_비용분석_실측_v2.md](Folio_AI_비용분석_실측_v2.md) — 기능별 API 원가 실측
- [auth-implementation.md](auth-implementation.md) — 인증 구현 참고
- 토스페이먼츠 개발자센터: https://docs.tosspayments.com/
- 문서용 테스트 키 가이드: https://docs.tosspayments.com/blog/test-payment-without-signup
