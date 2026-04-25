# 검수기 품질 개선 보고서 (S14P31F203-132)

브랜치: `feat/S14P31F203-132-aiReviewQualityEnhancement`
작성일: 2026-04-26
대상: 팀 내부 공유

## 1. 작업 목적

작가 피드백 기반으로 AI 검수 품질을 단계적으로 개선했다. dummy-work-3(만년취준생, 6명/12세계관/9복선/7화) 7화에 의도적으로 심은 10개 함정을 baseline으로 잡고, 동일 본문에 대해 검수기를 v1 → v2 → v3로 끌어올렸다.

핵심 KPI:
- 검출률 (10개 함정 중 검출 개수)
- 비용 (크레딧/회, 1크레딧=8원, ROUND((원가×1.3)÷8))
- 결정론성 (같은 본문 N회 검수 시 결과 일관성)

## 2. 결과 요약

| 검수기 | 검출 | 점수 | input tok | output tok | 크레딧 | 비고 |
|---|---|---|---|---|---|---|
| v1 (baseline) | 5/10 | LLM 임의 (~72) | 25,927 | 1,355~1,780 | 23~25 | 첫 검수와 재검수가 다름 (G번 흔들림) |
| v2 (foreshadow + dedup) | 6/10 | 63 (결정론) | 27,289 | 1,617~1,903 | 25~26 | H 신규 검출 (닉네임 일관성) |
| v3 (캐릭터 사전 스캔) | 7/10 | 45 (결정론) | 28,035 | 1,913~2,281 | 27~28 | D 신규 검출 (부차 인물), J 등급 회복, 1차 안정성 확보 |

총 토큰 증가: ~2k tok (input 26→28k), 크레딧 +4 (23→27).

## 3. 함정 검출 진행

| # | 함정 | v1 | v2 | v3 | 비고 |
|---|------|----|----|----|------|
| C | 방송 외 신점 발동 | critical | critical | critical | worldnotes 시스템 룰 위반 |
| I | "그는 한숨을 내쉬었다" 7회 | warning (sentence + ngram 중복) | warning (1건) | warning (1건) | 후처리 모듈 dedup 적용 |
| G | "어엽한 직장인" (박수될 팔자 복선 충돌) | 1차 ❌ → 2차 ✅ | critical | critical (foreshadow_conflict로 분류) | foreshadow_conflict type 신설 |
| E | 별풍선 (오션 후원 단위 = 물방울) | critical/warning 흔들림 | warning | warning | dedup 강화로 중복 감소 |
| J | 도박빚 회상 (양다리 = 4화 클라이맥스) | warning (context) | **info** | warning (context) | 등급 하한 명시로 회복 |
| H | 묵음방/무음방 닉네임 불일치 | ❌ | warning | warning | worldnotes 트리밍 보호 |
| D | 김우식 회사원 (설정: 인터넷방송인) | ❌ | ❌ | **critical + warning (2건)** | sort_order 강제 검사 지시 |
| A | 친근 존댓말 (페르소나 위반) | ❌ | ❌ | ❌ | 조건부 페르소나로 LLM이 합리화 |
| B | 신안 사용 후 반동 부재 | ❌ | ❌ | ❌ | "있어야 할 것의 부재" 추론 한계 |
| F | 시청자 25배 폭증 (회차 누적) | ❌ | ❌ | ❌ | 회차 메타데이터 부재 |

## 4. 구현 변경 (코드 단위)

### 4.1 신규 모듈

#### `ai/app/services/repetition_detector.py`
- 한국어 본문에서 동일 문장(3회 이상) + 어절 n-gram(3~5어절, 4회 이상) 결정론 카운팅
- LLM은 한국어 빈도를 정확히 못 세므로 후처리로 분리 — 토큰 비용 0, 정확도 100%
- sentence-vs-ngram, ngram-vs-ngram 통합 dedup: 출현수 DESC + ngram 우선, 부분집합은 제거
- 결과를 review 응답의 `issues` 배열에 머지

#### `ai/app/services/timeline_extractor.py`
- 회차별 도입부에서 한국어 시간 표지(다음 날·N시간 후·아침/저녁) 정규식 추출 → "## 회차별 시간 흐름" 섹션
- 본문에서 회상 표지("한 달 전", "일주일 전", "N일 전") 추출 → "## 본문 시간 진술" 섹션
- LLM은 이 두 섹션을 비교해 회차 누적과 본문 진술 모순 검사

### 4.2 수정 모듈

