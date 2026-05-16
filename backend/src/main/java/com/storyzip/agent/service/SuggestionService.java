package com.storyzip.agent.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * extraction_suggestion 작가 승인/거절 서비스 (Phase 4 §F-3).
 *
 * <p>1차 MVP: status='confirmed'/'rejected' 표기 + reviewer_note 만 갱신.
 * 실제 character / world_note / episode INSERT 는 frontend 가 payload 를 받아
 * 기존 작성 화면으로 prefill 하는 흐름 (Phase 5 자동 INSERT).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SuggestionService {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final SuggestionApplier applier;

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(UUID writerId, UUID workId, String status, String entityType, int limit) {
        StringBuilder sql = new StringBuilder(
                "SELECT id, work_id, episode_id, entity_type, suggested_name, payload, " +
                        "       source_agent, source_thread_id, status, reviewer_note, " +
                        "       created_at, updated_at " +
                        "FROM extraction_suggestion " +
                        "WHERE writer_id = ? "
        );
        List<Object> args = new java.util.ArrayList<>();
        args.add(writerId);
        if (workId != null) {
            sql.append(" AND work_id = ? ");
            args.add(workId);
        }
        if (status != null && !status.isBlank()) {
            sql.append(" AND status = ? ");
            args.add(status);
        }
        if (entityType != null && !entityType.isBlank()) {
            sql.append(" AND entity_type = ? ");
            args.add(entityType);
        }
        sql.append(" ORDER BY created_at DESC LIMIT ?");
        args.add(Math.min(limit, 200));

        return jdbc.query(sql.toString(), (rs, rn) -> {
            Map<String, Object> row = new HashMap<>();
            row.put("id", rs.getObject("id", UUID.class).toString());
            row.put("work_id", rs.getObject("work_id", UUID.class).toString());
            UUID epId = rs.getObject("episode_id", UUID.class);
            row.put("episode_id", epId != null ? epId.toString() : null);
            row.put("entity_type", rs.getString("entity_type"));
            row.put("suggested_name", rs.getString("suggested_name"));
            row.put("payload", parseJson(rs.getString("payload")));
            row.put("source_agent", rs.getString("source_agent"));
            UUID tid = rs.getObject("source_thread_id", UUID.class);
            row.put("source_thread_id", tid != null ? tid.toString() : null);
            row.put("status", rs.getString("status"));
            row.put("reviewer_note", rs.getString("reviewer_note"));
            // Frontend 가 string 으로 받기를 기대 — ISO 문자열로 명시 직렬화
            var createdTs = rs.getTimestamp("created_at");
            var updatedTs = rs.getTimestamp("updated_at");
            row.put("created_at", createdTs != null ? createdTs.toInstant().toString() : null);
            row.put("updated_at", updatedTs != null ? updatedTs.toInstant().toString() : null);
            return row;
        }, args.toArray());
    }

    @Transactional
    public Map<String, Object> updateStatus(
            UUID writerId,
            UUID suggestionId,
            String newStatus,
            String reviewerNote,
            java.util.List<Integer> selectedIndices
    ) {
        if (!List.of("confirmed", "rejected").contains(newStatus)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status must be 'confirmed' or 'rejected'");
        }
        // 1) suggestion lock + payload 읽기
        var rowOpt = jdbc.query(
                "SELECT work_id, entity_type, payload FROM extraction_suggestion " +
                        "WHERE id = ? AND writer_id = ? AND status = 'pending' FOR UPDATE",
                rs -> {
                    if (!rs.next()) return null;
                    return new Object[]{
                            rs.getObject("work_id", UUID.class),
                            rs.getString("entity_type"),
                            rs.getString("payload")
                    };
                },
                suggestionId, writerId
        );
        if (rowOpt == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "suggestion not found or already processed");
        }
        UUID workId = (UUID) rowOpt[0];
        String entityType = (String) rowOpt[1];
        String payloadJson = (String) rowOpt[2];

        UUID confirmedTargetId = null;
        // 2) confirmed 면 실제 entity 작성
        if ("confirmed".equals(newStatus)) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> payload = objectMapper.readValue(payloadJson, Map.class);
                confirmedTargetId = applier.apply(workId, writerId, entityType, payload, selectedIndices);
            } catch (ResponseStatusException e) {
                throw e;     // 4xx 그대로 전파
            } catch (Exception e) {
                log.error("[AGENT-SUGGESTION] apply failed sug={} type={} err={}",
                        suggestionId, entityType, e.toString(), e);
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "suggestion 적용 실패: " + e.getClass().getSimpleName() + " — " + e.getMessage());
            }
        }

        // 3) suggestion 상태 갱신
        jdbc.update(
                "UPDATE extraction_suggestion " +
                        "SET status = ?, reviewer_note = ?, confirmed_target_id = ?, updated_at = now() " +
                        "WHERE id = ?",
                newStatus, reviewerNote, confirmedTargetId, suggestionId
        );
        log.info("[AGENT-SUGGESTION] writer={} suggestion={} -> {} target={} note='{}'",
                writerId, suggestionId, newStatus, confirmedTargetId,
                reviewerNote != null ? reviewerNote.substring(0, Math.min(80, reviewerNote.length())) : "");
        Map<String, Object> resp = new java.util.HashMap<>();
        resp.put("id", suggestionId.toString());
        resp.put("status", newStatus);
        resp.put("confirmed_target_id", confirmedTargetId != null ? confirmedTargetId.toString() : null);
        return resp;
    }

    /**
     * suggestion 행 영구 삭제. 처리 완료된 (confirmed/rejected) 기록을 작가가 정리할 때 사용.
     *
     * <p>주의: confirmed_target_id 가 가리키는 실제 entity (character / world_note / episode 등) 는
     * 건드리지 않는다. 작가가 승인 후 등록된 본문은 보존, 큐의 흔적만 제거.
     *
     * <p>pending 상태 suggestion 도 삭제 가능 — 작가가 검토 거부 의사로 즉시 제거하고 싶을 수 있음.
     */
    @Transactional
    public void delete(UUID writerId, UUID suggestionId) {
        int affected = jdbc.update(
                "DELETE FROM extraction_suggestion WHERE id = ? AND writer_id = ?",
                suggestionId, writerId
        );
        if (affected == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "suggestion not found");
        }
        log.info("[AGENT-SUGGESTION] writer={} suggestion={} deleted", writerId, suggestionId);
    }

    private Object parseJson(String s) {
        if (s == null) return Map.of();
        try {
            return objectMapper.readValue(s, Object.class);
        } catch (Exception e) {
            return Map.of();
        }
    }
}
