# Folio - ERD (Entity Relationship Diagram)

## 개요

데이터베이스는 두 영역으로 분리된다.

- **동기화 대상 (SQLite + PostgreSQL)**: PowerSync를 통해 로컬 ↔ 서버 간 동기화되는 테이블
- **서버 전용 (PostgreSQL only)**: 인증, 결제, 로그 등 서버에서만 관리되는 테이블

모든 동기화 대상 테이블은 `writer_id`를 포함하여 PowerSync의 row-level security 필터링에 사용한다.
충돌 해결은 `updated_at` 기반 last-write-wins 전략을 따른다.

---

## 1. 동기화 대상 (SQLite + PostgreSQL)

### 1.1 Work (워크스페이스)

작품 단위의 워크스페이스.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| writer_id | UUID | FK → Writer | |
| title | VARCHAR(200) | NOT NULL | 작품명 |
| author_name | VARCHAR(100) | | 작가명 (기본값: 계정 이름) |
| description | TEXT | | 작품 설명/시놉시스 |
| status | VARCHAR(20) | NOT NULL | 연재중/완결/휴재/trashed |
| sort_order | INTEGER | NOT NULL | 목록 정렬 순서 |
| genres | JSONB (PG) / TEXT (SQLite) | | 장르 태그 배열 (판타지, 로맨스 등). 평문 메타. (구) plan 테이블에서 이전됨 |
| moods | JSONB (PG) / TEXT (SQLite) | | 분위기 태그 배열 (진지, 다크 등). 평문 메타. (구) plan 테이블에서 이전됨 |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |

---

### 1.2 Plan (기획) — **폐기됨**

> **변경 이력**: ERD 정리로 두 단계에 걸쳐 완전 폐기됨.
> - 1단계: `slogan`, `genres`, `moods`, `target_audience` 컬럼 폐기
>   - `genres`, `moods` → `work` 테이블로 이전 (1.1 참조)
>   - `slogan`, `target_audience` → 사용처 없어 폐기
> - 2단계: 빈 껍데기가 된 plan 테이블 자체 DROP. `plan_note` 가 `work_id` 를 직접 FK 로 가지므로 부모 행 불필요.
>
> 자유 기획 문서는 `plan_note` 단독으로 관리한다 (1.x 참조).

---

### 1.3 WorldNote (세계관 노트)

중첩 가능한 세계관 노트. `parent_id` 자기참조로 트리 구조.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| work_id | UUID | FK → Work | |
| writer_id | UUID | FK → Writer | |
| parent_id | UUID | FK → WorldNote, NULL | NULL이면 최상위 노트 |
| name | VARCHAR(200) | NOT NULL | 노트 제목 |
| content | TEXT | | TipTap JSON 본문 |
| sort_order | INTEGER | NOT NULL | 형제 노트 간 정렬 |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |

**기본 템플릿 (워크스페이스 생성 시 앱 로직으로 자동 생성, 사용자 자유 편집/삭제 가능):**
- 시대/배경, 공간/지리, 세력/조직, 규칙/법칙, 역사/연표

---

### 1.4 Character (등장인물)

인물 카드.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| work_id | UUID | FK → Work | |
| writer_id | UUID | FK → Writer | |
| name | VARCHAR(200) | NOT NULL | 캐릭터 이름 |
| profile_image_url | TEXT | | 프로필 이미지 경로 |
| gender | VARCHAR(20) | NOT NULL | 남/여/기타/미설정 |
| age | VARCHAR(100) | NOT NULL | 자유 입력 ("25세", "불명") |
| appearance | TEXT | NOT NULL | 외형 묘사 |
| mbti | VARCHAR(10) | | MBTI 선택값 |
| personality | TEXT | | 성격 보충 설명 |
| content | TEXT | | TipTap JSON 자유 노트 |
| sort_order | INTEGER | NOT NULL | |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |

---

### 1.5 CharacterCustomField (인물 커스텀 필드)

사용자가 자유롭게 추가하는 인물 필드.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| character_id | UUID | FK → Character | |
| field_name | VARCHAR(100) | NOT NULL | 필드명 (특기, 약점 등) |
| field_value | TEXT | | 필드 값 |
| sort_order | INTEGER | NOT NULL | |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |

---

### 1.6 CharacterTag (인물 ↔ 세계관 태그)

