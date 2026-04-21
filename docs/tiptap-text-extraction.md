# TipTap JSON → Pure Text 정제 구현 계획

## 1. Context

Folio 프로젝트는 TipTap 에디터에서 작성된 콘텐츠를 `JSON.stringify(editor.getJSON())` 형태로 PostgreSQL TEXT 컬럼에 저장한다. AI 서비스(FastAPI)가 이 데이터를 청킹, 임베딩, 요약, RAG 컨텍스트 조립, MCP 도구 응답 등에 활용하는데, **JSON을 순수 텍스트로 변환하는 과정이 현재 완전히 누락**되어 있어 AI 품질에 직접적인 영향을 미치고 있다.

### 영향받는 콘텐츠 컬럼

| 테이블 | 컬럼 | 저장 형식 |
|--------|------|----------|
| episode | content | TipTap JSON |
| world_note | content | TipTap JSON |
| character | content | TipTap JSON |
| character_note | content | TipTap JSON |
| plot | content | TipTap JSON |
| foreshadow | content | TipTap JSON |
| plan | content | TipTap JSON |
| plan_note | content | TipTap JSON |
| idea_archive | content | TipTap JSON |

---

## 2. 현재 문제 상세 분석

### 2.1 발생하는 구체적 문제

| 문제 | 설명 | 영향도 |
|------|------|--------|
| **토큰 낭비** | `{"type":"paragraph","content":[{"type":"text","text":"` 같은 구조 메타데이터가 실제 텍스트의 2~3배 토큰을 소비 | 높음 |
| **임베딩 품질 저하** | JSON 구조 키워드(`type`, `content`, `paragraph`)가 벡터 공간을 오염시켜 유사도 검색 정확도 하락 | 높음 |
| **청킹 오작동** | JSON 문자열에는 `\n` 구분자가 없어 `text.split("\n\n")` 기반 단락 분할이 정상 작동하지 않음 | 높음 |
| **LLM 컨텍스트 오염** | RAG 컨텍스트 28K 토큰 예산 중 상당 부분이 JSON 메타데이터에 소비 | 높음 |
| **요약/추출 품질 저하** | LLM이 JSON 구조를 파싱하느라 실제 내용 분석에 집중하지 못함 | 중간 |
| **잘림 오류** | MCP 도구에서 `content[:200]` 같은 truncate 시 JSON이 깨져서 의미 없는 문자열이 됨 | 중간 |

### 2.2 문제 발생 위치 (파일별 라인 단위)

| 컴포넌트 | 파일 | 라인 | 문제 |
|----------|------|------|------|
| 청킹 | `ai/app/services/chunker.py` | 17 | `text.split("\n")` — JSON에는 `\n`이 거의 없어 하나의 거대한 청크 생성 |
| 임베딩 | `ai/app/tasks/chunk_and_embed.py` | 21 | `chunk_text(content)` — JSON 메타데이터가 임베딩 벡터를 오염 |
| 요약 | `ai/app/tasks/generate_summary.py` | 38 | `f"아래 회차 본문을 분석하세요:\n\n{content}"` — JSON 구조 그대로 LLM에 전달 |
| RAG 원문 | `ai/app/services/rag.py` | 207-210 | `_fetch_recent_raw()`에서 `episode.content`를 그대로 컨텍스트에 삽입 |
| RAG 캐릭터 | `ai/app/services/rag.py` | 106 | `row[4][:200]` — JSON을 200자로 자르면 구조가 깨짐 |
| RAG 세계관 | `ai/app/services/rag.py` | 125 | `row[4][:300]` — 동일 문제 |
| RAG 복선 | `ai/app/services/rag.py` | 145 | `row[4][:200]` — 동일 문제 |
| MCP 캐릭터 | `ai/app/mcp/tools/character.py` | 50 | `"content": row[7]` — raw JSON 그대로 반환 |
| MCP 세계관 | `ai/app/mcp/tools/world_note.py` | 43 | `"content": row[5]` — raw JSON 그대로 반환 |

---

## 3. TipTap JSON 구조

### 3.1 Folio에서 사용하는 노드 타입

ContentEditor(`frontend/src/shared/components/editor/ContentEditor.tsx`)에서 사용하는 TipTap 확장으로 생성되는 노드 타입:

