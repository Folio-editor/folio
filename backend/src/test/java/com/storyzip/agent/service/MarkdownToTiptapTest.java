package com.storyzip.agent.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * MarkdownToTiptap 단위 테스트.
 *
 * 검증 포인트:
 *  1. 빈 입력 / null → 빈 paragraph doc (구 wrapPlainTextAsTiptapDoc 동등)
 *  2. plain text → paragraph 트리 (markdown 문법 없음)
 *  3. heading / bold / italic / strike / inline code 정상 매핑
 *  4. bulletList / orderedList / blockquote / codeBlock / horizontalRule
 *  5. softLineBreak 흡수, hardBreak 보존
 *  6. 미지원 (link/image/html) 안전 처리 — throw X, 텍스트만 보존
 *  7. idempotent — 이미 TipTap doc JSON 입력은 그대로 통과
 *  8. fallback — 변환기 어떤 케이스에서도 throw 안 함
 *  9. 인접 동일 mark text 노드 병합
 */
class MarkdownToTiptapTest {

    private static final ObjectMapper M = new ObjectMapper();

    private JsonNode parse(String s) throws Exception {
        return M.readTree(s);
    }

    @Test
    void nullInput_returnsEmptyDoc() throws Exception {
        JsonNode n = parse(MarkdownToTiptap.toDocJson(null));
        assertEquals("doc", n.path("type").asText());
        assertEquals(1, n.path("content").size());
        assertEquals("paragraph", n.path("content").get(0).path("type").asText());
    }

    @Test
    void emptyInput_returnsEmptyDoc() throws Exception {
        JsonNode n = parse(MarkdownToTiptap.toDocJson(""));
        assertEquals("doc", n.path("type").asText());
        assertEquals(1, n.path("content").size());
    }

    @Test
    void plainText_returnsSingleParagraph() throws Exception {
        JsonNode n = parse(MarkdownToTiptap.toDocJson("간단한 한 줄 텍스트입니다."));
        JsonNode content = n.path("content");
        assertEquals(1, content.size());
        JsonNode p = content.get(0);
        assertEquals("paragraph", p.path("type").asText());
        assertEquals("간단한 한 줄 텍스트입니다.", p.path("content").get(0).path("text").asText());
    }

    @Test
    void plainText_blankLineSeparatedParagraphs() throws Exception {
        JsonNode n = parse(MarkdownToTiptap.toDocJson("첫 단락.\n\n두 번째 단락."));
        JsonNode content = n.path("content");
        assertEquals(2, content.size());
        assertEquals("첫 단락.", content.get(0).path("content").get(0).path("text").asText());
        assertEquals("두 번째 단락.", content.get(1).path("content").get(0).path("text").asText());
    }

    @Test
    void heading_levels() throws Exception {
        JsonNode n = parse(MarkdownToTiptap.toDocJson("# 큰 제목\n\n## 소제목\n\n### 항목"));
        assertEquals(3, n.path("content").size());
        assertEquals("heading", n.path("content").get(0).path("type").asText());
        assertEquals(1, n.path("content").get(0).path("attrs").path("level").asInt());
        assertEquals(2, n.path("content").get(1).path("attrs").path("level").asInt());
        assertEquals(3, n.path("content").get(2).path("attrs").path("level").asInt());
    }

    @Test
    void bold_italic_strike_marks() throws Exception {
        JsonNode n = parse(MarkdownToTiptap.toDocJson("**굵게** 와 *기울임* 그리고 ~~취소선~~"));
        JsonNode runs = n.path("content").get(0).path("content");
        // 첫 run: 굵게 → bold mark
        boolean foundBold = false, foundItalic = false, foundStrike = false;
        for (JsonNode r : runs) {
            JsonNode marks = r.path("marks");
            for (JsonNode m : marks) {
                String t = m.path("type").asText();
                if ("bold".equals(t) && "굵게".equals(r.path("text").asText())) foundBold = true;
                if ("italic".equals(t) && "기울임".equals(r.path("text").asText())) foundItalic = true;
                if ("strike".equals(t) && "취소선".equals(r.path("text").asText())) foundStrike = true;
            }
        }
        assertTrue(foundBold, "bold mark 누락");
        assertTrue(foundItalic, "italic mark 누락");
        assertTrue(foundStrike, "strike mark 누락");
    }