Character와 WorldNote 간 다대다 연결. 통합 태그 시스템.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| character_id | UUID | FK → Character | |
| world_note_id | UUID | FK → WorldNote | 세력/조직, 공간/지리 등 어떤 세계관 노트든 연결 |
| created_at | TIMESTAMP | NOT NULL | |

**UNIQUE(character_id, world_note_id)**

---

### 1.7 Plot (플롯)

줄거리 설계 노트. `parent_id` 자기참조로 막 > 회차 계층.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| work_id | UUID | FK → Work | |
| writer_id | UUID | FK → Writer | |
| parent_id | UUID | FK → Plot, NULL | NULL이면 최상위 (막 또는 회차) |
| title | VARCHAR(200) | NOT NULL | 제목 |
| status | VARCHAR(20) | | 예정/작성중/완료 (막 노드는 NULL) |
| content | TEXT | | TipTap JSON 플롯 내용 |
| sort_order | INTEGER | NOT NULL | |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |

---

### 1.8 Episode (원고)

실제 원고 본문. `parent_id` 자기참조로 막 > 회차 계층.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| work_id | UUID | FK → Work | |
| writer_id | UUID | FK → Writer | |
| parent_id | UUID | FK → Episode, NULL | NULL이면 최상위 |
| title | VARCHAR(200) | NOT NULL | 회차 제목 |
| status | VARCHAR(20) | NOT NULL | 미작성/초고/퇴고/완성/trashed |
| content | TEXT | | TipTap JSON 원고 본문 |
| word_count | INTEGER | NOT NULL DEFAULT 0 | 자동 계산 글자수 |
| sort_order | INTEGER | NOT NULL | |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |

---

### 1.9 PlotEpisodeLink (플롯 ↔ 원고 링크)

플롯 회차와 원고 회차 간 1:1 양방향 연결.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| plot_id | UUID | FK → Plot, UNIQUE | 1:1 보장 |
| episode_id | UUID | FK → Episode, UNIQUE | 1:1 보장 |
| created_at | TIMESTAMP | NOT NULL | |

---

### 1.10 Foreshadow (복선)

복선 카드.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| work_id | UUID | FK → Work | |
| writer_id | UUID | FK → Writer | |
| title | VARCHAR(200) | NOT NULL | 복선명 |
| status | VARCHAR(20) | NOT NULL | 진행중/완결/폐기 |
| importance | VARCHAR(10) | NOT NULL | 상/중/하 |
| content | TEXT | | TipTap JSON 메모 |
| sort_order | INTEGER | NOT NULL | |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |

---

### 1.11 ForeshadowLink (복선 ↔ 회차 연결)

복선의 심기/회수 시점을 원고 또는 플롯 회차와 연결.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| foreshadow_id | UUID | FK → Foreshadow | |
| link_type | VARCHAR(20) | NOT NULL | plant(심기) / resolve(부분회수) / final_resolve(완결) |
| episode_id | UUID | FK → Episode, NULL | 원고 회차 연결 시 |
| plot_id | UUID | FK → Plot, NULL | 플롯 회차 연결 시 |
| context_memo | TEXT | | 맥락 메모 |
| created_at | TIMESTAMP | NOT NULL | |

**CHECK(episode_id IS NOT NULL OR plot_id IS NOT NULL)** — 둘 중 하나는 반드시 존재

---

### 1.12 IdeaArchive (아이디어 아카이브)

영감, 좋은 문장, 표현 등을 저장.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| work_id | UUID | FK → Work | |
| writer_id | UUID | FK → Writer | |
| content | TEXT | NOT NULL | TipTap JSON 본문 |
| tag | VARCHAR(20) | | 문장/장면/설정/반전/대사 중 택 1 (NULL 허용) |
| sort_order | INTEGER | NOT NULL | |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |

---

## 2. 서버 전용 (PostgreSQL only)

### 2.1 Writer (사용자)

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| email | VARCHAR(255) | NOT NULL, UNIQUE | |
| password_hash | VARCHAR(255) | | OAuth 전용 사용자는 NULL |
| nickname | VARCHAR(100) | | 작가명 기본값 |
| profile_image_url | TEXT | | 프로필 이미지 URL (OAuth 제공자에서 수신) |
| role | VARCHAR(20) | NOT NULL DEFAULT 'USER' | USER / PREMIUM / ADMIN |
| oauth_provider | VARCHAR(50) | | google 등 |
| oauth_id | VARCHAR(255) | | OAuth 제공자별 ID |
| created_at | TIMESTAMP | NOT NULL | |
| deleted_at | TIMESTAMP | | 소프트 삭제 |

