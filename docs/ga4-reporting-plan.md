# GA4 보고서 구성 계획

## 목표

Folio에서 사용자가 실제로 어떤 행동을 하는지 GA4에서 빠르게 확인할 수 있도록 보고서를 정리한다.

중점적으로 볼 항목은 다음 다섯 가지다.

- 사용자 행동: 앱 진입, 에디터 진입, 주요 화면 사용
- 랜딩/다운로드: 랜딩 방문, 웹 진입, 데스크톱 앱 다운로드 클릭 및 시작
- 문서 작업: 문서 생성, 저장, 편집 시작/종료, 삭제, 저장 실패
- 동기화 안정성: sync 성공/실패, 오프라인/온라인 복귀
- AI 기능 사용: AI 검수, 맞춤법 검사, 성공/실패

## 현재 확인된 주요 이벤트

현재 코드와 GA4에서 확인할 수 있는 주요 이벤트는 아래와 같다.

```text
landing_viewed
web_enter_clicked
desktop_download_clicked
desktop_download_started
desktop_download_failed
app_opened
editor_entered
workspace_opened
document_created
document_saved
document_edit_started
document_edit_session_ended
document_deleted
document_save_failed
sync_started
sync_succeeded
sync_failed
offline_entered
online_restored
ai_review_requested
ai_review_succeeded
ai_review_failed
theme_changed
```

보고서 개요에서 `sync_started`, `sync_failed`, `document_created`, `document_saved`, `sync_succeeded`, `editor_entered`, `app_opened` 등이 많이 보이고 있다.

특히 `sync_failed`가 크게 보이므로, 동기화 안정성 보고서는 우선순위를 높게 둔다.

## GA4에서 만들 보고서

### 1. 사용자 행동 보고서

목적: 사용자가 앱에 들어와서 어떤 핵심 행동까지 이어지는지 확인한다.

추천 카드:

- 상단 요약: 활성 사용자, 새 사용자 수, 평균 참여 시간, 이벤트 수
- 인기 페이지/화면
- 이벤트 이름별 이벤트 수
- 화면별 이벤트 수
- 신규 사용자 추이

권장 제거 카드:

- 시/군/구별 활성 사용자
- 잠재고객 이름별 활성 사용자
- 유용한 정보
- 데이터가 없는 세션 소스/매체 카드

### 2. 랜딩/다운로드 보고서

목적: 웹 랜딩에서 사용자가 앱 다운로드 또는 웹 에디터 진입까지 이어지는지 확인한다.

필터:

```text
이벤트 이름 contains landing_
OR 이벤트 이름 contains web_enter
OR 이벤트 이름 contains desktop_download
```

추천 카드:

- 랜딩 이벤트별 이벤트 수
- 다운로드 클릭 수
- 다운로드 시작 수
- 다운로드 실패 수
- 웹 에디터 진입 클릭 수

추천 지표:

- `landing_viewed`
- `web_enter_clicked`
- `desktop_download_clicked`
- `desktop_download_started`
- `desktop_download_failed`

추천 파라미터:

- `surface`: 버튼이 위치한 영역. 예: `hero`
- `platform`: `web`
- `os`: `windows`, `macos`, `linux`, `unknown`
- `download_channel`: `landing_cta`
- `reason_code`: 실패 사유. 예: `download_url_missing`

### 3. 문서 작업 보고서

목적: 작가가 실제로 문서를 만들고, 편집하고, 저장하는 흐름을 본다.

필터:

```text
이벤트 이름 contains document_
```

추천 카드:

- 문서 이벤트별 이벤트 수
- 문서 생성 수
- 문서 저장 수
- 문서 저장 실패 수
- 문서 편집 세션 종료 수

추천 지표:

- `document_created`
- `document_saved`
- `document_edit_started`
- `document_edit_session_ended`
- `document_deleted`
- `document_save_failed`

### 4. 동기화 안정성 보고서

목적: PowerSync 및 로컬/서버 동기화가 안정적으로 동작하는지 본다.

필터:

```text
이벤트 이름 contains sync_
```

추천 카드:

- sync 이벤트별 이벤트 수
- sync 실패 추이
- sync 성공 추이
- sync 실패 비율 참고 카드

