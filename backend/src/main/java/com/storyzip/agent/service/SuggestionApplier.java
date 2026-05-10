package com.storyzip.agent.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.storyzip.ai.client.EpisodeIndexingTrigger;
import com.storyzip.security.AesGcmCipher;
import com.storyzip.security.WorkKeyService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    private final EpisodeIndexingTrigger episodeIndexingTrigger;
    private final ObjectMapper objectMapper;

    /**
     * 승인된 suggestion 을 실제 테이블에 적용. 반환: 생성/갱신된 row 의 id (있으면).
     *
     * spelling_batch 에 한해 selectedIndices (작가가 체크박스로 선별한 fix idx 들) 가 전달됨.
     * null 이면 모든 fix 적용. 다른 entity_type 에선 무시.
     */
    public UUID apply(
            UUID workId,
            UUID writerId,
            String entityType,
            Map<String, Object> payload,
            List<Integer> selectedIndices
    ) {
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
                case "spelling_fix"       -> applySpellingFix(workId, writerId, payload, workKey);
                case "spelling_batch"     -> applySpellingBatch(workId, writerId, payload, workKey, selectedIndices);
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
                normalizeGender(gender),
                age != null ? age : "미설정",
                sortOrder
        );
        // 기본 정책: 신규 캐릭터의 모든 서술 (intro / appearance / personality / notes) 은
        // 단일 'intro' character_note 한 행에 합쳐 저장. 외형/성격을 별도 노트로 분리하는 것은
        // 사용자가 명시적으로 요청한 경우에만 propose_character_update(field='appearance' 등)
        // 경로로 처리.
        // payload 호환: 구버전 agent 가 여전히 appearance/personality/notes 를 분리해서 보낼 수
        // 있으므로 모두 흡수하여 intro 본문 단일 단락으로 합친다.
        String intro = composeIntroBody(p, workKey);
        insertCharacterNoteIfPresent(id, writerId, workKey, "intro", "한 줄 소개", intro);
        log.info("[SUGGESTION-APPLY] character INSERT id={} work={} introLen={}",
                id, workId, intro == null ? 0 : intro.length());
        return id;
    }

    /** payload 의 intro/appearance/personality/notes/role 을 사람이 읽기 좋은 단락으로 합친다.
     *
     *  payload 값들이 v1: ciphertext (proposals.py 가 암호화) 인 경우 work_key 로 즉석 복호화 후 합침.
     *  결과는 평문 markdown — encRichText 가 다시 tiptap JSON 변환 + 암호화하여 destination 에 적재.
     */
    private static String composeIntroBody(Map<String, Object> p, byte[] workKey) {
        StringBuilder sb = new StringBuilder();
        appendLabeled(sb, null, decryptIfCipher(workKey, asString(p.get("intro"))));
        appendLabeled(sb, "역할", decryptIfCipher(workKey, asString(p.get("role"))));
        appendLabeled(sb, "외형", decryptIfCipher(workKey, asString(p.get("appearance"))));
        appendLabeled(sb, "성격", decryptIfCipher(workKey, asString(p.get("personality"))));
        appendLabeled(sb, null, decryptIfCipher(workKey, asString(p.get("notes"))));
        String body = sb.toString().trim();
        return body.isEmpty() ? null : body;
    }

    /** v1: 접두사면 work_key 로 평문화, 아니면 그대로. 복호화 실패 시 null (그 필드 skip). */
    private static String decryptIfCipher(byte[] workKey, String value) {
        if (value == null || !value.startsWith("v1:")) return value;
        try {
            return AesGcmCipher.decryptString(workKey, value);
        } catch (Exception e) {
            return null;
        }
    }

    private static void appendLabeled(StringBuilder sb, String label, String value) {
        if (value == null || value.isBlank()) return;
        if (sb.length() > 0) sb.append("\n\n");
        if (label != null) sb.append(label).append(": ");
        sb.append(value);
    }

    private void insertCharacterNoteIfPresent(
            UUID charId, UUID writerId, byte[] workKey, String kind, String title, String plain
    ) {
        if (plain == null || plain.isBlank()) return;
        UUID nid = UUID.randomUUID();
        String encTitle = encStr(workKey, title);
        String content = encRichText(workKey, plain);   // tiptap JSON 으로 래핑 후 암호화
        jdbc.update(
                "INSERT INTO character_note (id, character_id, writer_id, kind, title, content, sort_order, created_at, updated_at) " +
                        "VALUES (?, ?, ?, ?, ?, ?, 0, now(), now())",
                nid, charId, writerId, kind, encTitle, content
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
        // word_count 는 평문 length (UTF-16 단순 추정).
        // payload.content 가 v1: cipher 일 수 있으므로 평문 길이 기준으로 환산.
        String rawContent = asString(p.get("content"));
        String plainContent = decryptIfCipher(workKey, rawContent);
        int wordCount = plainContent != null ? plainContent.length() : 0;
        jdbc.update(
                "INSERT INTO episode (id, work_id, writer_id, parent_id, title, content, status, word_count, sort_order, created_at, updated_at) " +
                        "VALUES (?, ?, ?, ?, ?, ?, '작성중', ?, ?, now(), now())",
                id, workId, writerId, parentId, title, content, wordCount, sortOrder
        );
        log.info("[SUGGESTION-APPLY] episode INSERT id={} work={} parent={} status=작성중", id, workId, parentId);
        // AI 제안 승인으로 신규 회차 INSERT — chunk_and_embed 파이프라인 트리거 (afterCommit).
        // status='작성중' 신규 행이라 summary 트리거 조건(완성 진입) 미충족 → fireIndexing 만.
        episodeIndexingTrigger.fireIndexing(id, workId, writerId);
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
            // gender/age 는 평문 컬럼. payload 의 new_value 가 v1: 일 수 있어 평문화 후 처리.
            String plainValue = decryptIfCipher(workKey, newValue);
            String storedValue = "gender".equals(field) ? normalizeGender(plainValue) : plainValue;
            jdbc.update(
                    "UPDATE character SET " + field + " = ?, updated_at = now() WHERE id = ?",
                    storedValue, charId
            );
            log.info("[SUGGESTION-APPLY] character.{}={} id={}", field, storedValue, charId);
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
        // ownership 검증 + prevStatus 읽기 (status '완성' 신규 진입 시 summary 트리거 판단용)
        String prevStatus = jdbc.query(
                "SELECT status FROM episode WHERE id = ? AND work_id = ? AND writer_id = ?",
                rs -> rs.next() ? rs.getString(1) : null,
                epId, workId, writerId
        );
        if (prevStatus == null) {
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
            // word_count 는 평문 length 기준 (cipher 면 복호화 후)
            String plainNewContent = decryptIfCipher(workKey, newContent);
            args.add(plainNewContent != null ? plainNewContent.length() : 0);
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
        // 본문 변경 시 chunk_and_embed 재인덱싱. status '완성' 신규 진입 시 episode_summary 트리거.
        if (newContent != null) {
            episodeIndexingTrigger.fireIndexing(epId, workId, writerId);
        }
        if (newStatus != null) {
            episodeIndexingTrigger.fireSummary(epId, workId, writerId, prevStatus, newStatus);
        }
        return epId;
    }

    // ─────── spelling_fix — 한국어 표기 오류 자동 치환 ───────

    /**
     * 1:1 자동 치환. propose_spelling_fix payload:
     *   {episode_id, line, original, suggestion, fix_type, reason?, expected_updated_at?}
     *
     * 안전 가드:
     *   1. episode 소유권 검증
     *   2. expected_updated_at != 현재 episode.updated_at → 409 (작가가 그 사이 본문 수정 → 거부)
     *   3. 본문 복호화 → TipTap JSON 파싱 → line 인덱스 (1-based) top-level block 추출
     *   4. 해당 block 의 text 노드가 1개 + marks 없음 → 단순 치환
     *      그 외 (마크 걸침 / 다중 노드) → 422 (작가에게 직접 수정 안내)
     *   5. text 에 original 미존재 → 422 (이미 수정됐거나 추출 불일치)
     *   6. 첫 매치만 1회 치환 (정규식 X — literal replace)
     *   7. 재직렬화 → encStr → episode.content 갱신, updated_at=now()
     *   8. fireIndexing 으로 chunk_and_embed 재실행 (본문 변경)
     */
    private UUID applySpellingFix(UUID workId, UUID writerId, Map<String, Object> p, byte[] workKey) {
        UUID epId = parseUuid(p.get("episode_id"));
        if (epId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "episode_id required");
        }
        Object lineObj = p.get("line");
        if (!(lineObj instanceof Number)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "line (integer) required");
        }
        int line = ((Number) lineObj).intValue();
        if (line < 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "line must be >= 1");
        }
        // payload 의 자유 텍스트는 agent 가 work_key 로 v1: 암호화해 보냈을 수 있다 (deep_crypt).
        // _STRUCTURAL_KEYS 에 등록된 키 (episode_id, line) 만 평문 보장 — original/suggestion/
        // reason/expected_updated_at 은 모두 복호화 후 사용해야 한다.
        String original = decryptIfCipher(workKey, asString(p.get("original")));
        String suggestion = decryptIfCipher(workKey, asString(p.get("suggestion")));
        if (original == null || suggestion == null || original.equals(suggestion)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "original/suggestion required and must differ");
        }
        // ISO timestamp — 암호화돼 들어오면 평문화 후 파싱
        String expectedUpdatedAt = decryptIfCipher(workKey, asString(p.get("expected_updated_at")));

        // 1) episode 소유권 + 현재 content/updated_at fetch
        Object[] row = jdbc.query(
                "SELECT content, updated_at FROM episode " +
                        "WHERE id = ? AND work_id = ? AND writer_id = ?",
                rs -> {
                    if (!rs.next()) return null;
                    return new Object[]{rs.getString(1), rs.getTimestamp(2)};
                },
                epId, workId, writerId
        );
        if (row == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "episode not found in work");
        }
        String encContent = (String) row[0];
        Timestamp currentUpdatedAt = (Timestamp) row[1];

        // 2) race window 차단 — 작가가 propose 이후 본문을 수정했으면 적용 거부
        if (expectedUpdatedAt != null && currentUpdatedAt != null) {
            try {
                Instant expected = Instant.parse(expectedUpdatedAt);
                Instant actual = currentUpdatedAt.toInstant();
                // ms 단위 오차 허용 — Postgres timestamp(6) 와 java Instant 정밀도 차이
                if (Math.abs(actual.toEpochMilli() - expected.toEpochMilli()) > 1000) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "본문이 그 사이 수정되어 자동 적용 불가 — 직접 수정해주세요.");
                }
            } catch (java.time.format.DateTimeParseException ignore) {
                // expected_updated_at 파싱 실패 — race 검증 스킵 (보수적 적용)
            }
        }

        // 3) content 복호화
        String plainJson = decryptIfCipher(workKey, encContent);
        if (plainJson == null) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "본문 복호화 실패");
        }

        // 4) TipTap JSON 파싱 (legacy plain text 면 거부 — line 매칭 의미 없음)
        JsonNode doc;
        try {
            doc = objectMapper.readTree(plainJson);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "본문이 TipTap JSON 형식 아님 — 자동 적용 불가, 직접 수정해주세요.");
        }
        if (!doc.isObject() || !"doc".equals(doc.path("type").asText()) || !doc.path("content").isArray()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "본문 구조 비표준 — 자동 적용 불가, 직접 수정해주세요.");
        }
        ArrayNode blocks = (ArrayNode) doc.get("content");
        // line → block 인덱스 매핑. ai/app/services/text_extractor.py:extract_numbered_text 와 동일 규칙:
        //   paragraph/heading/codeBlock/blockquote/sceneBreak/horizontalRule = 1 라인 = 1 블록
        //   bulletList/orderedList = N 라인 (item 수) = 1 블록 — 라인 ≠ 블록 인덱스
        // 자동 치환은 단순 1:1 블록만 허용. 리스트 항목 자동 수정은 1차 미지원.
        int targetBlockIdx = -1;
        int currentLine = 0;
        for (int i = 0; i < blocks.size(); i++) {
            JsonNode b = blocks.get(i);
            String btype = b.path("type").asText("");
            currentLine++;
            if (currentLine == line) {
                if ("paragraph".equals(btype) || "heading".equals(btype)
                        || "codeBlock".equals(btype) || "blockquote".equals(btype)) {
                    targetBlockIdx = i;
                }
                // sceneBreak / horizontalRule / bulletList(첫 줄) / orderedList(첫 줄) 등 →
                // 자동 치환 불가 (텍스트 콘텐츠 없거나 다중 라인 블록)
                break;
            }
            // 다중 라인 블록 — line 카운터에 추가 라인 누적
            if ("bulletList".equals(btype) || "orderedList".equals(btype)) {
                int items = b.path("content").isArray() ? b.path("content").size() : 0;
                int extraLines = Math.max(0, items - 1);
                // target 이 이 리스트 안의 N 번째 항목이면 → 리스트 항목 자동 수정 미지원
                if (line <= currentLine + extraLines) {
                    throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                            "L" + line + " 목록 항목 — 자동 적용 미지원, 직접 수정해주세요.");
                }
                currentLine += extraLines;
            }
        }
        if (targetBlockIdx == -1) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "L" + line + " 자동 적용 가능한 블록이 아님 (목록·구분선 등) — 직접 수정해주세요.");
        }
        JsonNode block = blocks.get(targetBlockIdx);
        if (!block.path("content").isArray()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "L" + line + " 블록에 텍스트 노드 없음 — 자동 적용 불가");
        }
        ArrayNode textNodes = (ArrayNode) block.get("content");

        // 5) 단순 케이스만 지원: text 노드 1개 + marks 비어있음
        if (textNodes.size() != 1) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "L" + line + " 마크(굵게/기울임 등) 가 걸친 복합 텍스트 — 자동 적용 미지원, 직접 수정해주세요.");
        }
        JsonNode textNode = textNodes.get(0);
        if (!"text".equals(textNode.path("type").asText())) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "L" + line + " 비텍스트 노드 — 자동 적용 미지원");
        }
        JsonNode marks = textNode.path("marks");
        if (marks.isArray() && !marks.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "L" + line + " 마크가 걸려 있어 자동 적용 미지원, 직접 수정해주세요.");
        }
        String text = textNode.path("text").asText("");
        int idx = text.indexOf(original);
        if (idx < 0) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "L" + line + " 에서 원본 문자열을 찾을 수 없음 — 이미 수정됐거나 본문 변경");
        }
        // 6) 첫 매치 1회 치환 (literal — String.replaceFirst 의 regex 회피)
        String newText = text.substring(0, idx) + suggestion + text.substring(idx + original.length());

        // 7) 텍스트 노드 갱신 + JSON 재직렬화
        ((ObjectNode) textNode).put("text", newText);
        String newJson;
        try {
            newJson = objectMapper.writeValueAsString(doc);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "본문 재직렬화 실패: " + e.getMessage());
        }

        // 8) word_count 재계산 (block text 합산 — TipTap 기본 length 의미)
        int newWordCount = computePlainLength(blocks);

        // 9) episode 갱신
        String encNewContent = encStr(workKey, newJson);
        jdbc.update(
                "UPDATE episode SET content = ?, word_count = ?, updated_at = now() WHERE id = ?",
                encNewContent, newWordCount, epId
        );
        log.info("[SUGGESTION-APPLY] spelling_fix episode={} L{} '{}' → '{}'",
                epId, line,
                original.length() > 30 ? original.substring(0, 30) + "..." : original,
                suggestion.length() > 30 ? suggestion.substring(0, 30) + "..." : suggestion);

        // 10) 본문 변경 → chunk_and_embed 재인덱싱 (5초 디바운스로 연속 적용 흡수)
        episodeIndexingTrigger.fireIndexing(epId, workId, writerId);
        return epId;
    }

    /** TipTap blocks 의 text 노드 텍스트 합산 — word_count 갱신용. */
    private static int computePlainLength(ArrayNode blocks) {
        int total = 0;
        for (JsonNode block : blocks) {
            JsonNode children = block.path("content");
            if (children.isArray()) {
                for (JsonNode child : children) {
                    if ("text".equals(child.path("type").asText())) {
                        total += child.path("text").asText("").length();
                    }
                }
            }
        }
        return total;
    }

    // ─────── spelling_batch — 다건 체크리스트 일괄 자동 치환 ───────

    /**
     * 1 propose = N 치환. payload:
     *   {episode_id, expected_updated_at?, fixes: [{line, original, suggestion, fix_type, reason?}, ...]}
     *
     * selectedIndices == null  → 모든 fix 적용 (사용자가 선택 안 보낸 경우 = 기본 모두 OK)
     * selectedIndices == []    → 적용할 게 없음 → 422 ('아무것도 선택되지 않음')
     * selectedIndices == [0,2] → fixes[0], fixes[2] 만 적용
     *
     * 각 fix 는 단건 spelling_fix 와 동일 가드:
     *   - 라인→블록 매핑 (paragraph/heading/codeBlock/blockquote 만 자동 적용 가능)
     *   - 단일 text 노드 + marks 비어있을 때만 치환
     *   - 같은 블록에 fix 가 여러 개 있어도 indexOf 기반 순차 치환 (이전 치환이 다음 indexOf 결과
     *     에 영향 줄 수 있지만 original 이 텍스트에 남아있는 한 정상 동작)
     *
     * 일부 fix 가 실패해도 다른 fix 는 계속 진행 (best-effort). 적용된 fix 가 1건 이상이면 성공.
     */
    private UUID applySpellingBatch(
            UUID workId, UUID writerId, Map<String, Object> p, byte[] workKey,
            List<Integer> selectedIndices
    ) {
        UUID epId = parseUuid(p.get("episode_id"));
        if (epId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "episode_id required");
        }
        Object fixesObj = p.get("fixes");
        if (!(fixesObj instanceof List<?>) || ((List<?>) fixesObj).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "fixes (non-empty list) required");
        }
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> fixes = (List<Map<String, Object>>) fixesObj;
        String expectedUpdatedAt = decryptIfCipher(workKey, asString(p.get("expected_updated_at")));

        // selectedIndices null → 모두 적용. 빈 리스트 → 사용자가 0건 선택 → 거부.
        Set<Integer> selectedSet;
        if (selectedIndices == null) {
            selectedSet = null;
        } else if (selectedIndices.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "선택된 항목 없음 — 적어도 하나 체크 후 적용해주세요.");
        } else {
            selectedSet = new HashSet<>(selectedIndices);
        }

        // 1) episode 소유권 + 현재 content/updated_at fetch
        Object[] row = jdbc.query(
                "SELECT content, updated_at FROM episode " +
                        "WHERE id = ? AND work_id = ? AND writer_id = ?",
                rs -> {
                    if (!rs.next()) return null;
                    return new Object[]{rs.getString(1), rs.getTimestamp(2)};
                },
                epId, workId, writerId
        );
        if (row == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "episode not found in work");
        }
        String encContent = (String) row[0];
        Timestamp currentUpdatedAt = (Timestamp) row[1];

        // 2) race window 차단 — 작가가 propose 이후 본문 수정했으면 거부
        if (expectedUpdatedAt != null && currentUpdatedAt != null) {
            try {
                Instant expected = Instant.parse(expectedUpdatedAt);
                Instant actual = currentUpdatedAt.toInstant();
                if (Math.abs(actual.toEpochMilli() - expected.toEpochMilli()) > 1000) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "본문이 그 사이 수정되어 자동 적용 불가 — 직접 수정해주세요.");
                }
            } catch (java.time.format.DateTimeParseException ignore) {
                // 보수적 적용 — 검증 skip
            }
        }

        // 3) content 복호화
        String plainJson = decryptIfCipher(workKey, encContent);
        if (plainJson == null) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "본문 복호화 실패");
        }

        // 4) TipTap JSON 파싱
        JsonNode doc;
        try {
            doc = objectMapper.readTree(plainJson);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "본문이 TipTap JSON 형식 아님 — 자동 적용 불가, 직접 수정해주세요.");
        }
        if (!doc.isObject() || !"doc".equals(doc.path("type").asText())
                || !doc.path("content").isArray()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "본문 구조 비표준 — 자동 적용 불가.");
        }
        ArrayNode blocks = (ArrayNode) doc.get("content");

        // 5) 각 fix 처리. 실패는 누적, 성공도 누적.
        int applied = 0;
        List<String> skipReasons = new ArrayList<>();
        for (int i = 0; i < fixes.size(); i++) {
            if (selectedSet != null && !selectedSet.contains(i)) continue;
            Map<String, Object> fix = fixes.get(i);
            Object lineObj = fix.get("line");
            if (!(lineObj instanceof Number)) {
                skipReasons.add("L? line 누락");
                continue;
            }
            int line = ((Number) lineObj).intValue();
            String original = decryptIfCipher(workKey, asString(fix.get("original")));
            String suggestion = decryptIfCipher(workKey, asString(fix.get("suggestion")));
            if (original == null || suggestion == null || original.isEmpty()
                    || suggestion.isEmpty() || original.equals(suggestion)) {
                skipReasons.add("L" + line + " 원본/교정 비정상");
                continue;
            }

            int targetBlockIdx = findTargetBlockIdx(blocks, line);
            if (targetBlockIdx < 0) {
                skipReasons.add("L" + line + " 자동 적용 불가 블록 (목록·구분선 등)");
                continue;
            }
            JsonNode block = blocks.get(targetBlockIdx);
            if (!block.path("content").isArray()) {
                skipReasons.add("L" + line + " 텍스트 없음");
                continue;
            }
            ArrayNode textNodes = (ArrayNode) block.get("content");
            if (textNodes.size() != 1) {
                skipReasons.add("L" + line + " 마크/다중 노드 (직접 수정 필요)");
                continue;
            }
            JsonNode textNode = textNodes.get(0);
            if (!"text".equals(textNode.path("type").asText())) {
                skipReasons.add("L" + line + " 비텍스트 노드");
                continue;
            }
            JsonNode marks = textNode.path("marks");
            if (marks.isArray() && !marks.isEmpty()) {
                skipReasons.add("L" + line + " 마크 걸림 (직접 수정 필요)");
                continue;
            }
            String text = textNode.path("text").asText("");
            int idx = text.indexOf(original);
            if (idx < 0) {
                skipReasons.add("L" + line + " 원본 미존재 (이미 수정됨?)");
                continue;
            }
            String newText = text.substring(0, idx) + suggestion + text.substring(idx + original.length());
            ((ObjectNode) textNode).put("text", newText);
            applied++;
        }

        if (applied == 0) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "적용된 항목 없음 — " + (skipReasons.isEmpty() ? "선택 항목 0건" : String.join(", ", skipReasons)));
        }

        // 6) 재직렬화 + word_count 재계산
        String newJson;
        try {
            newJson = objectMapper.writeValueAsString(doc);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "본문 재직렬화 실패: " + e.getMessage());
        }
        int newWordCount = computePlainLength(blocks);

        // 7) episode 갱신
        String encNewContent = encStr(workKey, newJson);
        jdbc.update(
                "UPDATE episode SET content = ?, word_count = ?, updated_at = now() WHERE id = ?",
                encNewContent, newWordCount, epId
        );
        log.info("[SUGGESTION-APPLY] spelling_batch episode={} applied={}/{} skipped={}",
                epId, applied, fixes.size(), skipReasons);

        // 8) 본문 변경 → chunk_and_embed 재인덱싱
        episodeIndexingTrigger.fireIndexing(epId, workId, writerId);
        return epId;
    }

    /** 라인 번호 → 적용 가능 블록 인덱스. extract_numbered_text 동일 규칙. -1 = 자동 적용 불가. */
    private static int findTargetBlockIdx(ArrayNode blocks, int line) {
        int currentLine = 0;
        for (int i = 0; i < blocks.size(); i++) {
            JsonNode b = blocks.get(i);
            String btype = b.path("type").asText("");
            currentLine++;
            if (currentLine == line) {
                if ("paragraph".equals(btype) || "heading".equals(btype)
                        || "codeBlock".equals(btype) || "blockquote".equals(btype)) {
                    return i;
                }
                return -1;
            }
            if ("bulletList".equals(btype) || "orderedList".equals(btype)) {
                int items = b.path("content").isArray() ? b.path("content").size() : 0;
                int extraLines = Math.max(0, items - 1);
                if (line <= currentLine + extraLines) return -1;
                currentLine += extraLines;
            }
        }
        return -1;
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

    /**
     * agent 가 보낸 gender 값을 프론트 GENDER_ICON_MAP 키 ('남'/'여'/'기타'/'미설정') 로 정규화.
     *
     * <p>프론트 [CharacterOverview.tsx](../../../../frontend/src/shared/features/character/CharacterOverview.tsx)
     * 의 GENDER_OPTIONS 와 동기화된 enum. 어느 것도 매칭 안 되면 '미설정' fallback —
     * '?' 아이콘 표시되어 사용자가 즉시 알아챌 수 있도록.
     *
     * <p>구버전 데이터에 박혀있던 '미정' 도 '미설정' 으로 흡수 (frontend label map 에 없어 폴백).
     */
    private static String normalizeGender(String raw) {
        if (raw == null) return "미설정";
        String s = raw.trim().toLowerCase();
        if (s.isEmpty()) return "미설정";
        // 정규 한 글자
        if ("남".equals(raw.trim()) || "여".equals(raw.trim()) || "기타".equals(raw.trim()) || "미설정".equals(raw.trim())) {
            return raw.trim();
        }
        // 변형 흡수
        return switch (s) {
            case "남성", "male", "m", "남자", "boy", "man" -> "남";
            case "여성", "female", "f", "여자", "girl", "woman" -> "여";
            case "기타", "other", "non-binary", "nonbinary", "nb", "x" -> "기타";
            case "미정", "미설정", "unknown", "none", "n/a", "null" -> "미설정";
            default -> "미설정";
        };
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
        // 2026-05-09: extraction_suggestion.payload 가 v1: ciphertext 를 담아 옴 (proposals.py 가
        // INSERT 직전 work_key 로 암호화). 평문 컬럼 (character.name 등) 의 destination 도 같은
        // work_key 로 암호화돼야 하므로, 이미 v1: 인 입력은 그대로 통과 — 이중 암호화 차단.
        if (plaintext.startsWith("v1:")) return plaintext;
        return AesGcmCipher.encryptString(workKey, plaintext);
    }

    /**
     * 평문/Markdown 을 TipTap doc JSON 으로 변환 후 암호화.
     *
     * <p>프론트 에디터는 character_note.content / world_note.content / plot.content /
     * episode.content 가 TipTap JSON 임을 가정. agent 는 본문을 Markdown 으로 보내고
     * (registry.py / scenarios.py 시스템 프롬프트로 강제), 본 메서드가 위지윅 호환 doc 으로
     * 변환한 뒤 암호화한다.
     *
     * <p>구버전 plain text 입력도 그대로 동작 — Markdown 문법 없으면 단순 paragraph 트리.
     * 입력이 이미 TipTap doc JSON 이면 통과 (idempotent).
     *
     * <p>암호화 호환: AES-GCM 은 UTF-8 byte 단위라 JSON 내용에 무관. 기존 v1: 포맷 그대로.
     */
    private static String encRichText(byte[] workKey, String plaintext) {
        if (plaintext == null || plaintext.isEmpty()) return null;
        // 2026-05-09: extraction_suggestion.payload 의 자유 텍스트는 work_key 로 암호화된 v1:
        // 형태로 도착. 위지윅 destination (episode.content 등) 은 v1:(tiptap_json) 형식이어야
        // 하므로 transcoding 필요: v1:(markdown) → 평문 markdown → tiptap JSON → v1:(tiptap_json).
        String md;
        if (plaintext.startsWith("v1:")) {
            try {
                md = AesGcmCipher.decryptString(workKey, plaintext);
            } catch (Exception e) {
                // 복호화 실패 시 cipher 그대로 두면 destination 화면이 깨지므로 빈 문서로 대체.
                return AesGcmCipher.encryptString(workKey,
                        MarkdownToTiptap.toDocJson(""));
            }
        } else {
            md = plaintext;
        }
        String tiptapJson = MarkdownToTiptap.toDocJson(md);
        return AesGcmCipher.encryptString(workKey, tiptapJson);
    }
}