**Refresh Token은 Redis에 저장한다 (별도 테이블 없음).**
- Key: `RT:{writer_id}:{device_id}` — 기기별 분리 (다중 로그인 지원)
- TTL: Refresh Token 만료 시간과 동일
- 특정 기기 로그아웃 시 해당 Key만 삭제, 전체 로그아웃 시 `RT:{writer_id}:*` 패턴 일괄 삭제

---

### 2.2 AuditLog (감사 로그)

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| writer_id | UUID | FK → Writer, NULL | |
| action | VARCHAR(100) | NOT NULL | |
| ip_address | VARCHAR(50) | | |
| user_agent | VARCHAR(500) | | |
| created_at | TIMESTAMP | NOT NULL | |

---

### 2.3 Payment (결제)

토스페이먼츠 결제 1건 단위. 1회성(토큰 충전)과 정기결제(프로 구독)의 매 회차 결제가 모두 기록된다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| writer_id | UUID | FK → Writer | |
| order_id | VARCHAR(100) | NOT NULL, UNIQUE | 우리가 발급하는 주문 고유번호 (토스 전달용, 중복 방지 위해 UNIQUE) |
| payment_key | VARCHAR(200) | | 토스가 발급하는 결제 식별자 (승인 완료 시 채워짐) |
| amount | INTEGER | NOT NULL | 결제 금액 (원) |
| token_qty | INTEGER | NOT NULL | 충전될 토큰 수량 |
| status | VARCHAR(20) | NOT NULL | READY / IN_PROGRESS / DONE / CANCELED / FAILED |
| method | VARCHAR(20) | | 결제수단 (CARD / VIRTUAL_ACCOUNT / EASY_PAY 등) |
| approved_at | TIMESTAMP | | 토스 승인 완료 시각 (승인 전에는 NULL) |
| failure_reason | TEXT | | 실패 시 토스가 반환한 원인 코드·메시지 |
| created_at | TIMESTAMP | NOT NULL | 결제 요청 생성 시각 |
| updated_at | TIMESTAMP | NOT NULL | |

**추가 필드 이유**:
- `order_id UNIQUE`: 코드 버그로 같은 주문번호가 중복 INSERT되면 DB가 차단
- `method`: 가상계좌는 입금 전까지 PENDING 유지 등 결제수단별 분기에 필요
- `approved_at`: 요청·승인 시각이 다르므로 환불 기한·세무 대응에 필요
- `failure_reason`: CS 대응 (작가 "왜 결제 안 됐어요?" 문의)

---

### 2.4 Subscription (구독)

프로 구독 이력. 활성 구독은 한 작가당 최대 1건(`status='ACTIVE'`), 재구독 시 새 레코드를 INSERT하여 이력 누적.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| writer_id | UUID | FK → Writer | |
| customer_key | VARCHAR(100) | NOT NULL, UNIQUE | 토스에 전달하는 작가 식별자 (빌링키 발급 시 세트) |
| billing_key | VARCHAR(200) | NOT NULL | 토스가 발급하는 정기결제 티켓 (카드 정보 대체) |
| plan | VARCHAR(50) | NOT NULL | PRO 등 |
| monthly_tokens | INTEGER | NOT NULL | 매월 자동 충전 토큰 수 |
| status | VARCHAR(20) | NOT NULL | ACTIVE / CANCELLED / PAYMENT_FAILED / EXPIRED |
| next_billing_at | TIMESTAMP | NOT NULL | 다음 청구 예정일 |
| last_payment_at | TIMESTAMP | | 마지막 성공 결제 시각 (재시도 판단 기준) |
| retry_count | INTEGER | NOT NULL DEFAULT 0 | 결제 실패 연속 재시도 횟수 (3회 초과 시 PAYMENT_FAILED) |
| cancelled_at | TIMESTAMP | | 작가가 취소한 시각 |
| created_at | TIMESTAMP | NOT NULL | |

**추가 필드 이유**:
- `customer_key`: 토스 정기결제 API가 필수로 요구. 내부 `writer.id`를 그대로 노출하지 않기 위해 별도 식별자 사용 (토스 보안 가이드)
- `last_payment_at`: 결제 실패 재시도 스케줄러가 "이미 처리된 건지" 판단
- `retry_count`: 3일 간격 3회 재시도 정책 구현용