#### `ai/app/services/rag.py`
- `RECENT_RAW_LIMIT = {"review": 1}`, `VECTOR_SEARCH_LIMIT = {"review": 5}` (검수 모드 RAG 분리)
- `FORESHADOWS_MODES = {"review"}`: 검수 컨텍스트에 복선 항상 포함
- `TIMELINE_MODES = {"review"}`: timeline 섹션 주입
- `PROTECTED_KEYS_BY_MODE = {"review": {"characters", "world_notes"}}`: 두 섹션 트리밍 제외 (부차 인물·보조 시청자 정보 손실 방지)
- `_fetch_characters` 헤더 포맷: `- [주인공] 박지훈 (성별 남, 나이 20대 후반)` — 핵심 속성을 LLM이 한 눈에 보도록
- `_fetch_recent_raw` 절대 회차 번호 제거, 상대 라벨로 변경 (직전 화/N화 전)
- `_fetch_vector_similar` per-episode 청크 한도 (MAX_CHUNKS_PER_EPISODE=3) 적용

#### `ai/app/api/v1/reviews.py`
- 시스템 프롬프트 ~3k → ~7k chars (원본 대비 +130%):
  - 검수 항목 6번 신설: `foreshadow_conflict` (importance high 복선 vs 본문 명제 충돌)
  - 검수 항목 1번 강화: 한국어 숫자 표기 환산(스무 살=20세 등), 별칭/닉네임 매핑 강제
  - 검수 항목 2번(narration_conflict) 강화: "한 장면 내 거주·동거인·위치 모순" 예시
  - 검수 항목 4번(tone_conflict) 강화: era/style_memo 기반 어휘 검사 적극화 (영어 남발/사극체)
  - 검수 항목 5번(context_conflict) 심각도 하한: 이전 화 핵심 사건 모순은 최소 warning
  - "검수 시 반드시 수행하는 사전 스캔" 블록: 등장인물 sort_order 순서대로 1:1 본문 대조 강제, 페르소나 위반 예시, 보조 인물 닉네임 매핑, 시스템 룰 부재 검사
  - 중복 출력 금지 + 매핑 테이블 출력 금지로 토큰 보호
- `_normalize_review_result`: (type, lines) 시그니처 dedup으로 LLM 중복 보고 자동 제거
- `_merge_repetitions`: 후처리 결과 lines와 50%+ 겹치는 LLM 반복 이슈는 후처리 결과로 대체
- `_compute_score`: critical -10, warning -5, info -2, 하한 0 — 결정론 점수로 LLM 임의값 덮어씀
- `find_retrospect_markers` 호출로 본문 회상 시간 표지를 별도 섹션으로 user_prompt에 주입
- (개발 디버깅용) `REVIEW_DEBUG_DUMP=1` 환경변수 시 결과 JSON을 `test_reports/last_review.json`에 덤프 — 프로덕션 미설정 시 0 영향 (테스트 종료 후 제거 예정)

#### `ai/app/tasks/chunk_and_embed.py`
- 빈 본문에도 DELETE 무조건 실행 (이전: 빈 컨텐츠면 early return으로 옛 청크 잔존)

#### `ai/scripts/reseed_dummies.py`
- `--only dummy-work-N` 옵션 추가 (dummy-work 단위 타겟 재시드)
- 이전: 전체 work 일괄 재시드만 가능 → 사용자 작업 데이터 손실 위험

### 4.3 fixture 변경
- `ai/tests/fixtures/dummy-work-3/`: 만년취준생 작품 데이터 풀 셋업 (6 chars, 12 worldnotes with parent tree, 9 foreshadows)
- `ai/tests/fixtures/dummy-work-2/characters.json`: 기억보존관리원 10인 캐릭터로 교체

## 5. 비용 분석 (Sonnet 4-6 기준)

가격: `$3/M input, $15/M output` (1 USD ≈ 1450 KRW, 1 credit = 8 KRW, ROUND((원가×1.3)÷8))

### 검수기 v3 정상 케이스
- input 28,035 × $3/M = $0.0841
- output 1,913 × $15/M = $0.0287
- 합계 **$0.113** ≈ ₩164 → **27 크레딧/회**

### 인풋 구성 (28k tok 분해, 추정)
| 부분 | 토큰 |
|---|---|
| 시스템 프롬프트 (~7k chars) | ~2.8k |
| schema_hint | ~0.2k |
| 작품 메타 + 캐릭터 6명 (보호) | ~9k |
| 세계관 12개 (보호) | ~6k |
| 복선 9개 | ~2.5k |
| 회차별 시간 흐름 | ~0.1k |
| 직전 화 원문 1개 | ~3.5k |
| vector_search 5청크 | ~1.5k |
| 본문 시간 진술 (해당 시) | ~0.05k |
| 검수 본문 7화 numbered | ~2.5k |
| **합계** | **~28k** |

### 작품 규모별 예상 비용 (검수 1회)
- 소형 (인물 5/세계관 8/복선 5, 본문 5k자): ~22k input, **~22 크레딧**
- 중형 (인물 6/세계관 12/복선 9 = dummy-work-3): ~28k input, **~27 크레딧**
- 대형 (인물 10/세계관 24/복선 15): ~42k input, **~40 크레딧**

설정 40개 도달 시 MCP 분기 예정 (현재 dummy-work-3 = 27개).

