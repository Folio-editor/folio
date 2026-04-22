# Folio AI 비용 분석 보고서 — dummy-work-2 (기억 보관사)

*작성일: 2026-04-22 · 소요 시간(드래프트+검수): 약 5분*

## 1. 테스트 환경

| 항목 | 값 |
| --- | --- |
| 초안 모델 (요청 `model=sonnet`) | `claude-sonnet-4-6` |
| 초안 모델 (요청 `model=opus`) | `claude-opus-4-7` |
| 검수 모델 (생성 JSON) | `claude-haiku-4-5-20251001` |
| API 경로 | Anthropic 직접 호출 (`https://api.anthropic.com`, base_url 없음) |
| 임베딩 Provider / 모델 | OpenAI · `text-embedding-3-small` |
| RAG 컨텍스트 예산 | 28,000 토큰 (초과 시 trimmable 섹션 반감/제거) |
| `_fetch_recent_raw` LIMIT | 4 (이번 변경) |
| `_fetch_vector_similar` LIMIT | 15 (이번 변경) |
| 작품 정보 | 제목 *잊고싶은 모든 것을 기억해드립니다* · 에피소드 10(중복 제외) · 등장인물 10 · 세계관 24 · 떡밥 0 · 회차 요약 0 |
| 스토리라인 (11화 방향) | "서리운이 새로운 의뢰인을 만나 기억을 열어본다. 그 기억 속에서 예상치 못한 것이 발견된다." |
| `current_episode_num` | 11 |

## 2. 임베딩 결과

- 대상 에피소드: 10개 (sort_order 1~10, 중복 2중 하나씩만 선택; `created_at` 오래된 쪽)
- 생성된 `episode_chunk` 행: **86개** (재시도 누적으로 중복 인덱싱된 분 포함, 첫 성공분 72 + 후속 14)
- 본문 평균 길이: 8,495자/에피소드 (최소 6,946 / 최대 11,661)
- 청크당 평균 길이: 약 990자 ≈ 500 토큰 추정
- **비용**: `text-embedding-3-small` × 약 43,000 토큰 ≈ **$0.00086** (₩1 미만, 무시 가능)

> 참고: 중복 청크는 벡터 검색 결과에 경미한 편향을 줄 수 있으나 비용 영향은 사실상 0.

## 3. 초안 생성 — Sonnet (`claude-sonnet-4-6`)

| 항목 | 값 |
| --- | --- |
| input_tokens | **33,364** |
| output_tokens | **7,999** (max=8,000 — 사실상 한도 도달) |
| 응답 본문 길이 | 7,699자 |
| 단가 (Anthropic 공개가) | input $3 / 1M tok · output $15 / 1M tok |
| 비용 | $0.2201 ≈ **₩308** (환율 1,400 KRW/USD 가정) |

### 3.1 입력 구성 (RAG trimmer 적용 전 섹션별 토큰)

| 섹션 | 토큰 | 비고 |
| --- | ---: | --- |
| `work_meta` | 575 | 제목·작가·설명 |
| `characters` | 3,141 | 등장인물 10명 요약 |
| `world_notes` | 5,061 | 세계관 24개 |
| `foreshadows` | 0 | 저장된 떡밥 없음 |
| `storyline` (plot 메모 + 이번 회 방향) | 61 | |
| `recent_summaries` (최근 10화 요약) | 0 | 아직 summary 미생성 |
| `recent_raw` (최근 4화 원문, sort 10→7) | **30,309** | |
| `vector_search` (유사 청크 15) | 14,621 | |
| **합계 (pre-trim)** | **53,768** | 28,000 예산 초과 → trim 트리거 |

`_trim_to_budget`가 우선순위 낮은 순(`vector_search → foreshadows → world_notes → characters`)으로 반감/제거. 실제 전송된 프롬프트는 system(~200) + user(context + 스토리라인 지시문) = 약 **33.4k 토큰**. recent_raw(30.3k)가 예산을 단독 초과하므로 trim이 recent_raw를 제외한 나머지를 크게 축소한 것으로 추정.

