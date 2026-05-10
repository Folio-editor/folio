package com.storyzip.agent.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.commonmark.ext.gfm.strikethrough.Strikethrough;
import org.commonmark.ext.gfm.strikethrough.StrikethroughExtension;
import org.commonmark.node.*;
import org.commonmark.parser.Parser;

import java.util.List;

/**
 * Agent propose_* 도구가 보낸 Markdown(또는 plain text) 본문을 위지윅 에디터(TipTap)
 * doc JSON 으로 변환한다.
 *
 * <p>지원 매핑 (StarterKit + 프론트 확장 설정 기준):
 * <ul>
 *   <li>Heading 1~6 → {type:heading, attrs.level}</li>
 *   <li>Paragraph → {type:paragraph}</li>
 *   <li>BulletList / OrderedList → {type:bulletList | orderedList} + listItem(paragraph(...))</li>
 *   <li>BlockQuote → {type:blockquote}</li>
 *   <li>FencedCodeBlock / IndentedCodeBlock → {type:codeBlock, attrs.language}</li>
 *   <li>ThematicBreak (---) → {type:horizontalRule}</li>
 *   <li>HardLineBreak → {type:hardBreak}</li>
 *   <li>SoftLineBreak → 단락 내부 공백 (위지윅 관행)</li>
 *   <li>Strong (**) → bold mark</li>
 *   <li>Emphasis (*) → italic mark</li>
 *   <li>Code (`...`) → code mark (인라인)</li>
 *   <li>Link → 텍스트만 보존 (Link extension 미설치 — mark 부여 시 무시되어 경고만)</li>
 *   <li>Image → alt 텍스트만 보존 (Image extension 미설치)</li>
 *   <li>HtmlInline / HtmlBlock → text 로 escape 보존 (실수 방지)</li>
 * </ul>
 *
 * <p>안전 장치:
 * <ul>
 *   <li>입력이 이미 TipTap doc JSON (`{"type":"doc",...}`) 이면 검증 후 그대로 통과</li>
 *   <li>본문이 비면 빈 paragraph 1개 doc 반환 (구 wrapPlainTextAsTiptapDoc 동등)</li>
 *   <li>commonmark 파서 실패 / 알 수 없는 노드 → plain text fallback (절대 throw 안 함)</li>
 * </ul>
 *
 * <p>암호화 호환: 본 변환기는 평문 JSON string 만 생산. AesGcmCipher.encryptString
 * 은 UTF-8 byte 단위로 동작하므로 변환 결과를 그대로 v1: 암호문으로 처리 가능.
 * 프론트는 v1: 복호화 후 JSON.parse → TipTap.setContent 로 동일 노드 트리 복원.
 */
@Slf4j
public final class MarkdownToTiptap {

    private static final ObjectMapper M = new ObjectMapper();
    private static final Parser PARSER = Parser.builder()
            .extensions(List.of(StrikethroughExtension.create()))
            .build();

    private MarkdownToTiptap() {}

    /**
     * 입력 텍스트를 TipTap doc JSON 문자열로 변환.
     *
     * @param input null/empty 허용 — 빈 paragraph doc 반환
     * @return 항상 non-null. 최악의 경우 {"type":"doc","content":[{"type":"paragraph"}]}
     */
    public static String toDocJson(String input) {
        if (input == null || input.isEmpty()) {
            return emptyDoc();
        }
        // 안전 장치 1: 이미 TipTap doc JSON 으로 보이는 입력은 검증 후 통과.
        String trimmed = input.stripLeading();
        if (trimmed.startsWith("{") && trimmed.contains("\"type\"") && trimmed.contains("\"doc\"")) {
            try {
                ObjectNode parsed = (ObjectNode) M.readTree(input);
                if ("doc".equals(parsed.path("type").asText())) {
                    return input;
                }
            } catch (Exception ignored) {
                // 파싱 실패면 markdown 으로 처리 진행
            }
        }
        try {
            Node root = PARSER.parse(input);
            ObjectNode doc = M.createObjectNode();
            doc.put("type", "doc");
            ArrayNode content = doc.putArray("content");
            visitBlocks(root, content);
            if (content.isEmpty()) {
                content.add(emptyParagraph());
            }
            return M.writeValueAsString(doc);
        } catch (Exception e) {
            log.warn("[md->tiptap] 변환 실패 — plain text fallback. msg={}", e.getMessage());
            return plainFallback(input);
        }
    }

    // ── 블록 방문 ─────────────────────────────────────────────────

    private static void visitBlocks(Node parent, ArrayNode out) {
        for (Node n = parent.getFirstChild(); n != null; n = n.getNext()) {
            ObjectNode block = blockToNode(n);
            if (block != null) out.add(block);
        }
    }

