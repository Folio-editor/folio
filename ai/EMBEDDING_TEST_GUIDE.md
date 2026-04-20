# Folio 임베딩 실행 문서

이 문서는 "코드를 실제로 돌리는 사람" 기준으로 정리한다.

핵심만 먼저 말하면:

- 지금 실제로 실행하는 파일은 `ai/embed_fixtures.py`다.
- 이 파일은 더미 에피소드 JSON을 읽어서 OpenAI 임베딩 API를 호출한다.
- 결과 벡터는 지금은 **파일에도 저장되지 않고 DB에도 저장되지 않는다.**
- 지금은 콘솔에만 결과가 출력된다.
- 즉, 현재 목적은 "임베딩 호출이 실제로 잘 되는지 확인"하는 것이다.

---

## 1. 지금 있는 파일과 역할

### 실행 파일

- `ai/embed_fixtures.py`
  - 이 파일을 직접 실행한다.
  - 더미 데이터 파일을 읽는다.
  - `embedder.py`의 함수를 호출한다.
  - 결과를 콘솔에 출력한다.

### 임베딩 호출 코드

- `ai/embedder.py`
  - `embed_text(text)`:
    - 문자열 1개를 OpenAI에 보내서 임베딩 벡터 1개를 받는다.
  - `embed_batch(texts)`:
    - 문자열 여러 개를 OpenAI에 보내서 임베딩 벡터 여러 개를 받는다.
  - 실제 OpenAI 호출은 여기서 일어난다.

### 환경변수 파일

- `ai/.env`
  - 여기에 실제 `OPENAI_API_KEY`를 넣는다.
  - 실행 시 `embed_fixtures.py`가 이 파일을 읽는다.

- `ai/.env.example`
  - 팀원에게 "이 변수 필요함"을 보여주는 예시 파일이다.
  - 실행에는 보통 안 쓴다.

### 입력 데이터 파일

- `ai/tests/fixtures/dummy-work-1/episodes.json`
- `ai/tests/fixtures/dummy-work-2/episodes.json`
- `ai/tests/fixtures/dummy-work-3/episodes.json`

이 파일들의 각 에피소드 `content`가 실제 임베딩 입력이 된다.

예:

```json
{
  "episode_number": 1,
  "title": "제목",
  "content": "이 본문 전체가 OpenAI 임베딩 입력으로 들어감"
}
```

### 참고

- `ai/chunker.py`는 지금 이 실행 흐름에서 사용되지 않는다.
- 청킹은 구현돼 있지만, `embed_fixtures.py`는 현재 청킹 없이 **에피소드 본문 전체**를 그대로 임베딩한다.

---

## 2. 지금 실제로 돌리는 명령

### 2-1. 실제 실행 파일

```powershell
python ai\embed_fixtures.py
```

이 명령이 시작점이다.

---

## 3. 이 명령을 실행하면 내부에서 무슨 일이 일어나는가

`python ai\embed_fixtures.py`를 실행하면 순서가 이렇게 흘러간다.

### 1단계. `ai/.env`를 읽는다

`embed_fixtures.py`가 `ai/.env`를 읽는다.

여기서 필요한 값:

```env
OPENAI_API_KEY=실제_API_키
```

이 값은 나중에 `embedder.py`에서 OpenAI 클라이언트를 만들 때 사용된다.

### 2단계. 어떤 더미 작품을 읽을지 결정한다

기본값은 아래 3개를 전부 본다.

- `dummy-work-1`
- `dummy-work-2`
- `dummy-work-3`

특정 작품만 돌리고 싶으면 옵션을 준다.

```powershell
python ai\embed_fixtures.py --work dummy-work-1
```

### 3단계. 각 작품 폴더의 `episodes.json`을 읽는다

예를 들어 `dummy-work-1`을 돌리면:

- `ai/tests/fixtures/dummy-work-1/episodes.json`

이 파일을 JSON으로 읽는다.

### 4단계. `content`가 비어 있지 않은 에피소드만 추린다

예를 들어 아래처럼 비어 있으면 제외된다.

```json
{
  "episode_number": 8,
  "title": "",
  "content": ""
}
```

아래처럼 본문이 있으면 포함된다.

```json
{
  "episode_number": 1,
  "title": "아무도 모르는 창",
  "content": "실제 소설 본문..."
}
```

### 5단계. 각 에피소드의 `content`를 OpenAI에 보낸다

`embed_fixtures.py`는 본문 문자열 목록을 만들고,
그걸 `embedder.py`의 `embed_batch()`에 넘긴다.

즉, 실제 호출 흐름은:

1. `ai/embed_fixtures.py`
2. `ai/embedder.py`의 `embed_batch(texts)`
3. OpenAI `text-embedding-3-small`
4. 1536차원 벡터 응답

### 6단계. 결과를 콘솔에 출력한다

성공하면 이런 식으로 나온다.

```text
[dummy-work-1] episodes with content: 5
  - episode 1: title='아무도 모르는 창', embedding_dim=1536
  - episode 2: title='속도가 다르다', embedding_dim=1536
Embedding complete. Embedded episodes: 5
```

이 말은:

- `dummy-work-1`에서 본문이 있는 에피소드 5개를 찾았고
- 각 본문을 실제로 OpenAI에 보냈고
- 응답으로 1536차원 벡터를 받았다는 뜻이다

---

## 4. 결과는 어디에 저장되는가

현재는 **어디에도 저장되지 않는다.**

정확히 말하면:

- JSON 파일에 다시 쓰지 않음
- 별도 출력 파일 생성 안 함
- DB 저장 안 함
- pgvector 저장 안 함

지금은 단지:

- 입력 파일을 읽고
- OpenAI에 보내고
- 응답이 정상인지 콘솔로 확인

까지만 구현돼 있다.

즉, 현재 스크립트는 "실제 임베딩 테스트용"이다.

---

## 5. `--dry-run`은 정확히 뭐냐

이 옵션은 **실제 OpenAI 호출을 하지 않는 실행 모드**다.

명령:

```powershell
python ai\embed_fixtures.py --dry-run
```

이 모드에서는:

- `ai/.env`를 읽는다
- `episodes.json`을 읽는다
- JSON 문법이 맞는지 확인한다
- `content`가 있는 에피소드가 몇 개인지 센다
- 제목, 글자 수를 출력한다
- **OpenAI API는 호출하지 않는다**
- **비용이 들지 않는다**

즉, `dry-run`은
"실제 임베딩 호출 전에 입력 데이터와 실행 경로만 점검하는 모드"다.

출력 예:

```text
[dummy-work-1] episodes with content: 5
  - episode 1: title='아무도 모르는 창', chars=3912
Dry run complete. Episodes ready for embedding: 5
```

이건 "작품 1의 에피소드 5개가 실제 임베딩 가능한 상태"라는 뜻이다.

---

## 6. 추천 실행 순서

### 1단계. 작품 1 입력 검증만

```powershell
python ai\embed_fixtures.py --dry-run --work dummy-work-1
```

이 단계에서 확인하는 것:

- `dummy-work-1/episodes.json`이 JSON으로 정상인지
- 에피소드 본문이 몇 개 들어있는지
- 어떤 에피소드가 실제 임베딩 대상인지

### 2단계. 작품 1 한 화만 실제 호출

```powershell
python ai\embed_fixtures.py --work dummy-work-1 --limit 1
```

이 단계에서 일어나는 것:

- 작품 1의 앞 1개 에피소드만 OpenAI로 보냄
- 실제 임베딩 호출이 일어남
- 결과 벡터 길이가 1536인지 콘솔로 확인

### 3단계. 작품 1 전체 호출

```powershell
python ai\embed_fixtures.py --work dummy-work-1
```

이 단계에서 일어나는 것:

- 작품 1의 본문 있는 에피소드 전부를 OpenAI로 보냄
- 각 에피소드별 임베딩 결과를 콘솔에 출력

### 4단계. 작품 3도 동일하게 테스트

```powershell
python ai\embed_fixtures.py --work dummy-work-3
```

---

## 7. 지금 바로 실행 가능한 상태

현재 확인한 상태:

- `dummy-work-1`: 실행 가능
- `dummy-work-3`: 실행 가능
- `dummy-work-2`: 현재 JSON 문법 오류로 실행 불가

즉 지금 당장 해볼 명령은 이 두 개가 가장 안전하다.

```powershell
python ai\embed_fixtures.py --dry-run --work dummy-work-1
python ai\embed_fixtures.py --work dummy-work-1 --limit 1
```

---

## 8. 에러가 날 때 무슨 뜻인지

### 에러 1. `OPENAI_API_KEY is not set`

뜻:

- `ai/.env`에 키가 없거나
- 키 이름이 다르거나
- 값이 비어 있음

확인할 파일:

- `ai/.env`

형식:

```env
OPENAI_API_KEY=실제_API_키
```

### 에러 2. `Invalid JSON in ... episodes.json`

뜻:

- 해당 `episodes.json` 파일 문법이 깨져 있음
- 따옴표가 안 닫혔거나
- 줄바꿈/특수문자가 JSON 규칙에 안 맞음

현재 걸리는 파일:

- `ai/tests/fixtures/dummy-work-2/episodes.json`

이 경우 이 파일을 먼저 고쳐야 한다.

### 에러 3. 임베딩 차원이 1536이 아님

뜻:

- 모델명 변경
- 응답 구조 이상
- 코드 버그

정상이라면 무조건 `1536`이 나와야 한다.

---

## 9. 지금 코드 기준 한계

지금은 아직 아래가 구현되지 않았다.

- 청킹 후 임베딩
- 임베딩 결과 파일 저장
- 임베딩 결과 DB 저장
- 유사도 검색
- 에피소드 재인덱싱

즉 현재는:

"더미 에피소드 본문을 OpenAI에 보내면 임베딩이 실제로 생성되는지 확인하는 테스트 스크립트"

까지만 있는 상태다.

---

## 10. 한 줄 요약

지금은 `ai/embed_fixtures.py`를 실행해서 `dummy-work-* / episodes.json`의 `content`를 OpenAI에 보내고, 결과가 **콘솔에만 출력되는지** 확인하는 단계다. 아직 저장은 하지 않는다.
