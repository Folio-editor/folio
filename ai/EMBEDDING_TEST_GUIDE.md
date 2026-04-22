# AI 임베딩 테스트 가이드

이 문서는 `ai` 서버에서 임베딩이 어떻게 동작하는지,  
그리고 우리가 무엇을 테스트했고 어디까지 성공했는지를 설명하는 문서다.

예전에는 `embed_fixtures.py`를 직접 실행해서 임베딩을 시험하는 문서였다.  
하지만 지금 프로젝트에서 더 중요한 흐름은 아래와 같다.

```text
작가가 원고 저장
-> FastAPI 파이프라인 API 호출
-> Celery worker가 작업을 가져감
-> 본문을 청킹함
-> 각 청크를 임베딩함
-> episode_chunk 테이블에 저장함
```

즉 지금은 "임베딩 함수만 따로 돌려보는 문서"가 아니라,  
"프로젝트 안에서 임베딩이 실제로 어떻게 흘러가는지"를 이해하는 문서로 보는 것이 맞다.

---

## 1. 임베딩이란 무엇인가

임베딩은 글을 숫자로 바꾸는 작업이다.

쉬운 비유로 생각하면:

- 소설 본문은 긴 문장 덩어리다.
- AI는 긴 글을 그대로 기억하기보다, 그 글의 특징을 숫자 좌표로 바꿔서 저장한다.
- 그러면 나중에 "비슷한 장면"을 더 빨리 찾을 수 있다.

또 다른 비유:

- 긴 글 전체를 한 장 종이에 다 적어 가방에 넣으면 불편하다.
- 그래서 장면별로 잘라 작은 카드로 나눈다.
- 그리고 각 카드에 "이 장면의 성격"을 숫자로 붙인다.
- 그 숫자표가 바로 임베딩 벡터다.

우리 프로젝트에서는 이 과정이 다음 순서로 일어난다.

1. 에피소드 본문을 가져온다.
2. 본문을 적당한 크기의 청크로 자른다.
3. 각 청크를 벡터로 만든다.
4. 그 결과를 `episode_chunk` 테이블에 저장한다.

---

## 2. 실제로 어떤 파일이 이 일을 하는가

핵심 파일은 아래 4개다.

### `ai/app/api/v1/pipelines.py`

이 파일은 `POST /v1/pipelines/episode` API를 만든다.

이 API는 무거운 일을 직접 하지 않는다.  
역할은 "작업 접수"에 가깝다.

쉽게 말하면:

- 손님이 주문을 넣는다.
- 접수 직원이 주문서를 작성한다.
- 실제 조리는 주방에서 한다.

여기서 접수 직원이 바로 `pipelines.py`다.

---

### `ai/app/tasks/chunk_and_embed.py`

이 파일은 실제 청킹과 임베딩을 수행하는 Celery task다.

중요한 흐름은 이렇다.

1. `chunk_text(content)`로 본문을 자른다.
2. `get_embedder()`로 어떤 임베더를 쓸지 정한다.
3. `embedder.embed_batch(chunks)`를 호출한다.
4. 결과를 `episode_chunk` 테이블에 넣는다.

즉 "임베딩이 된다 / 안 된다"를 볼 때 실제 핵심 파일은 여기다.

---

### `ai/app/services/chunker.py`

이 파일은 본문을 청크로 나눈다.

비유하면:

- 긴 소설 원문을 통째로 보관하기 어렵다.
- 그래서 적당한 길이의 카드 묶음으로 나눈다.

청킹은 바로 그 "카드로 나누는 작업"이다.

---

### `ai/app/services/embedder.py`

이 파일은 실제 임베딩 제공자(provider)를 정한다.

현재 구조는 두 가지다.

- `FakeEmbedder`
  - 가짜 벡터를 만든다.
  - 테스트용이다.
- `OpenAIEmbedder`
  - 진짜 OpenAI API를 호출해야 하는 경로다.

중요:

현재 기준으로 `OpenAIEmbedder.embed_batch()`는 아직 구현되지 않았다.  
즉 real mode로 들어가는 길은 연결되었지만, 마지막 OpenAI 호출 부분은 아직 비어 있는 상태다.

---

## 3. fake 모드와 real 모드의 차이

### fake 모드

fake 모드는 연습 모드다.

- API 구조 확인 가능
- Celery 흐름 확인 가능
- DB 저장 흐름 확인 가능
- 비용이 들지 않음

하지만 진짜 OpenAI는 호출하지 않는다.

즉 "배관이 연결됐는지"를 보는 테스트다.

---

### real 모드

real 모드는 진짜 시험이다.

- 실제 OpenAI API 사용
- 실제 API key 사용
- 실제 벡터 생성

즉 "수도관에 진짜 물이 흐르는지"를 보는 테스트다.

---

## 4. Doppler에서 중요한 값

임베딩 real mode에서 특히 중요한 값은 아래와 같다.

