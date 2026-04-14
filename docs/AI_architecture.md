# StoryZip AI 서비스 아키텍처

> 본 문서는 StoryZip AI 서버의 **서비스 목표**, **기능 명세**, **전체 흐름**, **컴포넌트 책임**을 정의한다.
> 구현 상세는 [ai-pipeline.md](ai-pipeline.md), [../ai/TODO.md](../ai/TODO.md) 참조.

---

## 1. 서비스 개요

### 1.1 목적

StoryZip AI 서버는 소설가의 창작 생산성을 높이기 위한 **AI 보조 기능**을 제공하는 독립 마이크로서비스다.

### 1.2 제공 기능 (3종)

| # | 기능 | 설명 | 호출 방식 |
|---|------|------|-----------|
| ① | **검수 (Review)** | 원고의 설정 충돌 · 톤 불일치 · 표현 문제를 감지하고 개선 제안 | 동기 요청 |
| ② | **텍스트 생성 (Generation)** | 스토리라인/문맥 기반 짧은 원고 초안(3~5줄) 생성 | 동기 요청 |
| ③ | **설정 자동 추출 (Extraction)** | 원고에서 세계관/캐릭터/용어 정보를 추출, **사용자 확인 후 DB 반영** | 동기 요청 + 확인 UX |

> 본 3종은 [service-spec.md](service-spec.md) §3.12 "AI 기능"의 재정의 버전이다. 기존 스펙의 "설정 충돌 분석 / 톤 일관성 / 문장 제안"은 **①검수**에 통합되었고, **③설정 자동 추출**이 신규로 추가되었다.

### 1.3 설계 원칙

1. **stateless**: AI 서버는 영속 상태를 갖지 않는다. 결과는 Spring Boot가 PostgreSQL에 기록
2. **외부 노출 금지**: 프론트는 AI 서버를 직접 호출하지 않는다. **Spring Boot가 유일한 진입점**
3. **사용자 승인 우선**: 설정 추출 결과는 **절대 자동 반영하지 않는다**. 사용자가 검토·승인해야 DB에 들어간다
4. **프롬프트는 서버 관리**: 클라이언트 재배포 없이 프롬프트 개선
5. **과금 명확성**: 모든 AI 호출은 Spring이 토큰 잔액 확인 후 차감

---

## 2. 왜 AI 서버를 분리하는가

Spring Boot에 통합하는 대신 별도 FastAPI 서비스로 분리한 이유:

| 항목 | Spring Boot 내장 | FastAPI 분리 ✅ |
|------|------------------|-----------------|
| AI 생태계 | Java는 LangChain4j 등 후발주자 | Python이 사실상 표준 (LangChain, Anthropic/OpenAI SDK) |
| LLM 응답 시간 | 10~60초 → 서블릿 스레드 점유 | async/await로 효율 처리 |
| 독립 배포 | 전체 재배포 필요 | AI 로직만 무중단 교체 |
| 프롬프트/모델 실험 | 프로덕션 백엔드 불안정화 위험 | 격리 환경에서 실험 |

**언어/프레임워크**: Python 3.12 + FastAPI (async 네이티브, Pydantic 검증, 자동 문서화)

---

## 3. 전체 시스템 맥락

```
┌─────────────────────────────────────────────────────────────┐
│                       클라이언트                              │
│          Electron App  |  Web Browser (React)                │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS (JWT 인증)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   Spring Boot (메인 백엔드)                    │
│   - 인증/결제/파일/알림                                         │
│   - 토큰 잔액 확인 및 차감                                       │
│   - AI 요청 중계 (유일한 AI 서버 호출자)                          │
│   - 결과를 ai_analysis 등에 기록                                │
└───────┬──────────────────────────┬──────────────────────────┘
        │ 내부 HTTP                 │ JDBC
        │ X-Internal-Api-Key        │
        ▼                          ▼
┌──────────────────────┐   ┌──────────────────────┐
│  FastAPI (AI 서버)    │   │  PostgreSQL          │
│  - LLM 호출           │   │  - 원고/설정/캐릭터    │
│  - 프롬프트 조립       │   │  - AI 분석 결과        │
│  - 구조화 응답 파싱    │   │  - 추출 제안(승인 대기) │
└──────────┬───────────┘   └──────────────────────┘
           │
           ▼
┌──────────────────────┐
│  외부 LLM API         │
│  Claude / OpenAI     │
└──────────────────────┘
```