    private static ObjectNode blockToNode(Node n) {
        if (n instanceof Heading h) {
            ObjectNode node = M.createObjectNode();
            node.put("type", "heading");
            int level = Math.max(1, Math.min(6, h.getLevel()));
            node.putObject("attrs").put("level", level);
            ArrayNode inlines = node.putArray("content");
            visitInlines(h, inlines);
            return node;
        }
        if (n instanceof Paragraph) {
            ObjectNode node = M.createObjectNode();
            node.put("type", "paragraph");
            ArrayNode inlines = M.createArrayNode();
            visitInlines(n, inlines);
            if (!inlines.isEmpty()) node.set("content", inlines);
            return node;
        }
        if (n instanceof BulletList bl) {
            ObjectNode node = M.createObjectNode();
            node.put("type", "bulletList");
            ArrayNode items = node.putArray("content");
            for (Node li = bl.getFirstChild(); li != null; li = li.getNext()) {
                items.add(listItem(li));
            }
            return node;
        }
        if (n instanceof OrderedList ol) {
            ObjectNode node = M.createObjectNode();
            node.put("type", "orderedList");
            int start = ol.getMarkerStartNumber();
            if (start != 1) {
                node.putObject("attrs").put("start", start);
            }
            ArrayNode items = node.putArray("content");
            for (Node li = ol.getFirstChild(); li != null; li = li.getNext()) {
                items.add(listItem(li));
            }
            return node;
        }
        if (n instanceof BlockQuote) {
            ObjectNode node = M.createObjectNode();
            node.put("type", "blockquote");
            ArrayNode inner = node.putArray("content");
            visitBlocks(n, inner);
            if (inner.isEmpty()) inner.add(emptyParagraph());
            return node;
        }
        if (n instanceof FencedCodeBlock fb) {
            return codeBlock(fb.getLiteral(), fb.getInfo());
        }
        if (n instanceof IndentedCodeBlock ib) {
            return codeBlock(ib.getLiteral(), null);
        }
        if (n instanceof ThematicBreak) {
            ObjectNode node = M.createObjectNode();
            node.put("type", "horizontalRule");
            return node;
        }
        if (n instanceof HtmlBlock hb) {
            // HTML block 은 위지윅 호환 보장 X — 평문 paragraph 로 보존.
            return paragraphOfPlain(hb.getLiteral());
        }
        // 알 수 없는 블록은 자식 평문 추출하여 paragraph 로
        String plain = extractPlain(n);
        if (plain.isEmpty()) return null;
        return paragraphOfPlain(plain);
    }

    private static ObjectNode listItem(Node li) {
        ObjectNode item = M.createObjectNode();
        item.put("type", "listItem");
        ArrayNode children = item.putArray("content");
        for (Node child = li.getFirstChild(); child != null; child = child.getNext()) {
            ObjectNode block = blockToNode(child);
            if (block != null) children.add(block);
        }
        if (children.isEmpty()) children.add(emptyParagraph());
        return item;
    }

    private static ObjectNode codeBlock(String literal, String info) {
        ObjectNode node = M.createObjectNode();
        node.put("type", "codeBlock");
        if (info != null && !info.isBlank()) {
            node.putObject("attrs").put("language", info.trim());
        }
        String text = literal == null ? "" : literal;
        // CommonMark 는 fenced code 끝에 \n 을 포함시키는 경우가 있어 trim
        if (text.endsWith("\n")) text = text.substring(0, text.length() - 1);
        if (!text.isEmpty()) {
            ArrayNode content = node.putArray("content");
            content.add(textNode(text, 0));
        }
        return node;
    }

    // ── 인라인 방문 ───────────────────────────────────────────────

    /** mark bitmask: 0 = none, 1=bold, 2=italic, 4=strike, 8=code. */
    private static final int M_BOLD = 1, M_ITALIC = 2, M_STRIKE = 4, M_CODE = 8;

    private static void visitInlines(Node parent, ArrayNode out) {
        visitInlines(parent, out, 0);
    }

    private static void visitInlines(Node parent, ArrayNode out, int marks) {
        for (Node n = parent.getFirstChild(); n != null; n = n.getNext()) {
            inlineToNodes(n, out, marks);
        }
    }

    private static void inlineToNodes(Node n, ArrayNode out, int marks) {
        if (n instanceof Text t) {
            appendText(out, t.getLiteral(), marks);
        } else if (n instanceof StrongEmphasis) {
            visitInlines(n, out, marks | M_BOLD);
        } else if (n instanceof Emphasis) {
            visitInlines(n, out, marks | M_ITALIC);
        } else if (n instanceof Code c) {
            appendText(out, c.getLiteral(), marks | M_CODE);
        } else if (n instanceof Strikethrough) {
            visitInlines(n, out, marks | M_STRIKE);
        } else if (n instanceof HardLineBreak) {
            ObjectNode br = M.createObjectNode();
            br.put("type", "hardBreak");
            out.add(br);
        } else if (n instanceof SoftLineBreak) {
            // 단락 내부의 줄바꿈은 위지윅 관행상 공백 1칸으로 흡수.
            appendText(out, " ", marks);
        } else if (n instanceof Link link) {
            // Link extension 미설치 — 텍스트만 보존, URL 은 괄호로 부기.
            int childStart = out.size();
            visitInlines(n, out, marks);
            if (out.size() == childStart) {
                appendText(out, link.getDestination(), marks);
            }
        } else if (n instanceof Image img) {
            // Image extension 미설치 — alt(자식 텍스트) 만 보존.
            String alt = extractPlain(img);
            if (!alt.isEmpty()) appendText(out, alt, marks);
        } else if (n instanceof HtmlInline html) {
            appendText(out, html.getLiteral(), marks);
        } else {
            // 알 수 없는 인라인 — 자식 평문만 보존.
            String plain = extractPlain(n);
            if (!plain.isEmpty()) appendText(out, plain, marks);
        }
    }