- `OPENAI_API_KEY`
- `EMBEDDING_PROVIDER`
- `INTERNAL_API_KEY`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USERNAME`
- `DB_PASSWORD`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`

여기서 핵심 둘:

### `OPENAI_API_KEY`

이건 OpenAI에 들어가는 출입증이다.

이게 없으면 real 임베딩은 절대 못 한다.

### `EMBEDDING_PROVIDER=openai`

이건 "연습 모드(fake)가 아니라 진짜 OpenAI를 쓰겠다"는 스위치다.

즉:

- `OPENAI_API_KEY` = 출입증
- `EMBEDDING_PROVIDER=openai` = 진짜 문으로 들어가겠다는 선택

둘 다 있어야 real mode 의미가 생긴다.

---

## 5. 현재 config.py는 Doppler를 어떻게 읽는가

현재 `ai/app/config.py`는 Doppler 구조에 맞춰 수정되어 있다.

즉 아래처럼 동작한다.

### Anthropic 키

- `ANTHROPIC_API_KEY`가 있으면 그걸 사용
- 없으면 `CLAUDE_API_KEY`도 읽는다.

### PostgreSQL

- `DATABASE_URL`이 있으면 그대로 사용
- 없으면 아래 값들을 조합해서 URL을 만든다.
  - `DB_HOST`
  - `DB_PORT`
  - `DB_NAME`
  - `DB_USERNAME`
  - `DB_PASSWORD`

### Redis / Celery

- `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`가 있으면 그대로 사용
- 없으면 `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`로 조합한다.

즉 지금 방향은:

- Doppler는 최대한 안 바꾸고
- AI 코드가 Doppler 구조를 이해하게 만든 상태

---

## 6. 우리가 실제로 해본 real mode 테스트

이 부분이 현재 버전에서 가장 중요하다.

### Step 1. Doppler 값 확인

먼저 확인한 것:

- `OPENAI_API_KEY exists = True`
- `INTERNAL_API_KEY exists = True`
- 처음에는 `EMBEDDING_PROVIDER = None`

그래서 Doppler에 아래 값을 추가했다.

```text
EMBEDDING_PROVIDER=openai
```

이후 다시 확인했을 때:

- `EMBEDDING_PROVIDER = openai`
- `OPENAI_API_KEY exists = True`

즉 real mode 스위치가 켜진 것을 확인했다.

---

### Step 2. AI 서버 실행

실행 명령:

```bash
cd ai
doppler run -- uvicorn app.main:app --reload --port 8000
```

의미:

- Doppler 시크릿 주입
- FastAPI 서버 실행

정상 로그:

```text
Uvicorn running on http://127.0.0.1:8000
Application startup complete.
```

이 단계는 가게 문을 여는 것과 비슷하다.

---

### Step 3. Celery worker 실행

처음엔 이렇게 실행했다.

```bash
doppler run -- celery -A app.celery_app worker --loglevel=info
```

그런데 이 worker는 기본 `celery` 큐를 듣고 있었고,  
우리 파이프라인 task는 `indexing` 큐로 가기 때문에 정확히 맞지 않았다.

그래서 이렇게 다시 실행했다.

```bash
doppler run -- celery -A app.celery_app worker -Q indexing --pool=solo --loglevel=info
```

여기서 중요한 점:

### 왜 `-Q indexing`가 필요한가

파이프라인 task는 `indexing` 큐로 라우팅된다.  
worker가 그 큐를 듣고 있어야 한다.

### 왜 `--pool=solo`가 필요한가

Windows에서 Celery `prefork`는 자주 깨진다.

실제로 우리는 이런 에러를 봤다.

```text
ValueError: not enough values to unpack (expected 3, got 0)
```

이건 task 코드 문제가 아니라 Windows에서 worker 실행 방식이 깨진 것이다.  
그래서 로컬 테스트에서는 `solo`가 더 안전하다.

쉽게 말하면:

- `prefork` = 여러 조교를 한꺼번에 투입
- `solo` = 한 명이 순서대로 처리

빠르진 않아도 로컬 검증에는 훨씬 안정적이다.

---

### Step 4. DB에서 테스트용 episode 조회

명령:

```bash
docker exec -it storyzip-postgresql-dev psql -U storyzip -d storyzip -c "SELECT id, work_id, writer_id FROM episode LIMIT 1;"
```

이 단계의 목적:

- 실제 DB에 존재하는 `episode_id`, `work_id`, `writer_id`를 가져오기 위해서다.

즉 이것은 "실험에 쓸 샘플 선택" 단계다.

---

### Step 5. 파이프라인 API 호출

요청 payload를 JSON 파일로 만든 뒤 아래처럼 호출했다.

```bash
doppler run -- bash -lc 'curl -X POST http://127.0.0.1:8000/v1/pipelines/episode -H "Content-Type: application/json" -H "X-Internal-Api-Key: $INTERNAL_API_KEY" --data-binary @pipeline_real_payload.json'
```