### 3.1 컴포넌트 책임

| 컴포넌트 | 책임 | 책임 밖 |
|----------|------|---------|
| **프론트** | 사용자 입력, 결과 표시, 추출 제안 승인 UI | AI 직접 호출 금지 |
| **Spring Boot** | 인증, 토큰 차감, 프롬프트 템플릿 조회, AI 중계, 결과/제안 DB 기록 | LLM 직접 호출 금지 |
| **FastAPI** | LLM 호출, JSON 스키마 검증, 설정노트 참조 조립 | 인증/결제/영속 저장 |
| **PostgreSQL** | 원고·설정·분석 결과·추출 제안 저장 | 큐 |
| **외부 LLM API** | 추론 | 상태 저장 |

---

## 4. 기능별 상세

### 4.1 ① 검수 (Review)

#### 4.1.1 목적
작가가 쓴 원고를 AI가 점검해, 설정 모순 / 톤 불일치 / 어색한 표현 / 서술 오류를 감지하고 개선 제안을 돌려준다.

#### 4.1.2 입력
- `work_id`, `episode_id` (또는 텍스트 선택 범위)
- 원고 텍스트 (회차 전체 또는 선택 구간)
- 참고 컨텍스트 (Spring이 조립): 해당 작품의 세계관 설정, 등장인물, 최근 요약

#### 4.1.3 처리 흐름
```
1. 프론트 "검수 실행" 클릭
   ↓
2. 프론트 → Spring POST /api/ai/reviews { episode_id }
   ↓
3. Spring:
   a. 토큰 잔액 확인 (부족 시 402)
   b. work_id로 설정노트/캐릭터/최근 요약 조회
   c. ai_prompt_template에서 "review" 템플릿 조회
   d. 변수 치환하여 완성된 프롬프트 생성
   ↓
4. Spring → FastAPI POST /v1/reviews { rendered_prompt, model, ... }
   ↓
5. FastAPI:
   a. LLM 호출 (Claude Sonnet 4.5, JSON 모드)
   b. 응답 파싱 + 스키마 검증
   c. 실패 시 보정 재요청 1회
   ↓
6. Spring: 토큰 차감 + ai_analysis 기록 → 프론트 반환
```

#### 4.1.4 출력 스키마 (JSON)
```json
{
  "issues": [
    {
      "type": "setting_conflict | tone_inconsistency | expression | narration",
      "severity": "high | medium | low",
      "location": "해당 문장/문단 위치 또는 원문 인용",
      "description": "문제 설명",
      "suggestion": "개선 제안"
    }
  ],
  "summary": "전반적 소견 (선택)"
}
```

#### 4.1.5 제약
- 응답 시간 목표: **≤ 30초**
- 토큰 차감: 기능별 단가 (ai_prompt_template에서 관리)
- 오프라인 시 비활성화

---

### 4.2 ② 텍스트 생성 (Generation)

#### 4.2.1 목적
작가가 다음 흐름이 막혔을 때, 문맥을 바탕으로 **3~5줄 분량의 짧은 원고 조각**을 생성해 아이디어를 제공한다.

#### 4.2.2 입력
- `work_id`, 커서 위치(또는 직전 문단)
- 작성 의도(선택): "대화 중심", "묘사 위주", "반전 암시" 등 톤 힌트
- 참고 컨텍스트 (Spring이 조립): 직전 문단, 회차 기본 정보, 작품 설정 요약

#### 4.2.3 처리 흐름
```
1. 프론트 "다음 문장 제안" 버튼 클릭
   ↓
2. 프론트 → Spring POST /api/ai/generate { episode_id, cursor, tone_hint? }
   ↓
3. Spring: 토큰 잔액 확인 + 컨텍스트 + 프롬프트 조립
   ↓
4. Spring → FastAPI POST /v1/generation { rendered_prompt, model }
   ↓
5. FastAPI:
   a. LLM 호출 (Claude Sonnet 4.5 또는 Haiku, temperature=0.8)
   b. 결과 텍스트 반환 (짧으므로 스트리밍 불필요)
   ↓
6. Spring: 토큰 차감 + 생성 이력 기록 → 프론트 반환
```

#### 4.2.4 출력 스키마
```json
{
  "drafts": [
    { "index": 0, "text": "생성된 3~5줄 텍스트" },
    { "index": 1, "text": "대안 버전 (선택 옵션)" }
  ],
  "tokens_used": { "input": 1200, "output": 180 }
}
```