| 노드 타입 | 소스 확장 | 설명 | 텍스트 추출 방식 |
|-----------|----------|------|-----------------|
| `doc` | 기본 | 루트 문서 | 재귀 진입 |
| `paragraph` | StarterKit | 일반 단락 | 자식 텍스트 + `\n\n` |
| `heading` | StarterKit | 제목 (level 1~6) | 자식 텍스트 + `\n\n` |
| `bulletList` | StarterKit | 순서 없는 목록 | 자식 재귀 |
| `orderedList` | StarterKit | 순서 있는 목록 | 자식 재귀 (번호 추가) |
| `listItem` | StarterKit | 목록 항목 | `- ` 접두사 + 자식 텍스트 |
| `blockquote` | StarterKit | 인용문 | `> ` 접두사 + 자식 텍스트 |
| `codeBlock` | StarterKit | 코드 블록 | 자식 텍스트 (그대로) |
| `horizontalRule` | StarterKit | 수평선 | `---\n\n` |
| `hardBreak` | StarterKit | 강제 줄바꿈 | `\n` |
| `text` | 기본 | 텍스트 노드 (리프) | `.text` 값 반환 |
| `sceneBreak` | 커스텀 | 장면 전환 (`* * *`) | `\n* * *\n\n` |

### 3.2 마크(Mark) 타입

마크는 텍스트 노드에 스타일을 적용하며, **pure text 추출 시 무시**한다 (텍스트 내용만 추출):

| 마크 타입 | 설명 | 처리 방식 |
|-----------|------|----------|
| `bold` | 굵게 | 무시 (텍스트만 추출) |
| `italic` | 기울임 | 무시 |
| `underline` | 밑줄 | 무시 |
| `strike` | 취소선 | 무시 |
| `highlight` | 하이라이트 | 무시 |
| `code` | 인라인 코드 | 무시 |
| `link` | 링크 | 무시 (텍스트만 추출) |
| `textStyle` | 색상 등 | 무시 |
| `authorNote` | 작가 메모 | **제외** (AI 분석 대상이 아닌 작가 개인 메모) |

### 3.3 JSON 구조 예시

```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 1 },
      "content": [
        { "type": "text", "text": "제1장 시작" }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "그는 " },
        {
          "type": "text",
          "marks": [{ "type": "bold" }],
          "text": "조용히"
        },
        { "type": "text", "text": " 문을 열었다." }
      ]
    },
    {
      "type": "sceneBreak"
    },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "새벽 공기가 차가웠다." }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "marks": [{ "type": "authorNote" }],
          "text": "여기 복선 추가할 것"
        }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [{ "type": "text", "text": "첫 번째 항목" }]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [{ "type": "text", "text": "두 번째 항목" }]
            }
          ]
        }
      ]
    },
    {
      "type": "blockquote",
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "인용된 텍스트입니다." }]
        }
      ]
    }
  ]
}
```

---

## 4. 변환 예제 (Before → After)

### 예제 1: 기본 문서

**Before (DB 저장 형태 — 633 bytes, ~160 tokens):**
```json
{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"제1장 시작"}]},{"type":"paragraph","content":[{"type":"text","text":"그는 "},{"type":"text","marks":[{"type":"bold"}],"text":"조용히"},{"type":"text","text":" 문을 열었다."}]},{"type":"sceneBreak"},{"type":"paragraph","content":[{"type":"text","text":"새벽 공기가 차가웠다."}]}]}
```

**After (순수 텍스트 — 62 bytes, ~25 tokens):**
```
제1장 시작

그는 조용히 문을 열었다.

* * *

새벽 공기가 차가웠다.
```

> **토큰 절감: ~84%** (160 → 25 tokens)

### 예제 2: 작가 메모(authorNote) 제외

**Before:**
```json
{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"주인공이 검을 들었다."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"authorNote"}],"text":"여기에 복선 심기 — 나중에 3화에서 회수"}]}]}
```

**After:**
```
주인공이 검을 들었다.
```

> `authorNote` 마크가 있는 텍스트 노드는 완전히 제외됨 (작가 개인 메모이므로 AI에 노출하지 않음)

### 예제 3: 목록 + 인용문

**Before:**
```json
{"type":"doc","content":[{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"첫 번째 항목"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"두 번째 항목"}]}]}]},{"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"인용된 텍스트입니다."}]}]}]}
```

**After:**
```
- 첫 번째 항목
- 두 번째 항목

> 인용된 텍스트입니다.
```

### 예제 4: 빈 문서 / null

**Before:** `null` 또는 `""`

**After:** `""` (빈 문자열)

### 예제 5: 이미 plain text인 경우

**Before:** `"이것은 이미 일반 텍스트입니다."`

