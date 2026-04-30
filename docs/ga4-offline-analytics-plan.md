# Folio — GA4 오프라인 분석 이벤트 적용 계획

> **작성일**: 2026-04-29  
> **상태**: 설계안  
> **목적**: Folio가 웹과 Electron 데스크탑을 모두 지원하고, 데스크탑 앱은 오프라인에서도 동작하는 에디터라는 점을 고려해, GA4 이벤트를 안전하고 누락 적게 수집하기 위한 적용 계획을 정리한다.

---

## 1. 배경

Folio는 웹과 Electron 데스크탑 양쪽에서 사용할 수 있는 에디터다.

웹 사용자는 일반적인 온라인 SaaS 흐름에 가깝지만, Electron 데스크탑 사용자는 오프라인 상태에서도 문서를 작성하고 편집할 수 있다.

따라서 일반적인 웹 GA4처럼 `gtag()`를 바로 호출하는 방식은 적합하지 않다.

- 오프라인 상태에서는 이벤트 전송 실패
- 재시도/중복 제어 어려움
- GA4 Measurement Protocol secret을 프론트에 넣으면 노출 위험
- 에디터 특성상 본문/제목/캐릭터명 등 민감 데이터가 실수로 전송될 위험

Folio에서는 플랫폼 공통 분석 API를 두고, 플랫폼별 전송/큐 전략만 다르게 가져간다.

```txt
Web      → 공통 analytics.track() → Web queue / sendBeacon / fetch → Backend → GA4
Electron → 공통 analytics.track() → Local queue(SQLite/IndexedDB) → Backend → GA4
```

---

## 2. 목표

1. 웹과 데스크탑에서 동일한 이벤트 스키마를 사용한다.
2. 웹에서는 온라인 중심으로 가볍게 전송하되, 일시 실패 시 짧은 큐를 둔다.
3. 데스크탑에서는 오프라인 중 발생한 주요 사용자 행동을 로컬에 저장한다.
4. 온라인 복귀 후 이벤트를 백엔드로 일괄 전송한다.
5. 백엔드는 GA4 Measurement Protocol로 이벤트를 전달한다.
6. 작품 본문, 문서 제목, 캐릭터명 등 사용자 창작물 데이터는 절대 수집하지 않는다.
7. 중복 전송과 무한 재시도를 방지한다.

---

## 3. 비목표

이번 단계에서는 다음을 하지 않는다.

- 본문 내용 분석
- 문서 제목/캐릭터명/세계관 설정 문장 수집
- 실시간 세션 리플레이
- 키 입력 단위 추적
- 사용자의 작품 품질/내용 평가
- GA4 client secret을 Electron 앱에 포함

---

## 4. 권장 아키텍처

```txt
[Web / Electron Renderer]
  사용자 행동 발생
    │
    ▼
[Analytics Client]
  이벤트 생성 + 개인정보 제거
    │
    ▼
[Local Queue]
  Web: IndexedDB 또는 in-memory retry queue
  Electron: SQLite 또는 IndexedDB
    │
    ├─ 오프라인: 큐에 보관
    │
    └─ 온라인: flush 시도
          │
          ▼
[Backend API]
  POST /api/v1/analytics/events
    │
    ├─ 인증/사용자 확인
    ├─ event_id 중복 제거
    ├─ 허용 이벤트명 검증
    └─ GA4 Measurement Protocol 호출
          │
          ▼
[GA4]
```

---

## 5. 왜 백엔드 중계가 필요한가

GA4 Measurement Protocol은 `api_secret`을 요구한다.

이 값을 Electron 앱이나 renderer 코드에 넣으면 사용자가 앱 패키지를 분석해 secret을 추출할 수 있다.

따라서 프론트는 우리 백엔드로만 이벤트를 보내고, 백엔드가 GA4로 전송한다.

```txt
좋음:
Electron → Folio Backend → GA4

나쁨:
Electron → GA4 Measurement Protocol 직접 호출
```