    @Test
    void inlineCode_mark() throws Exception {
        JsonNode n = parse(MarkdownToTiptap.toDocJson("앞 `코드` 뒤"));
        JsonNode runs = n.path("content").get(0).path("content");
        boolean foundCode = false;
        for (JsonNode r : runs) {
            for (JsonNode m : r.path("marks")) {
                if ("code".equals(m.path("type").asText())) {
                    assertEquals("코드", r.path("text").asText());
                    foundCode = true;
                }
            }
        }
        assertTrue(foundCode);
    }

    @Test
    void bulletList_andOrderedList() throws Exception {
        JsonNode n = parse(MarkdownToTiptap.toDocJson("- A\n- B\n\n1. 첫\n2. 둘"));
        assertEquals(2, n.path("content").size());
        JsonNode bullet = n.path("content").get(0);
        assertEquals("bulletList", bullet.path("type").asText());
        assertEquals(2, bullet.path("content").size());
        assertEquals("listItem", bullet.path("content").get(0).path("type").asText());
        assertEquals("paragraph", bullet.path("content").get(0).path("content").get(0).path("type").asText());
        assertEquals("A", bullet.path("content").get(0).path("content").get(0).path("content").get(0).path("text").asText());

        JsonNode ordered = n.path("content").get(1);
        assertEquals("orderedList", ordered.path("type").asText());
        assertEquals(2, ordered.path("content").size());
    }

    @Test
    void blockquote_wrapsParagraphs() throws Exception {
        JsonNode n = parse(MarkdownToTiptap.toDocJson("> 인용 한 줄"));
        JsonNode bq = n.path("content").get(0);
        assertEquals("blockquote", bq.path("type").asText());
        assertEquals("paragraph", bq.path("content").get(0).path("type").asText());
        assertEquals("인용 한 줄", bq.path("content").get(0).path("content").get(0).path("text").asText());
    }

    @Test
    void fencedCodeBlock_withLanguage() throws Exception {
        JsonNode n = parse(MarkdownToTiptap.toDocJson("```java\nint x = 1;\n```"));
        JsonNode cb = n.path("content").get(0);
        assertEquals("codeBlock", cb.path("type").asText());
        assertEquals("java", cb.path("attrs").path("language").asText());
        assertEquals("int x = 1;", cb.path("content").get(0).path("text").asText());
    }

    @Test
    void thematicBreak_horizontalRule() throws Exception {
        JsonNode n = parse(MarkdownToTiptap.toDocJson("위\n\n---\n\n아래"));
        boolean foundHr = false;
        for (JsonNode b : n.path("content")) {
            if ("horizontalRule".equals(b.path("type").asText())) foundHr = true;
        }
        assertTrue(foundHr);
    }

    @Test
    void hardBreak_preserved_softBreak_collapsed() throws Exception {
        // 줄 끝 공백 2개 → hard break, 일반 \n → soft break
        JsonNode n = parse(MarkdownToTiptap.toDocJson("앞  \n뒤\n같은 단락"));
        JsonNode runs = n.path("content").get(0).path("content");
        boolean foundHardBreak = false;
        for (JsonNode r : runs) {
            if ("hardBreak".equals(r.path("type").asText())) foundHardBreak = true;
        }
        assertTrue(foundHardBreak, "hardBreak 누락");
    }