**After:** `"이것은 이미 일반 텍스트입니다."` (그대로 반환)

---

## 5. `extract_plain_text()` 구현 명세

### 5.1 파일 위치

```
ai/app/services/text_extractor.py
```

### 5.2 공개 인터페이스

```python
def extract_plain_text(content: str | None) -> str:
    """TipTap JSON 문자열에서 순수 텍스트를 추출한다.

    Args:
        content: TipTap JSON 문자열, 일반 텍스트, 또는 None

    Returns:
        순수 텍스트 문자열 (JSON 구조 제거, authorNote 제외)

    동작 규칙:
        - None 또는 빈 문자열 → "" 반환
        - JSON 파싱 실패 → 입력 그대로 반환 (이미 plain text로 간주)
        - 파싱 성공 but type != "doc" → 입력 그대로 반환
        - 정상 TipTap JSON → 재귀적으로 텍스트 노드 추출
    """
```

### 5.3 내부 구현 의사코드

```python
import json

def extract_plain_text(content: str | None) -> str:
    if not content:
        return ""
    try:
        doc = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return content  # 이미 plain text

    if not isinstance(doc, dict) or doc.get("type") != "doc":
        return content

    return _extract_nodes(doc.get("content", [])).strip()


def _extract_nodes(nodes: list) -> str:
    """노드 리스트를 재귀적으로 순회하여 텍스트를 추출한다."""
    parts = []
    for node in nodes:
        node_type = node.get("type", "")

        if node_type == "text":
            # authorNote 마크가 있으면 제외
            marks = node.get("marks", [])
            if any(m.get("type") == "authorNote" for m in marks):
                continue
            parts.append(node.get("text", ""))

        elif node_type == "paragraph":
            text = _extract_nodes(node.get("content", []))
            if text:
                parts.append(text + "\n\n")

        elif node_type == "heading":
            text = _extract_nodes(node.get("content", []))
            if text:
                parts.append(text + "\n\n")

        elif node_type == "sceneBreak":
            parts.append("* * *\n\n")

        elif node_type == "horizontalRule":
            parts.append("---\n\n")

        elif node_type == "hardBreak":
            parts.append("\n")

        elif node_type == "bulletList":
            for item in node.get("content", []):
                item_text = _extract_nodes(item.get("content", []))
                if item_text.strip():
                    parts.append("- " + item_text.strip() + "\n")
            parts.append("\n")

        elif node_type == "orderedList":
            for idx, item in enumerate(node.get("content", []), 1):
                item_text = _extract_nodes(item.get("content", []))
                if item_text.strip():
                    parts.append(f"{idx}. " + item_text.strip() + "\n")
            parts.append("\n")

        elif node_type == "blockquote":
            inner = _extract_nodes(node.get("content", []))
            for line in inner.strip().split("\n"):
                parts.append("> " + line + "\n")
            parts.append("\n")

        elif node_type == "codeBlock":
            text = _extract_nodes(node.get("content", []))
            parts.append(text + "\n\n")

        elif node_type == "listItem":
            # bulletList/orderedList에서 처리하므로 여기서는 자식만 재귀
            parts.append(_extract_nodes(node.get("content", [])))

        else:
            # 알 수 없는 노드 → 자식이 있으면 재귀
            children = node.get("content", [])
            if children:
                parts.append(_extract_nodes(children))

    return "".join(parts)
```

### 5.4 설계 원칙

- **안전한 폴백**: JSON 파싱 실패 시 입력을 그대로 반환 (이미 plain text이거나 레거시 데이터)
- **authorNote 제외**: 작가의 개인 메모는 AI 분석 대상이 아님
- **구조 보존**: 단락(`\n\n`), 장면 전환(`* * *`), 목록(`- `), 인용(`> `) 등의 구조적 의미를 텍스트에 반영
- **마크 무시**: bold, italic 등 스타일 마크는 텍스트 내용에 영향 없으므로 무시
- **멱등성**: 이미 plain text인 입력에 대해 변환 없이 그대로 반환

---

## 6. 적용 위치

### 6.1 AI 파이프라인 (청킹/임베딩/요약)

| 파일 | 라인 | 현재 코드 | 변경 후 |
|------|------|----------|---------|
| `ai/app/tasks/chunk_and_embed.py` | 21 | `chunk_text(content)` | `chunk_text(extract_plain_text(content))` |
| `ai/app/tasks/generate_summary.py` | 38 | `f"...{content}"` | `f"...{extract_plain_text(content)}"` |

### 6.2 RAG 컨텍스트 조립