응답:

```json
{"task_id":"...","status":"accepted"}
```

이 뜻:

- 인증 성공
- FastAPI 라우팅 성공
- Redis 큐 등록 성공

즉 이 단계는 "주문 접수 성공"이다.  
아직 요리가 끝났다는 뜻은 아니다.

---

### Step 6. Worker 로그 확인

올바른 `indexing` 큐와 `solo` worker로 다시 띄운 뒤,  
이제 task가 실제로 들어오는 로그를 확인했다.

로그:

```text
Task app.tasks.chunk_and_embed[...] received
```

이건 아주 중요하다.

왜냐하면 이 로그는:

- API
- Redis
- Celery
- task 실행

이 흐름이 실제로 연결됐다는 뜻이기 때문이다.

즉 "배선은 연결되어 있고, 스위치를 누르면 기계가 돌기 시작한다"는 뜻이다.

---

## 7. 그런데 왜 real mode가 아직 최종 성공은 아닌가

worker 로그는 여기서 멈췄다.

에러:

```text
NotImplementedError: SSAFY GMS 키 발급 후 활성화
```

발생 위치:

- `ai/app/services/embedder.py`
- `OpenAIEmbedder.embed_batch()`

현재 이 함수는 실제 OpenAI API를 부르지 않고, 아직 비어 있다.

즉 지금 상태를 정확히 말하면:

### 이미 성공한 것

- Doppler 연동 성공
- `OPENAI_API_KEY` 읽기 성공
- `EMBEDDING_PROVIDER=openai` 선택 성공
- FastAPI 실행 성공
- Celery worker 실행 성공
- Redis 큐 연결 성공
- 파이프라인 API 성공
- `chunk_and_embed` task 실제 진입 성공

### 아직 미완성인 것

- `OpenAIEmbedder.embed_batch()` 실제 구현

즉 이번 real mode 테스트는 실패가 아니라,  
"환경 연결은 끝났고 마지막 OpenAI 호출 코드만 남았다"는 확인 작업이었다.

---

## 8. 지금 기준으로 가장 현실적인 결론

현재 버전에서 임베딩 기능은 두 층으로 나뉜다.

### 구조 레벨

이미 됨.

- API
- Celery
- queue routing
- DB 연결
- Doppler
- provider 선택

### 실제 OpenAI 호출 레벨

아직 안 됨.

- 이유: `OpenAIEmbedder.embed_batch()` 미구현

즉 지금 프로젝트 상태를 한 문장으로 말하면:

"임베딩을 하러 가는 길, 문, 전기, 직원, 접수대는 다 준비됐는데,  
마지막 기계 버튼만 아직 연결되지 않았다."

---

## 9. 앞으로 해야 할 일

다음 구현 우선순위는 명확하다.

### 1순위

`ai/app/services/embedder.py`의 `OpenAIEmbedder.embed_batch()` 구현

해야 할 내용:

1. OpenAI 클라이언트 생성
2. `embeddings.create(...)` 호출
3. 응답에서 벡터 추출
4. `list[list[float]]`로 반환

### 2순위

구현 후 다시 아래 흐름으로 재검증

1. AI 서버 실행
2. Celery worker 실행 (`-Q indexing --pool=solo`)
3. 파이프라인 API 호출
4. `episode_chunk` DB 확인

---

## 10. 최종적으로 무엇을 보면 "완전 성공"인가

OpenAI 임베딩 real mode가 완전히 성공했다고 말하려면 아래가 모두 맞아야 한다.

### 1. 파이프라인 API 응답

```json
{"task_id":"...","status":"accepted"}
```

### 2. Worker 로그

```text
Task app.tasks.chunk_and_embed[...] received
Task app.tasks.chunk_and_embed[...] succeeded
```

### 3. DB 확인

`episode_chunk` 테이블에서:

- 행이 생겨야 한다
- `chunk_index`가 있어야 한다
- `token_count`가 있어야 한다
- `embedding` 컬럼이 비어 있지 않아야 한다

예시 조회:

```sql
SELECT chunk_index, token_count, length(embedding::text) AS vec_length
FROM episode_chunk
WHERE episode_id = '...'
ORDER BY chunk_index;
```

여기서:

- 결과 행이 1개 이상
- `vec_length`가 0보다 큼

이면 실제 벡터가 들어갔다고 볼 수 있다.

---

## 11. 이 문서의 현재 결론

현재 기준으로 우리 AI 임베딩 파이프라인은 다음 상태다.

- fake mode 검증 가능
- real mode 환경 연결 검증 가능
- real mode task 진입 확인 가능
- OpenAI 실제 임베딩 호출 코드는 아직 구현 필요

즉 이 문서는 예전처럼 "임베딩만 따로 돌려보는 문서"가 아니라,  
"프로젝트 안에서 임베딩이 실제로 어떻게 움직이는지 이해하고 점검하는 문서"라고 보면 된다.