---

## 6. 로컬 이벤트 큐 설계

### 6.1 플랫폼별 저장 위치

웹:

- 기본은 즉시 전송
- 실패 시 IndexedDB 또는 짧은 in-memory queue에 보관
- 페이지 종료 시 `navigator.sendBeacon()` 사용 검토
- 장기 오프라인 보관은 필수 목표가 아님

Electron:

1. PowerSync 로컬 SQLite 또는 앱 전용 SQLite 테이블
2. IndexedDB
3. localStorage는 비권장

권장안은 SQLite다. 이벤트 큐는 앱 재시작 후에도 유지되어야 하고, flush 성공 시 삭제/상태 변경이 필요하기 때문이다.

단, 이 권장안은 Electron 기준이다. 웹에서는 IndexedDB가 현실적인 1순위다.

### 6.2 테이블 예시

```sql
CREATE TABLE analytics_event_queue (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  event_params TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX idx_analytics_event_queue_sent
  ON analytics_event_queue (sent_at, created_at);
```

### 6.3 이벤트 payload 예시

```json
{
  "id": "7e1d2c6e-8a40-4c30-8e6e-09df8e3e7748",
  "eventName": "document_created",
  "eventParams": {
    "doc_type": "episode",
    "source": "sidebar",
    "offline": true
  },
  "createdAt": "2026-04-29T12:00:00.000Z"
}
```

### 6.4 PowerSync 동기화와의 관계

GA4 이벤트 큐는 Folio의 사용자 데이터 동기화와 다른 흐름이다.

PowerSync가 다루는 동기화 대상은 원고, 기획 문서, 캐릭터, 세계관, 플롯, 복선 같은 **사용자 작업 데이터**다.

반면 GA4 이벤트 큐는 `document_created`, `writing_started`, `sync_failed` 같은 **분석용 이벤트 로그**를 임시 보관하는 용도다.

따라서 `analytics_event_queue`는 PowerSync로 서버에 동기화할 테이블이 아니다.

```txt
사용자 데이터 동기화:
로컬 DB ↔ PowerSync ↔ 서버 DB

GA4 이벤트 flush:
로컬 이벤트 큐 → Folio Backend → GA4
```

권장:

- Electron에서는 로컬 SQLite에 큐 테이블을 둘 수 있다.
- 이 테이블은 PowerSync bucket/sync rule에 포함하지 않는다.
- 웹에서는 IndexedDB 큐를 사용한다.
- 백엔드에는 중복 제거용 `analytics_event_dedup` 테이블을 반드시 둔다.

---

## 7. 이벤트 수집 원칙

### 7.1 수집 가능

제품 사용 흐름과 안정성 파악에 필요한 메타 이벤트만 수집한다.

- 로그인 시도/성공/실패
- 문서 생성/삭제/복구
- 문서 저장 성공/실패
- 동기화 시작/성공/실패
- 오프라인 진입/온라인 복귀
- AI 검수 요청/성공/실패
- 결제 화면 진입/결제 성공/실패
- 테마 변경
- 에디터 세션 시작/종료
- 글자 수 구간

### 7.2 수집 금지

창작물 또는 개인 식별 가능성이 높은 데이터는 수집하지 않는다.

- 문서 본문
- 문서 제목
- 작품 제목
- 캐릭터 이름
- 세계관 설정 문장
- 플롯/복선 내용
- 사용자가 입력한 검색어
- AI 검수 대상 원문

### 7.3 익명화/축약 권장

정확한 값을 보내지 말고 구간화한다.

```txt
좋음:
char_count_bucket: "10k_50k"

나쁨:
char_count: 38421
```

---

## 8. 필수 이벤트 목록

아래 이벤트는 GA4 1차 적용 범위의 필수 이벤트다.

구현 순서는 단계별로 나눌 수 있지만, 최종 수집 범위에서는 제외하지 않는다.