---

### 2.5 TokenWallet (토큰 잔액)

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| writer_id | UUID | PK, FK → Writer | |
| balance | INTEGER | NOT NULL DEFAULT 0 | |
| total_charged | INTEGER | NOT NULL DEFAULT 0 | |
| total_used | INTEGER | NOT NULL DEFAULT 0 | |
| updated_at | TIMESTAMP | NOT NULL | |

---

### 2.6 TokenTransaction (토큰 거래 내역)

토큰 충전·차감·만료의 append-only 원장. 잔액은 `TokenWallet`에 스냅샷으로 유지하지만, 정산·감사 시 이 원장이 진실의 소스가 된다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| writer_id | UUID | FK → Writer | |
| amount | INTEGER | NOT NULL | 양수=충전, 음수=차감 |
| type | VARCHAR(20) | NOT NULL | CHARGE / SUBSCRIPTION / USAGE / EXPIRE / REFUND |
| reason | VARCHAR(100) | | 사유 (AI_DRAFT, AI_REVIEW, AUTO_SUMMARY 등) |
| reference_id | UUID | | 연관된 레코드 ID (Payment, AIAnalysis 등) |
| expires_at | TIMESTAMP | | 충전 토큰의 만료일 (기획: 1년 유효). 차감/만료 타입은 NULL |
| created_at | TIMESTAMP | NOT NULL | |

**추가 필드 이유**:
- `expires_at`: 기획안 "토큰 1년 유효, 이월 가능" 조건 구현. 충전 레코드별로 만료일을 기록해 선입선출(FIFO) 차감 가능. 나중에 추가하면 기존 원장 전체를 백필해야 하는 마이그레이션 부담이 크므로 지금 추가

---

### 2.7 AIAnalysis (AI 분석)

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| writer_id | UUID | FK → Writer | |
| work_id | UUID | FK → Work | |
| episode_id | UUID | FK → Episode | |
| setting_conflicts | TEXT | | |
| tone_conflicts | TEXT | | |
| new_items | TEXT | | |
| tokens_used | INTEGER | NOT NULL | |
| created_at | TIMESTAMP | NOT NULL | |

---

### 2.8 Export (내보내기)

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| writer_id | UUID | FK → Writer | |
| work_id | UUID | FK → Work | |
| format | VARCHAR(20) | NOT NULL | DOCX/PDF/TXT |
| status | VARCHAR(20) | NOT NULL | |
| file_url | VARCHAR(500) | | |
| expires_at | TIMESTAMP | | |
| created_at | TIMESTAMP | NOT NULL | |

---

### 2.9 Notification (알림)

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| writer_id | UUID | FK → Writer | |
| type | VARCHAR(50) | NOT NULL | system / payment / subscription / usage 등 |
| title | VARCHAR(200) | NOT NULL | 알림 제목 |
| message | TEXT | | 알림 내용 |
| is_read | BOOLEAN | NOT NULL DEFAULT false | 읽음 여부 |
| expires_at | TIMESTAMP | | TTL — 만료 시 자동 삭제 |
| created_at | TIMESTAMP | NOT NULL | |

---

### 2.10 AIPromptTemplate (AI 프롬프트 템플릿)

관리자가 관리하는 AI 프롬프트 템플릿. 클라이언트 수정 없이 프롬프트 개선 가능.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| name | VARCHAR(100) | NOT NULL, UNIQUE | 템플릿 식별명 (analyze, suggest, summary 등) |
| description | VARCHAR(500) | | 템플릿 설명 |
| prompt_template | TEXT | NOT NULL | 프롬프트 본문 (변수 치환 포함) |
| model | VARCHAR(50) | NOT NULL | 사용할 AI 모델 (gpt-4o, claude-sonnet 등) |
| max_tokens | INTEGER | NOT NULL | 최대 응답 토큰 수 |
| token_cost | INTEGER | NOT NULL | 1회 호출 시 차감할 사용자 토큰 |
| is_active | BOOLEAN | NOT NULL DEFAULT true | 활성화 여부 |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |

---

### 2.11 PaymentEvent (결제 웹훅 로그)