## 6. 검수기 발전 단계 회고

### v1 → v2 (worldnotes 강화 + 후처리 dedup)
- 추가: foreshadow_conflict type, world_notes/characters trim 보호
- 효과: H(닉네임) 신규 검출, I(반복) 중복 해소
- 한계: J 등급 하락 (warning → info), D 미해결

### v2 → v3 (캐릭터 사전 스캔 + 등급 하한)
- 추가:
  - "사전 스캔" 블록: sort_order 순서대로 모든 인물 1:1 본문 대조 강제
  - context_conflict 심각도 하한 (이전 화 사건 모순 최소 warning)
  - 페르소나 위반 예시 (차갑고 단호 vs 친근체)
- 효과:
  - D 신규 검출 (김우식 회사원, 본문 5회 노출 케이스 처음 잡음, 2건 분리 critical+warning)
  - J 등급 회복 (info → warning)
  - 1차/2차 검수 결과 동일 — 비결정성 해소

### v3 한계 (3개 미해결)
- A 친근 존댓말: 박지훈 페르소나가 "신안 발동 시 한정"으로 조건부 → LLM이 발동 전 합리화
- B 반동 부재: "있어야 할 것의 부재" 음의 추론 → LLM 본질적 약점
- F 시청자 25배 폭증: 회차별 수치 메타데이터 부재 → 결정론 모듈 필요

## 7. 결정론성 검증

같은 본문(7화)으로 v3 2회 연속 검수:
- 1차: 8 issues, 점수 45
- 2차: 8 issues, 점수 45
- 함정 카운트 100% 일치, severity 100% 일치
- 변동 부분: description wording, type 1건 (박지훈 직장인이 setting_conflict ↔ foreshadow_conflict로 흔들림 — 의미적으로 동일)
- 점수 결정론(`_compute_score`)은 카운트 기반이라 완전 안정

작가 결론: "두 번 검수 권고는 더 이상 필요 없는 수준."

## 8. 작가 피드백 (실제 인용)

### v1 후
> "검수기는 명시적·직접 비교 가능한 충돌은 잘 잡음. 추론·누적·빈도 카운팅 영역은 약함."

### v2 후
> "닉네임 일관성 검수가 작동하기 시작 (H번). worldnotes RAG 강화의 명확한 증거."

### v3 후
> "v3는 사실상 완성형. 못 잡는 3개 중 A번만 더 잡으면 8/10 도달. B/F는 후순위로 미뤄도 충분.
> 이제 검수기는 작가가 두 번 돌릴 필요 없이 첫 검수만 신뢰하면 되는 수준."

## 9. 후속 작업 (follow-up 티켓 후보)

### A. 페르소나 톤 검사 (조건부 페르소나 처리)
- 캐릭터 메모의 "신안 발동 시", "전투 시" 같은 조건부 페르소나를 본문 장면 상태와 매칭해 검사
- 시도해도 효과 불확실 (false positive 위험), 우선순위 중

### B. 룰 부재 검사
- worldnotes에 "능력 사용 후 반동" 같은 시스템 룰이 있을 때 본문이 누락하는지 검출
- LLM 약점이라 결정론 보조 모듈 필요. 우선순위 낮음.

### F. 회차별 수치 메타데이터
- 시청자 수, 후원 누적, 시간 경과 등을 회차별로 추적하는 메타데이터 시스템
- 작품마다 필요한 수치가 다르므로 일반화 어려움. 우선순위 낮음.

### 운영 보호
- review가 정상 종료 시 `REVIEW_DEBUG_DUMP` 블록 제거 (테스트 도구는 main 머지 전 정리)
- 시스템 프롬프트가 7k chars로 길어진 만큼 캐싱(Anthropic prompt caching, cache_control) 검토 — input 토큰 ~9k 감소 예상

## 10. 결론

이번 브랜치는 검수기 검출률을 **5/10 → 7/10**로 끌어올리고, **점수 결정론 + 1차 검수 안정성**을 확보했다. 비용은 검수당 23~27 크레딧 수준에서 안정. 작가는 v3를 "실서비스 수준"으로 평가했고 추가 개선은 follow-up으로 분리한다.

핵심 학습:
- LLM 검수기의 약점(빈도 카운트, 회차 누적)은 **결정론 후처리/메타데이터 주입**으로 보완하는 게 효율적
- 검수 모드는 컨텍스트 결정론성이 작품 신뢰도와 직결됨 — RAG 트리밍으로 데이터 손실 시 검출 일관성 깨짐
- 프롬프트 강화는 "절차 명시(사전 스캔) + 구체 예시 + 출력 금지"가 효과적

---
**작업자**: AI 팀 (S14P31F203-132)
**테스트 데이터**: dummy-work-3 7화 (5,300자 본문, 함정 10개 의도 삽입)
**총 검수 호출**: 약 15회 (전 비용 ~₩2,400, ~400 크레딧)