| 이벤트명 | 발생 시점 | 주요 파라미터 |
|---|---|---|
| `landing_viewed` | 랜딩 페이지 진입 | `platform`, `utm_source`, `utm_campaign` |
| `web_enter_clicked` | 랜딩에서 웹으로 이용하기 클릭 | `surface`, `platform` |
| `editor_entered` | 에디터 화면 실제 진입 | `platform`, `entry_source` |
| `writing_started` | 세션 내 첫 글쓰기 행동 발생 | `platform`, `doc_type`, `entry_source` |
| `app_opened` | 앱 시작 | `app_version`, `online` |
| `login_started` | 로그인 버튼 클릭 | `provider` |
| `login_succeeded` | 로그인 완료 | `provider`, `is_new_user` |
| `login_failed` | 로그인 실패 | `reason_code` |
| `desktop_download_clicked` | 웹에서 앱 다운로드 CTA 클릭 | `surface`, `os`, `download_channel` |
| `desktop_download_started` | 데스크탑 설치 파일 다운로드 시작 | `os`, `download_channel` |
| `desktop_download_failed` | 데스크탑 설치 파일 다운로드 실패 | `os`, `download_channel`, `reason_code` |
| `workspace_opened` | 워크스페이스 진입 | `work_count_bucket` |
| `document_created` | 문서 생성 | `doc_type`, `source`, `template_type` |
| `document_edit_started` | 문서에서 첫 수정 발생 | `doc_type`, `char_count_bucket` |
| `document_edit_session_ended` | 문서 이탈/앱 종료/편집 안정화 후 | `doc_type`, `edit_duration_bucket`, `delta_char_count_bucket` |
| `document_deleted` | 문서 삭제 | `doc_type` |
| `document_saved` | 저장 성공 | `doc_type`, `char_count_bucket` |
| `document_save_failed` | 저장 실패 | `doc_type`, `reason_code` |
| `sync_started` | 동기화 시작 | `queue_count_bucket` |
| `sync_succeeded` | 동기화 성공 | `event_count_bucket` |
| `sync_failed` | 동기화 실패 | `reason_code`, `retry_count_bucket` |
| `offline_entered` | 네트워크 오프라인 감지 | `queued_event_count_bucket` |
| `online_restored` | 네트워크 온라인 복귀 | `queued_event_count_bucket` |
| `ai_review_requested` | AI 검수 요청 | `doc_type`, `char_count_bucket` |
| `ai_review_succeeded` | AI 검수 성공 | `doc_type`, `duration_bucket` |
| `ai_review_failed` | AI 검수 실패 | `doc_type`, `reason_code` |
| `theme_changed` | 색상 테마 변경 | `theme_id`, `mode` |

---

## 9. 전환 퍼널 설계

단순 방문 수보다 중요한 것은 사용자가 실제 글쓰기 가치까지 도달했는지다.

따라서 Folio의 GA4 분석은 이벤트를 개별 카운트로만 보지 않고, 다음 퍼널을 기본 축으로 본다.

### 9.1 웹 사용 퍼널

```txt
landing_viewed
  → web_enter_clicked
  → editor_entered
  → writing_started
```

| 단계 | 의미 | 판단 기준 |
|---|---|---|
| `landing_viewed` | 서비스 노출/방문 | 랜딩 페이지 진입 |
| `web_enter_clicked` | 관심/의도 | "웹에서 이용하기" 또는 유사 CTA 클릭 |
| `editor_entered` | 실제 전환 | 에디터 화면이 정상 렌더링됨 |
| `writing_started` | 핵심 가치 도달 | 세션 내 첫 입력 또는 첫 문서 작성 행동 |

버튼 클릭만으로 전환을 판단하지 않는다. 클릭 후 네트워크, 인증, 초기화 문제로 에디터에 도달하지 못할 수 있기 때문이다.

### 9.2 데스크탑 앱 다운로드 퍼널

```txt
landing_viewed
  → desktop_download_clicked
  → desktop_download_started
  → app_opened
  → editor_entered
  → writing_started
```