### 3.2 본문 앞 500자

```
# 11화: 보관사의 기억

화요일 오전이었다.

리운은 출근하면서 지하철 다섯 번째 칸 끝자리에 앉아 오늘의 의뢰서를 열었다.

> 의뢰인 #20310420-G
55세 / 남성
의뢰 종류: 영구 삭제
사전 분류: 가족 관계 / 3년

영구 삭제였다. 리운은 그 두 글자를 잠깐 봤다. 일시 보관이 아니었다. 3년치 기억을 완전히 지우겠다는 의뢰였다. 가족 관계.

리운은 휴대폰을 가방에 넣었다. 창밖에 지하의 어둠이 흘러갔다.

영구 삭제는 일시 보관보다 드물었다. 보관사 제도 초기에는 영구 삭제가 전체 의뢰의 30퍼센트를 넘겼지만, 지금은 10퍼센트 안팎이었다.
```

## 4. 초안 생성 — Opus (`claude-opus-4-7`)

| 항목 | 값 |
| --- | --- |
| input_tokens | **33,423** |
| output_tokens | **8,000** (max 도달) |
| 응답 본문 길이 | 7,604자 |
| 단가 | input $5 / 1M tok · output $25 / 1M tok |
| 비용 | $0.367 ≈ **₩514** |

### 4.1 입력 구성

Sonnet과 동일한 RAG 컨텍스트 파이프라인. input 토큰이 Sonnet(33,364) 대비 59 토큰 증가 — 모델별 토크나이저 차이 수준. 구성 비율은 3.1과 동일.

> 구현 메모: Opus 4.7은 `temperature` 파라미터를 deprecated 처리해 400을 반환. `llm.py`에서 `opus-4-7` 모델일 때 `temperature` 인자 제외하도록 조건부 처리함.

### 4.2 본문 앞 500자

```
=== 11화: 빗속의 낯선 얼굴 ===

수요일 아침부터 비가 내렸다.

리운은 평소보다 10분 일찍 집을 나섰다. 우산을 챙기고, 지하철역까지 걷는 동안 어깨가 젖었다. 우산은 작았다. 7년 전에 산 것이었고, 그때도 싸구려였다. 살을 두 개쯤 잃어버려서 한쪽이 비스듬히 내려앉아 있었다. 리운은 새 우산을 산 적이 없었다. 새 우산을 사는 것도 사람의 일이었고, 리운은 오래전부터 그런 일을 잘 하지 않았다.

7호선 다섯 번째 칸 끝자리에 앉아 그는 오늘의 의뢰서를 확인했다.

> 의뢰인 #20310420-G
> 54세 / 남성
> 의뢰 종류: 영구 삭제
> 사전 분류: 미상 / 기간 미상
```

## 5. 검수 (Opus 초안 기반)

| 항목 | 값 |
| --- | --- |
| 모델 | `claude-haiku-4-5-20251001` |
| input_tokens | **51,274** |
| output_tokens | **2,000** (max=2,000 — 한도 도달 → 응답 잘림) |
| 단가 | input $1 / 1M tok · output $5 / 1M tok |
| 비용 | $0.0613 ≈ **₩86** |

### 5.1 입력 구성 (추정)

- 작품 컨텍스트 (동일 RAG, storyline="" 로 호출) — vector_search 0 (storyline 없음) → 약 18~22k 토큰
- 등장인물 전체 상세 (`_format_character_settings`, 10명 전체 content 포함) — 약 12~15k 토큰
- 세계관 상세 (24개 전체) — 약 7~9k 토큰
- 검수 대상 원고 (Opus 초안 7,604자 plain text) — 약 7~8k 토큰
- 응답 스키마 힌트 — 약 150 토큰

drafts 대비 input이 약 54% 크고(33k → 51k) reviews의 system+설정+원고 포함 특성 반영.

### 5.2 결과 — ⚠️ 파싱 실패