#### 4.2.5 제약
- 응답 시간 목표: **≤ 10초**
- 길이 가드: 출력 ≤ 400 토큰 (약 5~7줄)
- 생성물은 **제안**이지 자동 삽입이 아니다. 사용자가 "적용" 버튼으로 확정
- 사용자가 적용한 문장은 DB에 원고 일부로 저장. 적용하지 않은 대안은 버림

---

### 4.3 ③ 설정 자동 추출 (Extraction)

#### 4.3.1 목적
사용자가 원고를 쓰는 중 **등장인물, 세계관 용어, 지명, 설정 규칙**이 암묵적으로 등장하는 경우가 많다. AI가 원고에서 이를 감지해 **설정 DB에 자동 추가 후보**를 제안하고, **사용자가 검토·승인한 항목만 실제 DB에 저장**한다.

#### 4.3.2 핵심 원칙: **사용자 승인 필수**
- AI 추출 결과는 **`extraction_suggestion` 테이블에 "대기 상태(pending)"로 저장**된다
- 사용자가 UI에서 각 항목을 검토 → **승인/수정/거절**
- 승인 시에만 `character`, `world_note`, `dictionary` 등 실제 설정 테이블에 반영
- 거절한 항목은 재추천 대상에서 제외

#### 4.3.3 입력
- `work_id`, 원고 텍스트 (회차 단위 또는 선택 범위)
- 기존 설정 DB 요약 (이미 등록된 캐릭터/용어 — 중복 추천 방지)

#### 4.3.4 처리 흐름

```
[1단계: 추출]
1. 프론트 "설정 자동 추출" 버튼 클릭
   ↓
2. 프론트 → Spring POST /api/ai/extractions { episode_id }
   ↓
3. Spring: 토큰 확인, 기존 character/world_note/dictionary 목록 조회, 프롬프트 조립
   ↓
4. Spring → FastAPI POST /v1/extractions { rendered_prompt, model }
   ↓
5. FastAPI: LLM 호출 (JSON 모드) → 후보 목록 반환
   ↓
6. Spring:
   a. 기존 설정과 중복/유사도 검사
   b. 토큰 차감
   c. extraction_suggestion 테이블에 status='pending'으로 저장
   d. suggestion_id 목록을 프론트에 반환

[2단계: 사용자 검토]
7. 프론트가 제안 목록 표시 (승인/수정/거절 버튼)
   ↓
8. 사용자가 항목별 결정
   ↓
9. 프론트 → Spring PATCH /api/ai/extractions/{id} { action: approve | reject | modify }
   ↓
10. Spring:
    - approve → character/world_note/dictionary에 INSERT, status='approved'
    - modify → 수정본으로 INSERT, status='approved'
    - reject → status='rejected'
```

#### 4.3.5 추출 카테고리

| 카테고리 | 저장 대상 테이블 | 필드 예시 |
|----------|------------------|-----------|
| 등장인물 | `character` | name, role, description, first_appeared_episode_id |
| 세계관 노트 | `world_note` | title, category, content |
| 용어/고유명사 | `dictionary` | term, definition, aliases |
| 장소/지명 | `world_note` (카테고리=location) | title, description |

#### 4.3.6 출력 스키마

**추출 응답 (1단계)**:
```json
{
  "suggestions": [
    {
      "suggestion_id": "uuid",
      "category": "character | world_note | dictionary",
      "name": "추출된 이름/용어",
      "description": "AI가 본문에서 추론한 설명",
      "evidence": "근거가 된 본문 인용",
      "confidence": 0.92,
      "is_duplicate_candidate": false
    }
  ],
  "tokens_used": { ... }
}
```

**사용자 결정 (2단계)**: 각 `suggestion_id`에 대해 `approve / reject / modify` 액션

#### 4.3.7 제약
- 응답 시간 목표: 추출 1단계 **≤ 60초**
- 중복 방지: 기존 설정과 유사한 항목은 `is_duplicate_candidate=true`로 표시
- **자동 승인 금지**: 어떤 경우에도 사용자 확인 없이 DB 반영 불가
- 거절 이력: 같은 항목을 다음 추출에서 다시 제안하지 않도록 기록

---

## 5. 공통 데이터 흐름 원칙

### 5.1 호출 경로 (모든 기능 공통)