토스페이먼츠 웹훅 수신 원본. 웹훅이 "최소 한 번 전송"이라 같은 이벤트가 여러 번 도착할 수 있어 멱등성 처리가 필수다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK | |
| event_id | VARCHAR(100) | NOT NULL, UNIQUE | 토스가 발급하는 이벤트 고유번호. UNIQUE 제약으로 중복 자동 차단 |
| event_type | VARCHAR(50) | NOT NULL | PAYMENT.DONE / PAYMENT.CANCELED / VIRTUAL_ACCOUNT.DEPOSITED 등 |
| payload | JSONB | NOT NULL | 웹훅 요청 본문 원본 (감사·디버깅·재처리용) |
| processed_at | TIMESTAMP | NOT NULL DEFAULT now() | |

**동작 원리**:
1. 웹훅 수신 → 맨 먼저 `INSERT INTO payment_event (event_id, ...)` 시도
2. 성공 → 처음 보는 이벤트, 후속 처리 (결제 상태 갱신 + 토큰 충전 등)
3. UNIQUE 위반 → 이미 처리한 이벤트, 200 OK만 반환하고 무시

**왜 필요한가**: 웹훅이 2번 도착해도 DB의 UNIQUE 제약이 원자적으로 중복을 막아준다. 이 테이블이 없으면 같은 결제 승인 이벤트로 토큰이 2번 충전되는 사고가 발생할 수 있다.

---

## 3. 관계 다이어그램

```
Writer (서버 전용)
  │
  ├─1:N── Work (워크스페이스)
  │         ├─1:1── Plan (기획)
  │         ├─1:N── WorldNote (세계관) ──self── parent_id
  │         │         │
  │         │         └──N:N── CharacterTag ──N:N── Character
  │         │
  │         ├─1:N── Character (등장인물)
  │         │         └─1:N── CharacterCustomField
  │         │
  │         ├─1:N── Plot (플롯) ──self── parent_id
  │         │         │
  │         │         └──1:1── PlotEpisodeLink ──1:1── Episode
  │         │
  │         ├─1:N── Episode (원고) ──self── parent_id
  │         │
  │         ├─1:N── Foreshadow (복선)
  │         │         └─1:N── ForeshadowLink ──→ Episode/Plot
  │         │
  │         ├─1:N── IdeaArchive (아이디어)
  │         │
  │
  ├─1:N── AuditLog
  ├─1:N── Payment
  ├─1:N── Subscription (재구독 이력 누적, 활성 구독은 최대 1건)
  ├─1:1── TokenWallet
  ├─1:N── TokenTransaction
  └─1:N── Notification

AIPromptTemplate (독립 — 관리자 전용)
PaymentEvent (독립 — 토스 웹훅 멱등성 로그, Writer FK 없음)
```

---

## 4. 공통 설계 원칙

### 자기참조 중첩 패턴
WorldNote, Plot, Episode는 동일한 `parent_id` 자기참조 패턴을 사용한다.
- `parent_id = NULL` → 최상위 노트 (막 또는 독립 항목)
- `parent_id = {id}` → 해당 노트의 하위 항목
- `sort_order`로 형제 간 순서 관리

### PK 타입
- 모든 PK는 UUID 사용 (PowerSync 동기화 시 충돌 방지)

### 타임스탬프
- `created_at`: 생성 시각 (변경 불가)
- `updated_at`: 최종 수정 시각 (동기화 충돌 해결 기준)

### 소프트 삭제
- **Writer**: `deleted_at` 컬럼으로 소프트 삭제 (계정 탈퇴 후 복구, 결제 이력 보존)
- **Work, Episode**: `status = 'trashed'` 휴지통 패턴 적용
  - 삭제 요청 시 status를 `trashed`로 변경, UI 목록에서 숨김
  - 휴지통에서 확인/복구 가능, 30일 후 배치 작업으로 실제 DELETE (CASCADE 정상 동작)
  - PowerSync/SQLite 스키마 변경 없이 기존 status 필드 활용
- **나머지 엔티티**: 하드 삭제 (동기화 시 PowerSync가 삭제 전파)

### JSONB 사용 규칙
- **JSONB 사용**: DB 내부에서 JSON 요소를 쿼리/검색/필터링해야 하는 컬럼 (Plan의 genres, moods)
- **TEXT 유지**: 저장 후 통째로 읽기만 하는 컬럼 (TipTap content 등)
- PostgreSQL은 JSONB, SQLite는 TEXT로 저장. PowerSync가 자동 변환 처리