이 퍼널은 웹 방문자가 실제 데스크탑 앱 사용자로 이어지는지를 보기 위한 흐름이다.

`desktop_download_clicked`는 다운로드 의도를 의미하고, `app_opened`는 실제 설치/실행에 가까운 신호다.

### 9.3 Electron 사용 퍼널

```txt
app_opened
  → editor_entered
  → writing_started
```

Electron에서는 앱 실행만으로 사용 가치를 판단하지 않는다. 실제 에디터 진입과 첫 글쓰기 행동까지 도달했는지 본다.

### 9.4 `writing_started` 정의

`writing_started`는 Folio의 핵심 KPI에 가깝다.

발생 조건:

- 한 세션에서 최초 1회만 기록
- 에디터에서 실제 입력이 발생했을 때
- 또는 새 문서 생성 후 첫 입력이 발생했을 때
- 본문 내용은 절대 전송하지 않음

권장 파라미터:

```json
{
  "platform": "web",
  "doc_type": "episode",
  "entry_source": "landing"
}
```

---

## 10. 이벤트 파라미터 규칙

### 9.1 공통 파라미터

모든 이벤트에 포함한다.

```json
{
  "app_platform": "electron",
  "app_version": "0.1.0",
  "online": true,
  "offline_queued": false
}
```

### 9.2 허용 enum

`doc_type`

```txt
episode
plan_note
world_note
character
character_note
plot
foreshadow
idea
```

`reason_code`

```txt
network
unauthorized
validation
server_error
timeout
unknown
```

`surface`

```txt
landing
web_app
settings
banner
modal
```

`os`

```txt
windows
macos
linux
unknown
```

`download_channel`

```txt
direct
github_release
landing_cta
web_app_cta
```

`entry_source`

```txt
landing
web_app
app_start
deep_link
restore_session
unknown
```

### 9.3 bucket 예시

`char_count_bucket`

```txt
0
1_1k
1k_10k
10k_50k
50k_100k
100k_plus
```

`duration_bucket`

```txt
under_1s
1s_3s
3s_10s
10s_30s
30s_plus
```

`edit_duration_bucket`

```txt
under_10s
10s_1m
1m_3m
3m_10m
10m_30m
30m_plus
```

`delta_char_count_bucket`

```txt
negative
0
1_100
100_500
500_1k
1k_5k
5k_plus
```

문서 수정 이벤트는 타이핑마다 보내지 않는다. 한 문서 편집 세션에서 첫 수정 시 `document_edit_started`를 한 번 보내고, 문서를 벗어나거나 앱 종료/저장 안정화 시점에 `document_edit_session_ended`를 보낸다.

편집량은 정확한 글자 수가 아니라 `delta_char_count_bucket`으로만 보낸다.

---

## 11. 백엔드 API 설계

### 11.1 Endpoint

```http
POST /api/v1/analytics/events
Authorization: Bearer <access_token>
Content-Type: application/json
```

### 11.2 Request

```json
{
  "events": [
    {
      "id": "uuid",
      "name": "document_created",
      "params": {
        "doc_type": "plan_note",
        "template_type": "basic-story-plan",
        "offline_queued": false
      },
      "createdAt": "2026-04-29T12:00:00.000Z"
    }
  ]
}
```

### 11.3 Response

```json
{
  "accepted": ["uuid"],
  "rejected": [
    {
      "id": "uuid",
      "reason": "unknown_event_name"
    }
  ]
}
```

### 11.4 백엔드 처리

1. 인증 확인
2. 이벤트 개수 제한
3. 이벤트명 allowlist 검증
4. 파라미터 allowlist 검증
5. `event_id` 중복 제거
6. GA4 Measurement Protocol 전송
7. 성공한 이벤트 id 반환

### 11.5 필수 중복 제거 테이블

오프라인 큐는 네트워크 재시도와 앱 재실행으로 같은 이벤트를 여러 번 보낼 수 있다.