```json
{
  "issues": [],
  "summary": "검수 결과 없음 (fake)",
  "score": 100,
  "usage": {"input_tokens": 51274, "output_tokens": 2000}
}
```

- 응답 본문이 `max_tokens=2000` 한도에 도달해 JSON이 중간에 잘림 → `_parse_json_response`가 `{"error": "JSON 파싱 실패", "raw": "..."}` 반환
- `_normalize_review_result`는 `"issues"`/`"score"` 키가 없는 응답에 한해 기본 `"검수 결과 없음 (fake)"` summary를 돌려줌 → FakeLLM이 아니지만 summary 문구 때문에 혼동 가능
- **실제 잡아낸 충돌 요약**: 없음 (모델 출력이 잘려 JSON 미복구). 토큰은 실제 사용됨.

**개선 제안** (비용 보고서 범위 밖, 향후 과제):
1. `generate_json`의 `max_tokens`를 2,000 → 4,000~8,000로 상향 (Haiku 단가 저렴)
2. 응답이 끝나지 않았을 때 재시도 로직 또는 JSON prefill + streaming 완결성 검사
3. `_normalize_review_result` fallback summary에서 `(fake)` 문구 제거 또는 에러 표식화

## 6. 비용 요약표

| 기능 | 모델 | input | output | 비용($) | 비용(₩, 1,400 KRW/USD) |
| --- | --- | ---: | ---: | ---: | ---: |
| 임베딩 | text-embedding-3-small | ~43,000 | – | 0.0009 | ~1 |
| 초안 Sonnet | claude-sonnet-4-6 | 33,364 | 7,999 | 0.2201 | 308 |
| 초안 Opus | claude-opus-4-7 | 33,423 | 8,000 | 0.3671 | 514 |
| 검수 | claude-haiku-4-5-20251001 | 51,274 | 2,000 | 0.0613 | 86 |
| **합계 (1회 테스트)** |  |  |  | **0.6495** | **909** |

## 7. 이전 예상 vs 실측 비교

| 기능 | 이전 예상 | 이번 실측 | 차이 원인 |
| --- | --- | --- | --- |
| 초안 Sonnet | 약 15~20k input / 3~5k output | 33.4k in / 8.0k out | recent_raw LIMIT 2→4로 확대되어 원문 토큰이 약 2배; max_tokens(8k) 한도 도달로 output 상한 |
| 초안 Opus | Sonnet 유사, 단가 약 1.7× | Sonnet과 input 거의 동일, 단가 input $5 / output $25 적용 | Opus는 temperature 미지원(별도 수정) |
| 검수 | 약 20~30k input / 1k output | 51.3k in / 2k out (잘림) | 설정집 전체(+작품 컨텍스트+원고)가 모두 system/user에 풀로 삽입되어 input 과중. output 한도에 걸려 파싱 실패 |
| 임베딩 | 1~2원/작품 (10화 기준) | 1원 미만 | 예상 범위 내 |

### 주요 체감

- **Opus 한 번 = Sonnet 약 1.7회** (Opus 4.7 단가 input $5/output $25 기준). dummy-work-2 정도 규모에서 Opus 초안 생성은 1회 ~₩500대.
- **검수가 drafts보다 더 많은 input 토큰**을 씀 (51k vs 33k). 설정집 전체 삽입 + RAG 컨텍스트 중복 삽입이 겹쳐 발생. Haiku 단가 덕에 최종 비용은 작지만, 토큰 효율 관점에선 설정집 중복 제거 여지 있음.
- **recent_raw LIMIT 4** 변경으로 초안 input이 약 +50% 증가. 품질 개선 대비 비용 증가를 계속 모니터링 필요.
- **RAG 토큰 예산(28k)이 recent_raw(30k)만으로도 초과**하는 상황. trim 로직이 모든 vector_search/world_notes를 대폭 잘라내고 있을 가능성이 높음 — 초안 품질 분석 시 추가 확인 필요.