    private static void appendText(ArrayNode out, String text, int marks) {
        if (text == null || text.isEmpty()) return;
        // 인접 동일-mark text 노드 병합 — 출력 슬림화.
        if (!out.isEmpty()) {
            ObjectNode last = (ObjectNode) out.get(out.size() - 1);
            if ("text".equals(last.path("type").asText()) && marksEqual(last, marks)) {
                last.put("text", last.path("text").asText() + text);
                return;
            }
        }
        out.add(textNode(text, marks));
    }

    private static ObjectNode textNode(String text, int marks) {
        ObjectNode node = M.createObjectNode();
        node.put("type", "text");
        node.put("text", text);
        if (marks != 0) {
            ArrayNode arr = node.putArray("marks");
            if ((marks & M_BOLD) != 0) arr.add(markObj("bold"));
            if ((marks & M_ITALIC) != 0) arr.add(markObj("italic"));
            if ((marks & M_STRIKE) != 0) arr.add(markObj("strike"));
            if ((marks & M_CODE) != 0) arr.add(markObj("code"));
        }
        return node;
    }

    private static ObjectNode markObj(String type) {
        ObjectNode m = M.createObjectNode();
        m.put("type", type);
        return m;
    }

    private static boolean marksEqual(ObjectNode textNode, int marks) {
        ArrayNode arr = (ArrayNode) textNode.get("marks");
        int existing = 0;
        if (arr != null) {
            for (int i = 0; i < arr.size(); i++) {
                String type = arr.get(i).path("type").asText();
                switch (type) {
                    case "bold" -> existing |= M_BOLD;
                    case "italic" -> existing |= M_ITALIC;
                    case "strike" -> existing |= M_STRIKE;
                    case "code" -> existing |= M_CODE;
                    default -> { /* 알 수 없는 mark 는 비교 대상에서 제외 → 병합 차단 */
                        return false;
                    }
                }
            }
        }
        return existing == marks;
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────

    private static String extractPlain(Node node) {
        StringBuilder sb = new StringBuilder();
        node.accept(new AbstractVisitor() {
            @Override
            public void visit(Text text) {
                sb.append(text.getLiteral());
            }

            @Override
            public void visit(Code code) {
                sb.append(code.getLiteral());
            }

            @Override
            public void visit(SoftLineBreak softLineBreak) {
                sb.append(' ');
            }

            @Override
            public void visit(HardLineBreak hardLineBreak) {
                sb.append('\n');
            }
        });
        return sb.toString();
    }

    private static ObjectNode paragraphOfPlain(String plain) {
        ObjectNode p = M.createObjectNode();
        p.put("type", "paragraph");
        if (plain == null || plain.isEmpty()) return p;
        ArrayNode content = p.putArray("content");
        content.add(textNode(plain, 0));
        return p;
    }

    private static ObjectNode emptyParagraph() {
        ObjectNode p = M.createObjectNode();
        p.put("type", "paragraph");
        return p;
    }

    private static String emptyDoc() {
        try {
            ObjectNode doc = M.createObjectNode();
            doc.put("type", "doc");
            doc.putArray("content").add(emptyParagraph());
            return M.writeValueAsString(doc);
        } catch (JsonProcessingException e) {
            // Jackson 직렬화 실패는 사실상 발생 X — 안전망.
            return "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}";
        }
    }

    /** 변환기 내부 예외 시 입력을 단일 paragraph 로만 보존하는 최후의 fallback. */
    private static String plainFallback(String input) {
        try {
            ObjectNode doc = M.createObjectNode();
            doc.put("type", "doc");
            ArrayNode content = doc.putArray("content");
            String[] paragraphs = input.split("\\n{2,}");
            boolean any = false;
            for (String p : paragraphs) {
                String trimmed = p == null ? "" : p.replace("\n", " ").trim();
                if (trimmed.isEmpty()) continue;
                content.add(paragraphOfPlain(trimmed));
                any = true;
            }
            if (!any) content.add(emptyParagraph());
            return M.writeValueAsString(doc);
        } catch (JsonProcessingException e) {
            return emptyDoc();
        }
    }
}