따라서 백엔드는 `analytics_event_dedup` 테이블을 필수로 두고, 이미 처리한 `event_id`는 GA4로 다시 보내지 않는다.

```sql
CREATE TABLE analytics_event_dedup (
  event_id UUID PRIMARY KEY,
  writer_id UUID NULL,
  client_id VARCHAR(120) NULL,
  event_name VARCHAR(80) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_event_dedup_received_at
  ON analytics_event_dedup (received_at);
```

운영 시에는 무한히 쌓이지 않도록 30일 또는 90일 기준으로 오래된 dedup row를 정리한다.

---

## 12. GA4 Measurement Protocol 매핑

백엔드에서 GA4로 전송한다.

```http
POST https://www.google-analytics.com/mp/collect?measurement_id=<ID>&api_secret=<SECRET>
```

예시:

```json
{
  "client_id": "device-or-install-id",
  "user_id": "writer-id-if-authenticated",
  "events": [
    {
      "name": "document_created",
      "params": {
        "doc_type": "plan_note",
        "template_type": "basic-story-plan",
        "offline_queued": false
      }
    }
  ]
}
```

주의:

- `api_secret`은 백엔드 환경변수로만 관리한다.
- `user_id`는 내부 writer id를 그대로 보낼지, 해시 처리할지 결정이 필요하다.
- GA4 디버그뷰 검증 시 `/debug/mp/collect`를 사용한다.

---

## 13. 오프라인 flush 전략

### 13.1 Web flush 트리거

- 이벤트 발생 직후 온라인이면 즉시 전송
- 전송 실패 시 짧은 재시도
- 페이지 숨김/종료 시 `sendBeacon()` 사용 가능 여부 검토
- 온라인 복귀 이벤트에서 IndexedDB queue flush

### 13.2 Electron flush 트리거

- 앱 시작 후 인증 복원 완료
- 온라인 복귀 감지
- 일정 주기
- 주요 이벤트 발생 직후 온라인이면 즉시 시도

### 13.3 flush 제한

- 한 번에 최대 20~50개 이벤트 전송
- 실패 시 `retry_count` 증가
- 네트워크 오류는 보존
- 4xx 검증 실패는 폐기 또는 rejected 처리
- 일정 retry 초과 시 폐기

### 13.4 중복 방지

프론트:

- 이벤트마다 UUID `id` 생성
- 성공 응답 받은 이벤트만 `sent_at` 기록 또는 삭제

백엔드:

- `analytics_event_dedup` 테이블에 event id 저장
- Redis TTL은 성능 보조 캐시로만 사용하고, 최종 중복 기준은 DB 테이블로 둠
- 이미 처리한 id는 accepted로 응답하되 GA4에는 재전송하지 않음

---

## 14. 프론트 구현 위치 제안

```txt
frontend/src/shared/lib/analytics/
├── analyticsClient.ts        # track(), flush()
├── analyticsQueue.ts         # 플랫폼별 큐 adapter 추상화
├── analyticsQueue.web.ts     # Web: IndexedDB / sendBeacon 보조
├── analyticsQueue.electron.ts # Electron: SQLite / IndexedDB
├── analyticsEvents.ts        # 이벤트명/파라미터 타입
├── analyticsPrivacy.ts       # allowlist, sanitize
└── analyticsBuckets.ts       # 글자 수/시간 구간화
```

플랫폼 분기는 기존 앱 구조에 맞춰 adapter 방식으로 숨긴다.

```txt
analytics.track('document_created', params)
```

호출부는 웹인지 Electron인지 몰라도 된다.

Electron main process에서 네트워크 상태를 관리할 필요가 있으면:

```txt
frontend/src/main/analytics/
└── analyticsIpc.ts
```

단, renderer에서 `navigator.onLine`과 API 요청 실패를 조합하는 것만으로도 1차 구현은 가능하다.

웹에서는 main process가 없으므로 `navigator.onLine`, `online/offline` 이벤트, fetch 실패를 조합한다.

