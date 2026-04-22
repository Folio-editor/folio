import json

from app.services.text_extractor import extract_plain_text


def _doc(*nodes):
    return json.dumps({"type": "doc", "content": list(nodes)}, ensure_ascii=False)


def _para(*children):
    return {"type": "paragraph", "content": list(children)}


def _text(text, marks=None):
    node = {"type": "text", "text": text}
    if marks:
        node["marks"] = [{"type": m} for m in marks]
    return node


def test_none_returns_empty_string():
    assert extract_plain_text(None) == ""


def test_empty_string_returns_empty_string():
    assert extract_plain_text("") == ""


def test_plain_text_passthrough_when_not_json():
    assert extract_plain_text("이미 일반 텍스트") == "이미 일반 텍스트"


def test_malformed_json_passthrough():
    assert extract_plain_text("{not valid json") == "{not valid json"


def test_json_but_not_tiptap_doc_passthrough():
    raw = json.dumps({"type": "other", "value": 1})
    assert extract_plain_text(raw) == raw


def test_empty_doc_returns_empty_string():
    assert extract_plain_text(_doc()) == ""


def test_basic_paragraph():
    raw = _doc(_para(_text("안녕하세요")))
    assert extract_plain_text(raw) == "안녕하세요"


def test_heading_is_extracted():
    raw = _doc({"type": "heading", "attrs": {"level": 1}, "content": [_text("제목")]})
    assert extract_plain_text(raw) == "제목"


def test_bold_mark_content_preserved():
    raw = _doc(_para(_text("굵은", marks=["bold"])))
    assert extract_plain_text(raw) == "굵은"


def test_author_note_excluded():
    raw = _doc(_para(_text("본문"), _text("작가메모", marks=["authorNote"])))
    assert extract_plain_text(raw) == "본문"


def test_author_note_only_paragraph_is_empty():
    raw = _doc(_para(_text("메모", marks=["authorNote"])))
    assert extract_plain_text(raw) == ""


def test_multiple_paragraphs_separated_by_blank_line():
    raw = _doc(_para(_text("첫 단락")), _para(_text("둘째 단락")))
    result = extract_plain_text(raw)
    assert "첫 단락" in result
    assert "둘째 단락" in result
    assert "\n\n" in result


def test_scene_break_rendered_as_markers():
    raw = _doc(_para(_text("전")), {"type": "sceneBreak"}, _para(_text("후")))
    result = extract_plain_text(raw)
    assert "* * *" in result
    assert "전" in result
    assert "후" in result
    assert result.index("전") < result.index("* * *") < result.index("후")


def test_bullet_list():
    raw = _doc({
        "type": "bulletList",
        "content": [
            {"type": "listItem", "content": [_para(_text("항목1"))]},
            {"type": "listItem", "content": [_para(_text("항목2"))]},
        ],
    })
    result = extract_plain_text(raw)
    assert "- 항목1" in result
    assert "- 항목2" in result


def test_ordered_list_numbered():
    raw = _doc({
        "type": "orderedList",
        "content": [
            {"type": "listItem", "content": [_para(_text("첫째"))]},
            {"type": "listItem", "content": [_para(_text("둘째"))]},
        ],
    })
    result = extract_plain_text(raw)
    assert "1. 첫째" in result
    assert "2. 둘째" in result


def test_blockquote():
    raw = _doc({
        "type": "blockquote",
        "content": [_para(_text("인용문"))],
    })
    result = extract_plain_text(raw)
    assert "> 인용문" in result


def test_horizontal_rule_rendered():
    raw = _doc(_para(_text("위")), {"type": "horizontalRule"}, _para(_text("아래")))
    result = extract_plain_text(raw)
    assert "---" in result


def test_mixed_marks_and_text_segments():
    raw = _doc(_para(
        _text("그는 "),
        _text("조용히", marks=["bold"]),
        _text(" 문을 열었다."),
    ))
    assert extract_plain_text(raw) == "그는 조용히 문을 열었다."


def test_idempotent_on_plain_text():
    once = extract_plain_text(_doc(_para(_text("테스트"))))
    twice = extract_plain_text(once)
    assert once == twice == "테스트"