    @Test
    void link_extensionMissing_textPreserved() throws Exception {
        // Link extension 미설치 — 텍스트만 보존, mark 부여 X.
        JsonNode n = parse(MarkdownToTiptap.toDocJson("[클릭](https://example.com)"));
        JsonNode runs = n.path("content").get(0).path("content");
        // text "클릭" 이 보존되어야 하고, marks 에 link 가 없어야 함 (Link 미지원)
        boolean foundClick = false;
        for (JsonNode r : runs) {
            if ("클릭".equals(r.path("text").asText())) {
                foundClick = true;
                for (JsonNode m : r.path("marks")) {
                    assertNotEquals("link", m.path("type").asText(), "link mark 가 들어가면 안 됨");
                }
            }
        }
        assertTrue(foundClick);
    }

    @Test
    void image_altTextPreserved() throws Exception {
        JsonNode n = parse(MarkdownToTiptap.toDocJson("![설명문구](http://x/y.png)"));
        // 결과 doc 안 어딘가에 '설명문구' 텍스트가 있어야 함
        String json = MarkdownToTiptap.toDocJson("![설명문구](http://x/y.png)");
        assertTrue(json.contains("설명문구"));
        assertNotNull(n);
    }

    @Test
    void idempotent_existingTiptapDoc_passThrough() {
        String input = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"existing\"}]}]}";
        String out = MarkdownToTiptap.toDocJson(input);
        assertEquals(input, out, "이미 TipTap doc JSON 이면 그대로 통과해야 함");
    }

    @Test
    void neverThrows_onWeirdInput() {
        // 다양한 깨진 입력으로도 throw 하지 않는다.
        String[] inputs = {
                "###### h6 max",
                "******",
                "```\nunclosed",
                "> > nested quote\n> still",
                "- - - - -",
                "<script>alert(1)</script>",
                "1234567890\n".repeat(100),
                "\n\n\n\n",
                "**[**미완료**](url)**",
        };
        for (String in : inputs) {
            String out = assertDoesNotThrow(() -> MarkdownToTiptap.toDocJson(in));
            assertNotNull(out);
            assertTrue(out.startsWith("{\"type\":\"doc\""));
        }
    }

    @Test
    void singleStrongSpan_emitsSingleRun() throws Exception {
        // 같은 mark 범위 안의 연속 텍스트는 한 text 노드로. (commonmark 의 단일 Strong
        // 안에서 텍스트가 쪼개지지 않도록 하는 visitor 안정성 검증.)
        JsonNode n = parse(MarkdownToTiptap.toDocJson("**ABC DEF**"));
        JsonNode runs = n.path("content").get(0).path("content");
        assertEquals(1, runs.size(), "단일 Strong 안의 연속 텍스트는 단일 run 이어야 함");
        assertEquals("ABC DEF", runs.get(0).path("text").asText());
        assertEquals("bold", runs.get(0).path("marks").get(0).path("type").asText());
    }

    @Test
    void htmlBlock_preservedAsParagraph() throws Exception {
        // HTML block 은 평문으로 보존 (위지윅 schema 외 노드 차단).
        JsonNode n = parse(MarkdownToTiptap.toDocJson("<div>raw</div>"));
        // 어떤 형태로든 throw 없이 doc 으로 감싸짐
        assertEquals("doc", n.path("type").asText());
        assertFalse(n.path("content").isEmpty());
    }

    @Test
    void roundTrip_compatibleWithFrontendParse() throws Exception {
        // 프론트가 JSON.parse 후 TipTap.setContent 로 복원 가능한지 — 표준 JSON 파싱 검증.
        String md = "# 제목\n\n- 항목 **굵게**\n- 항목 *기울임*\n\n> 인용\n\n```\ncode\n```";
        String json = MarkdownToTiptap.toDocJson(md);
        JsonNode n = parse(json);
        assertEquals("doc", n.path("type").asText());
        assertTrue(n.has("content"));
        // doc 직속 자식들 type 화이트리스트
        for (JsonNode c : n.path("content")) {
            String t = c.path("type").asText();
            assertTrue(
                    t.equals("paragraph") || t.equals("heading") || t.equals("bulletList")
                            || t.equals("orderedList") || t.equals("blockquote")
                            || t.equals("codeBlock") || t.equals("horizontalRule"),
                    "unexpected top-level node: " + t);
        }
    }
}