```
프론트 → Spring Boot → FastAPI → 외부 LLM → FastAPI → Spring Boot → 프론트
         │                                              │
         ├─ 토큰 확인                                    ├─ 토큰 차감
         ├─ 프롬프트 템플릿 조립                          ├─ 결과 DB 저장
         └─ 컨텍스트 조립 (설정노트 등)                    └─ 감사 로그
```

### 5.2 Spring Boot가 담당하는 것
- 인증 (JWT)
- 토큰 잔액 확인 + 차감
- `ai_prompt_template` 조회 및 변수 치환
- 컨텍스트 데이터 조회 (설정노트, 캐릭터, 과거 기록)
- FastAPI 호출 (내부 HTTP + 공유 비밀 키)
- 결과를 관련 테이블에 기록 (`ai_analysis`, `extraction_suggestion` 등)
- 실패 시 사용자 친화적 에러 변환

### 5.3 FastAPI가 담당하는 것
- 렌더링 완료된 프롬프트를 받아 LLM 호출
- JSON 모드 응답 파싱 및 스키마 검증
- 파싱 실패 시 보정 재요청 1회
- 재시도 / 타임아웃 / 서킷브레이커
- 구조화 응답 반환

### 5.4 FastAPI가 하지 않는 것
- DB 직접 접근
- 인증
- 토큰 회계
- 사용자 알림

---

## 6. 주요 설계 결정

### 6.1 동기 vs 비동기

현재 3기능은 **모두 동기 HTTP**로 처리한다.

| 기능 | 방식 | 이유 |
|------|:--:|------|
| 검수 | 동기 | 사용자가 대기하며 결과 즉시 확인 (≤30s) |
| 텍스트 생성 | 동기 | 짧은 출력, 빠른 응답(≤10s) |
| 설정 추출 | 동기 | ≤60s 허용 범위, 사용자가 요청·대기 |

→ **Celery/Redis 큐는 초기 스코프에서 제외**. 향후 자동 배치 분석(회차 저장 시 자동 추출 등)이 도입되면 재검토.

### 6.2 RAG / 벡터 DB 재검토

초기 기획에 있던 **RAG(pgvector)**는 다음 조건에서 필요했다:
- 장편(수십~수백 회차) 원고에서 과거 맥락 전부를 프롬프트에 넣을 수 없을 때

현재 3기능 스코프에서는:
- **검수**: 해당 회차 + 설정노트면 충분 → RAG 불필요
- **텍스트 생성**: 직전 문단 + 설정 요약 → RAG 불필요 (3~5줄 생성에 과도한 맥락 불필요)
- **설정 추출**: 해당 회차 본문 단위 → RAG 불필요

→ **pgvector 도입은 초기 스코프에서 제외**. 장편 작품 지원이 본격화되면 재도입 검토.

### 6.3 LLM 선택

| 기능 | 기본 모델 | 근거 |
|------|-----------|------|
| 검수 | `claude-sonnet-4-5` | 정확한 지적과 긴 컨텍스트 처리 |
| 텍스트 생성 | `claude-sonnet-4-5` | 문장력과 창의성 |
| 설정 추출 | `claude-haiku-4-5-20251001` | 구조화 추출은 Haiku로 충분, 비용 절감 |

모델은 `ai_prompt_template.model` 필드로 관리자 변경 가능.

### 6.4 프롬프트 관리

- 프롬프트 템플릿은 `ai_prompt_template` 테이블에 저장
- 관리자가 어드민 화면에서 편집 (클라이언트/서버 재배포 불필요)
- Spring이 조회 → 변수 치환 → 완성본을 FastAPI에 전달
- FastAPI는 **템플릿 로직에 무관심**(stateless 유지)

### 6.5 인증

- Spring ↔ FastAPI: 공유 비밀 키 `X-Internal-Api-Key` 헤더
- FastAPI는 Nginx에서 외부 경로로 라우팅하지 않음 (internal network only)
- LLM API 키: FastAPI 서버에만 보관 (Spring/프론트에 절대 노출 금지)

---

## 7. 데이터 모델 (신규 테이블)

### 7.1 `extraction_suggestion` (설정 추출 제안)