추천 지표:

- `sync_started`
- `sync_succeeded`
- `sync_failed`
- `offline_entered`
- `online_restored`

주의:

`sync_failed`가 재시도마다 여러 번 찍히는 구조라면 실제 사용자 장애보다 크게 보일 수 있다. 이후 이벤트 설계를 보정할 때 `reason_code`, `retry_count_bucket`, `queue_count_bucket`을 함께 봐야 한다.

### 5. AI 기능 사용 보고서

목적: AI 기능이 실제로 쓰이는지, 성공률은 어떤지 본다.

필터:

```text
이벤트 이름 contains ai_
```

현재 볼 수 있는 이벤트:

- `ai_review_requested`
- `ai_review_succeeded`
- `ai_review_failed`
- `ai_spellcheck_requested`
- `ai_spellcheck_succeeded`
- `ai_spellcheck_failed`

추천 카드:

- AI 이벤트별 이벤트 수
- AI 요청 성공/실패 비교
- AI 실패 reason_code
- 검수와 맞춤법 검사 사용량 비교

## GA4 보고서 개요 카드 구성

현재 `보고서 개요`에는 아래 카드 구성을 추천한다.

유지:

- 상단 요약: 활성 사용자, 새 사용자 수, 평균 참여 시간, 이벤트 수
- 인기 페이지/화면
- 신규 사용자 추이

추가:

- 이벤트 이름별 이벤트 수
- 랜딩/다운로드 이벤트 수
- 문서 작업 이벤트 수
- 동기화 이벤트 수
- AI 이벤트 수

제거 또는 후순위:

- 시/군/구별 활성 사용자
- 잠재고객 이름별 활성 사용자
- 유용한 정보
- 데이터가 없는 세션 소스/매체별 세션수

가장 먼저 넣을 카드:

```text
카드 제목: 이벤트 이름별 이벤트 수
차원: 이벤트 이름
측정항목: 이벤트 수
정렬: 이벤트 수 내림차순
행 수: 5 또는 10
```

이 카드는 전체 이벤트 1.2만 건이 어떤 이벤트로 구성되어 있는지 바로 보여준다.

## GA4 탐색 보고서 설정

### 이벤트별 발생 수

탐색 > 자유 형식에서 만든다.

- 행: 이벤트 이름
- 열: 비움
- 값: 이벤트 수, 활성 사용자
- 정렬: 이벤트 수 내림차순
- 행 표시: 25 또는 50

이 보고서는 전체 이벤트 현황판 역할을 한다.

### 화면별 이벤트 수

- 행: 페이지 제목 및 화면 클래스
- 열: 이벤트 이름
- 값: 이벤트 수

화면별로 어떤 이벤트가 발생하는지 볼 때 사용한다.

### 랜딩/다운로드 이벤트 전용

- 행: 이벤트 이름
- 값: 이벤트 수, 활성 사용자
- 필터: 이벤트 이름 contains `desktop_download`

다운로드 클릭, 다운로드 시작, 다운로드 실패를 확인한다.

필요하면 `landing_viewed`, `web_enter_clicked`까지 함께 볼 수 있도록 필터를 넓힌다.

### AI 이벤트 전용

- 행: 이벤트 이름
- 값: 이벤트 수, 활성 사용자
- 필터: 이벤트 이름 contains `ai_`

AI 검수와 맞춤법 검사 사용량을 확인한다.

### 문서 작업 이벤트 전용

- 행: 이벤트 이름
- 값: 이벤트 수, 활성 사용자
- 필터: 이벤트 이름 contains `document_`

작가의 실제 작업 행동을 확인한다.

### 동기화 이벤트 전용

- 행: 이벤트 이름
- 값: 이벤트 수, 활성 사용자
- 필터: 이벤트 이름 contains `sync_`

동기화 실패/성공 추이를 확인한다.

## 퍼널 보고서

### 랜딩 다운로드 퍼널

탐색 > 퍼널 탐색에서 만든다.

```text
landing_viewed
-> desktop_download_clicked
-> desktop_download_started
```

목적:

- 랜딩 방문자 중 다운로드 버튼을 누른 비율을 본다.
- 다운로드 버튼 클릭자 중 실제 파일 다운로드까지 간 비율을 본다.

### 웹 에디터 진입 퍼널

```text
landing_viewed
-> web_enter_clicked
-> editor_entered
```

목적:

- 랜딩 방문자가 웹 에디터 진입까지 이어지는지 본다.

주의:

`web_enter_clicked`는 랜딩에서 웹 에디터 CTA를 누른 이벤트이고, `editor_entered`는 실제 에디터 화면 진입 이벤트다. 두 이벤트가 같은 사용자 세션에서 이어지는지 보는 것이 핵심이다.

### 기본 사용 퍼널

```text
app_opened
-> editor_entered
-> document_created
-> document_edit_started
-> document_saved
```

목적: 앱 진입자가 실제 작성/저장까지 이어지는지 본다.

### AI 검수 퍼널

```text
editor_entered
-> ai_review_requested
-> ai_review_succeeded
```

목적: 에디터 진입 후 AI 검수까지 이어지는지 본다.

### 맞춤법 검사 퍼널

맞춤법 검사 이벤트가 GA4로 유입되는 것을 DebugView에서 확인한 뒤 만든다.

```text
editor_entered
-> ai_spellcheck_requested
-> ai_spellcheck_succeeded
```

## 코드에서 추가된 이벤트

맞춤법 검사 사용량을 GA4에서 보기 위해 코드 이벤트를 추가했다. GA4는 버튼 클릭이나 API 호출을 자동으로 의미 있게 분류하지 못하므로 앱에서 명시적으로 이벤트를 보낸다.

추가된 이벤트:

```text
ai_spellcheck_requested
ai_spellcheck_succeeded
ai_spellcheck_failed
```

권장 파라미터:

```text
doc_type: episode
check_scope: episode | selection
char_count_bucket: 1_1k | 1k_10k | 10k_50k | ...
duration_bucket: under_1s | 1s_3s | 3s_10s | ...
issue_count_bucket: 0 | 1 | 2_5 | 6_10 | ...
reason_code: 401 | 402 | 502 | unknown
```

수정 대상:

- `frontend/src/shared/lib/analytics/analyticsEvents.ts`
- `frontend/src/shared/lib/analytics/analyticsPrivacy.ts`
- `frontend/src/shared/components/layout/RightPanels.tsx`
- `backend/src/main/java/com/storyzip/analytics/service/AnalyticsEventSpec.java`

다운로드 관련 이벤트는 이미 코드에 있다.

- `landing/src/components/landing/Hero.tsx`
- `landing/src/components/landing/DownloadPopover.tsx`
- `landing/src/lib/analytics.ts`
- `backend/src/main/java/com/storyzip/analytics/service/AnalyticsEventSpec.java`

## 우선순위

1. GA4 탐색에서 이벤트별 발생 수 보고서를 만든다.
2. 보고서 개요에 `이벤트 이름별 이벤트 수` 카드를 추가한다.
3. 랜딩/다운로드 보고서를 만든다.
4. 동기화 안정성 보고서를 만든다.
5. 문서 작업 보고서를 만든다.
6. AI 기능 사용 보고서를 만든다.
7. 랜딩 다운로드 퍼널을 만든다.
8. 기본 사용 퍼널을 만든다.
9. DebugView에서 `ai_spellcheck_*` 이벤트 유입을 확인한다.
10. 보고서 개요에 AI 이벤트 카드를 추가한다.

## 판단 기준

초기에는 아래 질문에 답할 수 있으면 충분하다.

- 사용자가 랜딩에 들어온 뒤 다운로드 또는 웹 에디터 진입까지 이어지는가?
- 다운로드 버튼 클릭자 중 실제 다운로드 시작까지 이어지는 비율은 어떤가?
- 사용자가 앱을 열고 에디터까지 들어오는가?
- 문서 생성 후 실제 저장까지 이어지는가?
- 동기화 실패가 얼마나 자주 발생하는가?
- AI 검수 기능은 얼마나 쓰이는가?
- 맞춤법 검사 기능은 추가 후 얼마나 쓰이는가?
- 실패 이벤트가 특정 API 상태 코드에 몰려 있는가?