---

## 15. 백엔드 구현 위치 제안

```txt
backend/src/main/.../analytics/
├── AnalyticsController
├── AnalyticsService
├── AnalyticsEventValidator
├── Ga4MeasurementClient
└── AnalyticsDedupRepository
```

환경변수:

```txt
GA4_MEASUREMENT_ID=
GA4_API_SECRET=
GA4_ENABLED=true
```

---

## 16. 개인정보/보안 체크리스트

- [ ] 문서 본문 전송 금지
- [ ] 문서 제목 전송 금지
- [ ] 캐릭터명/세계관명 전송 금지
- [ ] 검색어 전송 금지
- [ ] AI 검수 원문 전송 금지
- [ ] 이벤트명 allowlist 적용
- [ ] 파라미터 allowlist 적용
- [ ] GA4 secret은 백엔드에만 저장
- [ ] 오프라인 큐는 민감 데이터 없이 저장
- [ ] 사용자 로그아웃 시 미전송 이벤트 처리 정책 결정

---

## 17. 단계별 적용 계획

### Phase 1. 최소 이벤트 큐

- 로컬 이벤트 큐 구현
- `track()` API 추가
- 온라인 상태에서 백엔드로 flush
- 백엔드는 이벤트를 로그로만 남김

### Phase 2. GA4 연동

- 백엔드 GA4 Measurement Protocol 연동
- GA4 DebugView 검증
- 이벤트명/파라미터 allowlist 적용

### Phase 3. 핵심 이벤트 연결

- 랜딩 방문
- 웹 진입 CTA 클릭
- 에디터 실제 진입
- 첫 글쓰기 행동
- 로그인
- 웹 앱 다운로드 CTA
- 문서 생성
- 문서 편집 세션 시작/종료
- 저장 실패
- 동기화 실패
- AI 검수 성공/실패
- 오프라인/온라인 복귀

### Phase 4. 대시보드 구성

- GA4 Exploration 또는 Looker Studio 연결
- 주요 funnel 구성
- 장애성 이벤트 비율 추적

---

## 18. 우선순위

아래 우선순위는 구현 순서다.

8장의 필수 이벤트 목록은 모두 수집 대상이며, P2도 제외 대상이 아니라 후순위 구현 항목으로 본다.

| 우선순위 | 항목 | 이유 |
|---|---|---|
| P0 | 오프라인 큐 + 백엔드 중계 | Folio 구조상 직접 GA4 전송은 부적합 |
| P0 | 웹/Electron 공통 이벤트 스키마 | 플랫폼별 지표가 갈라지는 것을 방지 |
| P0 | 개인정보 전송 금지 allowlist | 창작물 데이터 보호 |
| P1 | 로그인/동기화/저장 실패 이벤트 | 운영 장애 조기 파악 |
| P1 | AI 검수 이벤트 | 비용/품질/장애 관측 |
| P1 | 랜딩 → 에디터 → 글쓰기 퍼널 | 실제 제품 전환율 파악 |
| P2 | 테마/템플릿 사용 이벤트 | 제품 개선 지표 |
| P2 | Looker Studio 대시보드 | 팀 공유용 시각화 |

---

## 19. 결론

Folio는 웹과 Electron을 모두 지원하고, Electron에서는 오프라인 사용이 가능한 에디터이므로 GA4를 단순 웹 스크립트처럼 직접 붙이면 안 된다.

권장 방식은 다음과 같다.

```txt
공통 프론트 track()
→ 플랫폼별 큐 저장
→ 온라인 복귀 시 백엔드 flush
→ 백엔드 allowlist/중복 제거
→ GA4 Measurement Protocol 전송
```

이 구조를 사용하면 웹과 데스크탑에서 동일한 지표를 유지하면서도, 오프라인 이벤트 누락을 줄이고 GA4 secret 노출과 창작물 데이터 유출 위험을 피할 수 있다.