```sql
CREATE TABLE extraction_suggestion (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id         UUID NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    episode_id      UUID REFERENCES episode(id) ON DELETE SET NULL,
    category        VARCHAR(30) NOT NULL,         -- 'character' | 'world_note' | 'dictionary'
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    evidence        TEXT,                          -- 근거 본문 인용
    confidence      NUMERIC(3,2),                  -- 0.00 ~ 1.00
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
                                                   -- 'pending' | 'approved' | 'rejected' | 'modified'
    linked_entity_id UUID,                         -- 승인 시 생성된 실제 설정 엔티티 ID
    reviewed_by     UUID REFERENCES writer(id),
    reviewed_at     TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX ON extraction_suggestion (work_id, status);
```

### 7.2 기존 `ai_analysis` (활용)

검수 결과를 기록. 기존 스펙과 동일.

### 7.3 기존 `ai_prompt_template` (활용)

3기능 각각에 대한 템플릿을 `name`으로 구분:
- `review.default`
- `generation.default`
- `extraction.default`

---

## 8. 비기능 요구사항

### 8.1 성능 목표

| 기능 | 응답 시간 목표 |
|------|---------------|
| `/health` | ≤ 50ms |
| 검수 | P50 ≤ 15s, P95 ≤ 30s |
| 텍스트 생성 | P50 ≤ 5s, P95 ≤ 10s |
| 설정 추출 | P50 ≤ 30s, P95 ≤ 60s |

### 8.2 가용성

- LLM API 5xx → 자동 재시도 2회 (exponential backoff)
- 연속 실패 → 서킷브레이커 60초 오픈
- Blue/Green 배포로 무중단 교체

### 8.3 관측성

- **로그**: 구조화 로깅 (request_id, work_id, feature, tokens, latency) → Loki
- **메트릭**: 기능별 호출 수, 성공률, P95 지연, 토큰 사용량 → Prometheus → Grafana
- **감사**: Spring이 모든 AI 호출을 `ai_analysis`에 기록

### 8.4 비용 관리

- 환경별 모델 고정 (dev: Haiku, prod: 기능별 지정)
- 기능별 회당 비용 대시보드
- 사용자별 일/월 호출 상한 (Spring이 선검증)

---

## 9. 보안 / 개인정보

- LLM 호출 시 **원고 본문은 전송되지만 저장되지 않음** (provider의 데이터 정책에 따름)
- Anthropic/OpenAI Enterprise 계약 권장 (학습 사용 거부 옵션)
- LLM API 키는 Doppler 관리, 서버에만 존재
- 사용자가 추출 제안을 거절하면 해당 근거 문장은 즉시 DB에서 삭제 가능

---

## 10. 배포 환경

| 환경 | 실행 방식 |
|------|-----------|
| dev | `uvicorn app.main:app --reload --port 8000` (로컬) |
| test | Docker Compose, LLM은 모킹 |
| prod | Blue(8091) / Green(8092) 컨테이너, Nginx 라우팅 |

---

## 11. 오픈 이슈

- [ ] 설정 추출 결과 중복 판정 알고리즘 (단순 문자열 비교 vs 임베딩 유사도)
- [ ] 검수 대상 범위 기본값 (회차 전체 vs 선택 구간)
- [ ] 텍스트 생성의 대안 버전 개수 (1개 vs 복수)
- [ ] 사용자가 "거절"한 추출 항목의 재추천 차단 기간
- [ ] 토큰 차감 타이밍 (호출 전 예약 vs 응답 성공 후 차감)

---

## 12. 용어 정리

| 용어 | 설명 |
|------|------|
| **검수** | AI가 원고를 점검해 문제점과 개선안을 제시 |
| **텍스트 생성** | AI가 문맥 기반으로 짧은 원고 초안을 작성 |
| **설정 추출** | AI가 원고에서 등장인물/세계관/용어를 식별해 DB 등록 후보 제안 |
| **승인 워크플로우** | 추출 제안 → 사용자 검토 → 승인/거절 → DB 반영 |
| **프롬프트 템플릿** | 관리자가 DB에서 편집 가능한 AI 지시문. 변수 치환 후 LLM에 전송 |
| **토큰** | 서비스 내부 과금 단위 (LLM 토큰과 혼동 주의) |

---

## 13. 참고 문서

- [architecture.md](architecture.md) — 전체 시스템 아키텍처
- [service-spec.md](service-spec.md) §3.12 — AI 기능 서비스 명세 (본 문서의 상위)
- [infra.md](infra.md) — 인프라 / 컨테이너 구성
- [erd.md](erd.md) — 데이터 모델
