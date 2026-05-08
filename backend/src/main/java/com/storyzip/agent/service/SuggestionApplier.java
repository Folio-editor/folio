package com.storyzip.agent.service;

import com.storyzip.security.AesGcmCipher;
import com.storyzip.security.WorkKeyService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;
import java.util.Map;
import java.util.UUID;

/**
 * 작가가 [승인] 누른 extraction_suggestion 을 실제 entity 로 INSERT/UPDATE.
 *
 * <p>흐름:
 * <ol>
 *   <li>WorkKeyService.resolveWorkKey(work_id) — Vault Transit 으로 work_key 평문 획득</li>
 *   <li>AesGcmCipher.encryptString — 평문 필드를 v1: 암호문으로 변환</li>
 *   <li>JdbcTemplate.update — 대상 테이블 INSERT/UPDATE</li>
 *   <li>workKey 즉시 zero-fill</li>
 * </ol>
 *
 * <p>PowerSync 호환성: 백엔드 INSERT → WAL → publication → 모든 client SQLite sync down.
 * 사용자가 직접 작성한 row 와 완전 동일 포맷 (v1: AES-GCM-256).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SuggestionApplier {

    private final JdbcTemplate jdbc;
    private final WorkKeyService workKeyService;

    /**
     * 승인된 suggestion 을 실제 테이블에 적용. 반환: 생성/갱신된 row 의 id (있으면).
     */
    public UUID apply(UUID workId, UUID writerId, String entityType, Map<String, Object> payload) {
        byte[] workKey = workKeyService.resolveWorkKey(workId);
        if (workKey == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "server_encrypted_dek 미발급 — 작가 측 work_key 발급 후 승인해주세요");
        }
        try {
            return switch (entityType) {
                case "character"          -> insertCharacter(workId, writerId, payload, workKey);
                case "character_update"   -> applyCharacterUpdate(workId, writerId, payload, workKey);
                case "character_delete"   -> deleteCharacter(workId, writerId, payload);
                case "world_note"         -> insertWorldNote(workId, writerId, payload, workKey);
                case "world_note_update"  -> applyWorldNoteUpdate(workId, writerId, payload, workKey);
                case "world_note_delete"  -> deleteWorldNote(workId, writerId, payload);
                case "plot_create"        -> insertPlot(workId, writerId, payload, workKey);
                case "plot_tree"          -> insertPlotTree(workId, writerId, payload, workKey);
                case "plot_revision"      -> applyPlotRevision(workId, writerId, payload, workKey);
                case "plot_delete"        -> deletePlot(workId, writerId, payload);
                case "episode_draft"      -> insertEpisodeDraft(workId, writerId, payload, workKey);
                case "episode_update"     -> applyEpisodeUpdate(workId, writerId, payload, workKey);
                case "episode_delete"     -> deleteEpisode(workId, writerId, payload);
                default -> {
                    log.warn("[SUGGESTION-APPLY] unknown entity_type={}", entityType);
                    yield null;
                }
            };
        } finally {
            Arrays.fill(workKey, (byte) 0);
        }
    }

    // ─────── character ───────

    private UUID insertCharacter(UUID workId, UUID writerId, Map<String, Object> p, byte[] workKey) {
        UUID id = UUID.randomUUID();
        String name = encStr(workKey, asString(p.get("name")));
        String gender = asString(p.get("gender"));
        String age = asString(p.get("age"));
        if (name == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "character.name required");
        }
        // sort_order 는 마지막 + 1
        int sortOrder = nextSortOrder("character", workId);
        jdbc.update(
                "INSERT INTO character (id, work_id, writer_id, name, gender, age, sort_order, created_at, updated_at) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?, now(), now())",
                id, workId, writerId, name,
                gender != null ? gender : "미정",
                age != null ? age : "미정",
                sortOrder
        );
        // appearance / personality / notes 는 character_note 로 저장 (각 kind 별)
        insertCharacterNoteIfPresent(id, writerId, workKey, "appearance", p.get("appearance"));
        insertCharacterNoteIfPresent(id, writerId, workKey, "personality", p.get("personality"));
        insertCharacterNoteIfPresent(id, writerId, workKey, "custom", p.get("notes"));
        log.info("[SUGGESTION-APPLY] character INSERT id={} work={}", id, workId);
        return id;
    }

    private void insertCharacterNoteIfPresent(
            UUID charId, UUID writerId, byte[] workKey, String kind, Object value
    ) {
        String plain = asString(value);
        if (plain == null || plain.isBlank()) return;
        UUID nid = UUID.randomUUID();
        String title = kind;     // 평문 라벨
        String content = encRichText(workKey, plain);   // tiptap JSON 으로 래핑 후 암호화
        jdbc.update(
                "INSERT INTO character_note (id, character_id, writer_id, kind, title, content, sort_order, created_at, updated_at) " +
                        "VALUES (?, ?, ?, ?, ?, ?, 0, now(), now())",
                nid, charId, writerId, kind, title, content
        );
    }

    // ─────── world_note ───────

    private UUID insertWorldNote(UUID workId, UUID writerId, Map<String, Object> p, byte[] workKey) {
        UUID id = UUID.randomUUID();
        String name = encStr(workKey, asString(p.get("name")));
        String content = encRichText(workKey, asString(p.get("content")));
        if (name == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "world_note.name required");
        }
        int sortOrder = nextSortOrder("world_note", workId);
        jdbc.update(
                "INSERT INTO world_note (id, work_id, writer_id, name, content, sort_order, created_at, updated_at) " +
                        "VALUES (?, ?, ?, ?, ?, ?, now(), now())",
                id, workId, writerId, name, content, sortOrder
        );
        log.info("[SUGGESTION-APPLY] world_note INSERT id={} work={}", id, workId);
        return id;
    }

    // ─────── episode_draft ───────

    private UUID insertEpisodeDraft(UUID workId, UUID writerId, Map<String, Object> p, byte[] workKey) {
        UUID id = UUID.randomUUID();
        String title = encStr(workKey, asString(p.get("title")));
        String content = encRichText(workKey, asString(p.get("content")));
        if (title == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "episode.title required");
        }
        int sortOrder = nextSortOrder("episode", workId);
        UUID parentId = parseUuid(p.get("parent_id"));
        // word_count 는 평문 length (UTF-16 단순 추정)
        int wordCount = asString(p.get("content")) != null ? asString(p.get("content")).length() : 0;
        jdbc.update(
                "INSERT INTO episode (id, work_id, writer_id, parent_id, title, content, status, word_count, sort_order, created_at, updated_at) " +
                        "VALUES (?, ?, ?, ?, ?, ?, '작성중', ?, ?, now(), now())",
                id, workId, writerId, parentId, title, content, wordCount, sortOrder
        );
        log.info("[SUGGESTION-APPLY] episode INSERT id={} work={} parent={} status=작성중", id, workId, parentId);
        return id;
    }

    // ─────── character_update ───────

    private UUID applyCharacterUpdate(UUID workId, UUID writerId, Map<String, Object> p, byte[] workKey) {
        UUID charId = parseUuid(p.get("character_id"));
        if (charId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "character_id required");
        }
        // ownership 검증
        Integer match = jdbc.queryForObject(
                "SELECT count(*) FROM character WHERE id = ? AND work_id = ? AND writer_id = ?",
                Integer.class, charId, workId, writerId
        );
        if (match == null || match == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "character not found in work");
        }
        String field = asString(p.get("field"));
        String newValue = asString(p.get("new_value"));
        if (field == null || newValue == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "field/new_value required");
        }
        // character 테이블 직접 컬럼:
        //   - name : 암호화 v1: 컬럼
        //   - gender / age : 평문 컬럼
        // 그 외 (appearance/personality/mbti 등) : character_note kind=field 추가
        if ("name".equals(field)) {
            jdbc.update(
                    "UPDATE character SET name = ?, updated_at = now() WHERE id = ?",
                    encStr(workKey, newValue), charId
            );
            log.info("[SUGGESTION-APPLY] character.name (encrypted) UPDATE id={}", charId);
            return charId;
        }
        if ("gender".equals(field) || "age".equals(field)) {
            jdbc.update(
                    "UPDATE character SET " + field + " = ?, updated_at = now() WHERE id = ?",
                    newValue, charId
            );
            log.info("[SUGGESTION-APPLY] character.{}={} id={}", field, newValue, charId);
            return charId;
        }
        // 그 외 field 는 character_note kind=field 로 추가 (tiptap JSON 래핑)
        UUID nid = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO character_note (id, character_id, writer_id, kind, title, content, sort_order, created_at, updated_at) " +
                        "VALUES (?, ?, ?, ?, ?, ?, 0, now(), now())",
                nid, charId, writerId, field, field, encRichText(workKey, newValue)
        );
        log.info("[SUGGESTION-APPLY] character_note INSERT kind={} char={}", field, charId);
        return nid;
    }

    // ─────── character_delete ───────

    private UUID deleteCharacter(UUID workId, UUID writerId, Map<String, Object> p) {
        UUID charId = parseUuid(p.get("character_id"));
        if (charId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "character_id required");
        }
        int deleted = jdbc.update(
                "DELETE FROM character WHERE id = ? AND work_id = ? AND writer_id = ?",
                charId, workId, writerId
        );
        if (deleted == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "character not found in work");
        }
        log.info("[SUGGESTION-APPLY] character DELETE id={} work={}", charId, workId);
        return charId;
    }

    // ─────── world_note_update / delete ───────

    private UUID applyWorldNoteUpdate(UUID workId, UUID writerId, Map<String, Object> p, byte[] workKey) {
        UUID noteId = parseUuid(p.get("world_note_id"));
        if (noteId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "world_note_id required");
        }
        Integer match = jdbc.queryForObject(
                "SELECT count(*) FROM world_note WHERE id = ? AND work_id = ? AND writer_id = ?",
                Integer.class, noteId, workId, writerId
        );
        if (match == null || match == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "world_note not found in work");
        }
        // name·content 둘 다 옵션 — 받은 값만 갱신
        String newName = asString(p.get("name"));
        String newContent = asString(p.get("content"));
        if (newName == null && newContent == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name or content required");
        }
        StringBuilder sql = new StringBuilder("UPDATE world_note SET ");
        java.util.List<Object> args = new java.util.ArrayList<>();
        boolean first = true;
        if (newName != null) {
            sql.append("name = ?");
            args.add(encStr(workKey, newName));
            first = false;
        }
        if (newContent != null) {
            if (!first) sql.append(", ");
            sql.append("content = ?");
            args.add(encRichText(workKey, newContent));
        }
        sql.append(", updated_at = now() WHERE id = ?");
        args.add(noteId);
        jdbc.update(sql.toString(), args.toArray());
        log.info("[SUGGESTION-APPLY] world_note UPDATE id={} (name={} content={})",
                noteId, newName != null, newContent != null);
        return noteId;
    }

    private UUID deleteWorldNote(UUID workId, UUID writerId, Map<String, Object> p) {
        UUID noteId = parseUuid(p.get("world_note_id"));
        if (noteId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "world_note_id required");
        }
        int deleted = jdbc.update(
                "DELETE FROM world_note WHERE id = ? AND work_id = ? AND writer_id = ?",
                noteId, workId, writerId
        );
        if (deleted == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "world_note not found in work");
        }
        log.info("[SUGGESTION-APPLY] world_note DELETE id={} work={}", noteId, workId);
        return noteId;
    }

    // ─────── episode_update / delete ───────

    private UUID applyEpisodeUpdate(UUID workId, UUID writerId, Map<String, Object> p, byte[] workKey) {
        UUID epId = parseUuid(p.get("episode_id"));
        if (epId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "episode_id required");
        }
        Integer match = jdbc.queryForObject(
                "SELECT count(*) FROM episode WHERE id = ? AND work_id = ? AND writer_id = ?",
                Integer.class, epId, workId, writerId
        );
        if (match == null || match == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "episode not found in work");
        }
        String newTitle = asString(p.get("title"));
        String newContent = asString(p.get("content"));
        String newStatus = asString(p.get("status"));        // '작성중' / '완성' 등 평문
        if (newTitle == null && newContent == null && newStatus == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "title, content, or status required");
        }
        StringBuilder sql = new StringBuilder("UPDATE episode SET ");
        java.util.List<Object> args = new java.util.ArrayList<>();
        boolean first = true;
        if (newTitle != null) {
            sql.append("title = ?");
            args.add(encStr(workKey, newTitle));
            first = false;
        }
        if (newContent != null) {
            if (!first) sql.append(", ");
            sql.append("content = ?, word_count = ?");
            args.add(encRichText(workKey, newContent));
            args.add(newContent.length());
            first = false;
        }
        if (newStatus != null) {
            if (!first) sql.append(", ");
            sql.append("status = ?");
            args.add(newStatus);
        }
        sql.append(", updated_at = now() WHERE id = ?");
        args.add(epId);
        jdbc.update(sql.toString(), args.toArray());
        log.info("[SUGGESTION-APPLY] episode UPDATE id={} (title={} content={} status={})",
                epId, newTitle != null, newContent != null, newStatus);
        return epId;
    }

    private UUID deleteEpisode(UUID workId, UUID writerId, Map<String, Object> p) {
        UUID epId = parseUuid(p.get("episode_id"));
        if (epId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "episode_id required");
        }
        int deleted = jdbc.update(
                "DELETE FROM episode WHERE id = ? AND work_id = ? AND writer_id = ?",
                epId, workId, writerId
        );
        if (deleted == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "episode not found in work");
        }
        log.info("[SUGGESTION-APPLY] episode DELETE id={} work={}", epId, workId);
        return epId;
    }

    // ─────── plot_create / plot_revision / plot_delete ───────

    private UUID insertPlot(UUID workId, UUID writerId, Map<String, Object> p, byte[] workKey) {
        UUID parentId = parseUuid(p.get("parent_id"));
        UUID id = insertPlotRow(workId, writerId, p, workKey, parentId);
        log.info("[SUGGESTION-APPLY] plot INSERT id={} work={} parent={}", id, workId, parentId);
        return id;
    }

    /**
     * 트리 구조 플롯 일괄 생성: 부모 1 + 자식 N 개를 단일 트랜잭션 INSERT.
     * payload: { root: {title, content, status?}, children: [{title, content, status?}, ...] }
     * 반환: 부모 plot.id (자식들은 parent_id=부모 로 묶임)
     */
    @SuppressWarnings("unchecked")
    private UUID insertPlotTree(UUID workId, UUID writerId, Map<String, Object> p, byte[] workKey) {
        Object rootObj = p.get("root");
        Object childrenObj = p.get("children");
        if (!(rootObj instanceof Map<?, ?> rootRaw)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "plot_tree.root required");
        }
        Map<String, Object> root = (Map<String, Object>) rootRaw;
        UUID parentRefId = parseUuid(root.get("parent_id"));   // 옵션 — 더 위 막의 child 로 연결 시
        UUID rootId = insertPlotRow(workId, writerId, root, workKey, parentRefId);

        int inserted = 0;
        if (childrenObj instanceof java.util.List<?> list) {
            for (Object c : list) {
                if (!(c instanceof Map<?, ?> cm)) continue;
                Map<String, Object> child = (Map<String, Object>) cm;
                insertPlotRow(workId, writerId, child, workKey, rootId);
                inserted++;
            }
        }
        log.info("[SUGGESTION-APPLY] plot_tree INSERT root={} children={} work={}",
                rootId, inserted, workId);
        return rootId;
    }

    /** 단일 plot row INSERT — insertPlot/insertPlotTree 공통 헬퍼. */
    private UUID insertPlotRow(
            UUID workId, UUID writerId, Map<String, Object> p, byte[] workKey, UUID parentId
    ) {
        String title = encStr(workKey, asString(p.get("title")));
        String content = encRichText(workKey, asString(p.get("content")));
        String status = asString(p.get("status"));
        if (title == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "plot.title required");
        }
        UUID id = UUID.randomUUID();
        int sortOrder = nextSortOrder("plot", workId);
        jdbc.update(
                "INSERT INTO plot (id, work_id, writer_id, parent_id, title, status, content, sort_order, created_at, updated_at) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, now(), now())",
                id, workId, writerId, parentId, title, status, content, sortOrder
        );
        return id;
    }

    private UUID deletePlot(UUID workId, UUID writerId, Map<String, Object> p) {
        UUID plotId = parseUuid(p.get("plot_id"));
        if (plotId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "plot_id required");
        }
        int deleted = jdbc.update(
                "DELETE FROM plot WHERE id = ? AND work_id = ? AND writer_id = ?",
                plotId, workId, writerId
        );
        if (deleted == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "plot not found in work");
        }
        log.info("[SUGGESTION-APPLY] plot DELETE id={} work={}", plotId, workId);
        return plotId;
    }

    // ─────── plot_revision ───────

    private UUID applyPlotRevision(UUID workId, UUID writerId, Map<String, Object> p, byte[] workKey) {
        UUID plotId = parseUuid(p.get("plot_id"));
        if (plotId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "plot_id required");
        }
        Integer match = jdbc.queryForObject(
                "SELECT count(*) FROM plot WHERE id = ? AND work_id = ? AND writer_id = ?",
                Integer.class, plotId, workId, writerId
        );
        if (match == null || match == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "plot not found in work");
        }
        String newOutline = asString(p.get("new_outline"));
        if (newOutline == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "new_outline required");
        }
        jdbc.update(
                "UPDATE plot SET content = ?, updated_at = now() WHERE id = ?",
                encRichText(workKey, newOutline), plotId
        );
        log.info("[SUGGESTION-APPLY] plot UPDATE id={}", plotId);
        return plotId;
    }

    // ─────── helpers ───────

    private int nextSortOrder(String table, UUID workId) {
        Integer maxSort = jdbc.queryForObject(
                "SELECT COALESCE(MAX(sort_order), -1) FROM " + table + " WHERE work_id = ?",
                Integer.class, workId
        );
        return (maxSort == null ? 0 : maxSort + 1);
    }

    private static String asString(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o);
        return s.isEmpty() ? null : s;
    }

    private static UUID parseUuid(Object o) {
        if (o == null) return null;
        try { return UUID.fromString(String.valueOf(o)); }
        catch (Exception e) { return null; }
    }

    private static String encStr(byte[] workKey, String plaintext) {
        if (plaintext == null) return null;
        return AesGcmCipher.encryptString(workKey, plaintext);
    }

    /**
     * 평문을 TipTap doc JSON 으로 래핑 후 암호화.
     * 프론트 에디터는 character_note.content / world_note.content / plot.content / episode.content
     * 가 TipTap JSON 임을 가정 (사용자 직접 작성 시 그렇게 저장됨). agent 가 평문으로 저장하면
     * parseNoteContent JSON.parse 실패 → 빈 문서 표시되는 문제가 있어, 저장 단계에서 래핑.
     */
    private static String encRichText(byte[] workKey, String plaintext) {
        if (plaintext == null || plaintext.isEmpty()) return null;
        String tiptapJson = wrapPlainTextAsTiptapDoc(plaintext);
        return AesGcmCipher.encryptString(workKey, tiptapJson);
    }

    private static String wrapPlainTextAsTiptapDoc(String text) {
        // \n+ 로 단락 분리. 단락 안의 텍스트는 단일 text 노드.
        // JSON 직접 조립 — Jackson 의존성 없이 빠르게.
        String[] paragraphs = text.split("\\n+");
        StringBuilder sb = new StringBuilder();
        sb.append("{\"type\":\"doc\",\"content\":[");
        boolean first = true;
        boolean any = false;
        for (String p : paragraphs) {
            String trimmed = p == null ? "" : p;
            if (trimmed.isEmpty()) continue;
            if (!first) sb.append(',');
            sb.append("{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"")
              .append(jsonEscape(trimmed))
              .append("\"}]}");
            first = false;
            any = true;
        }
        if (!any) {
            sb.append("{\"type\":\"paragraph\"}");
        }
        sb.append("]}");
        return sb.toString();
    }

    private static String jsonEscape(String s) {
        StringBuilder out = new StringBuilder(s.length() + 16);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                default -> {
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        return out.toString();
    }
}