| 파일 | 함수 | 라인 | 변경 |
|------|------|------|------|
| `ai/app/services/rag.py` | `_fetch_recent_raw()` | 207-210 | `extract_plain_text(row[2])` |
| `ai/app/services/rag.py` | `_fetch_characters()` | 106 | `extract_plain_text(row[4])[:200]` |
| `ai/app/services/rag.py` | `_fetch_world_notes()` | 125 | `extract_plain_text(row[4])[:300]` |
| `ai/app/services/rag.py` | `_fetch_foreshadows()` | 145 | `extract_plain_text(row[4])[:200]` |

### 6.3 MCP 도구

| 파일 | 라인 | 변경 |
|------|------|------|
| `ai/app/mcp/tools/character.py` | 50 | `extract_plain_text(row[7])` |
| `ai/app/mcp/tools/world_note.py` | 43 | `extract_plain_text(row[5])` |
| 기타 MCP 도구 (episode, plan, plot) | content 반환 부분 | 동일 패턴 적용 |

### 6.4 적용 순서

```
1. text_extractor.py 모듈 생성 + 단위 테스트
2. chunk_and_embed.py 적용 (임베딩 품질 즉시 개선)
3. generate_summary.py 적용 (요약 품질 개선)
4. rag.py 전체 적용 (RAG 컨텍스트 정화)
5. MCP 도구 적용 (외부 클라이언트 응답 정화)
```

---

## 7. 검증 방법

### 7.1 단위 테스트

```python
# ai/tests/test_text_extractor.py

def test_null_input():
    assert extract_plain_text(None) == ""

def test_empty_string():
    assert extract_plain_text("") == ""

def test_plain_text_passthrough():
    assert extract_plain_text("이미 일반 텍스트") == "이미 일반 텍스트"

def test_invalid_json():
    assert extract_plain_text("{invalid json") == "{invalid json"

def test_basic_paragraph():
    doc = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"안녕하세요"}]}]}'
    assert extract_plain_text(doc) == "안녕하세요"

def test_heading():
    doc = '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"제목"}]}]}'
    assert extract_plain_text(doc) == "제목"

def test_bold_marks_ignored():
    doc = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"굵은 텍스트"}]}]}'
    assert extract_plain_text(doc) == "굵은 텍스트"

def test_author_note_excluded():
    doc = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"본문"},{"type":"text","marks":[{"type":"authorNote"}],"text":"작가 메모"}]}]}'
    assert extract_plain_text(doc) == "본문"

def test_scene_break():
    doc = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"전"}]},{"type":"sceneBreak"},{"type":"paragraph","content":[{"type":"text","text":"후"}]}]}'
    result = extract_plain_text(doc)
    assert "* * *" in result
    assert "전" in result
    assert "후" in result

def test_bullet_list():
    doc = '{"type":"doc","content":[{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"항목1"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"항목2"}]}]}]}]}'
    result = extract_plain_text(doc)
    assert "- 항목1" in result
    assert "- 항목2" in result

def test_blockquote():
    doc = '{"type":"doc","content":[{"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"인용문"}]}]}]}'
    result = extract_plain_text(doc)
    assert "> 인용문" in result
```

### 7.2 토큰 절감 검증

```python
import tiktoken

def compare_tokens(raw_json: str, plain_text: str):
    enc = tiktoken.encoding_for_model("gpt-4o")
    json_tokens = len(enc.encode(raw_json))
    text_tokens = len(enc.encode(plain_text))
    savings = (1 - text_tokens / json_tokens) * 100
    print(f"JSON: {json_tokens} tokens → Plain: {text_tokens} tokens ({savings:.0f}% 절감)")
```

예상 절감률: **60~85%** (문서 길이와 구조 복잡도에 따라 차이)

### 7.3 E2E 파이프라인 테스트

1. 기존 DB에 저장된 TipTap JSON 샘플을 추출
2. `extract_plain_text()` 적용 전/후 비교
3. chunker에 변환된 텍스트 입력 → 정상적으로 단락 분할되는지 확인
4. 변환 후 LLM 요약 품질 비교 (동일 프롬프트, JSON vs plain text)

### 7.4 회귀 테스트

- `content`가 NULL인 레코드 → 빈 문자열 반환 확인
- `content`가 이미 plain text인 레거시 레코드 → 그대로 반환 확인
- 매우 큰 문서(50K+ chars) → 성능 문제 없는지 확인
- 빈 `{"type":"doc","content":[]}` → 빈 문자열 반환 확인
