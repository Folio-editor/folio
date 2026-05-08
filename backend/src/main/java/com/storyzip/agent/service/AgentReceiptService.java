package com.storyzip.agent.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.storyzip.agent.dto.ReceiptCallbackRequest;
import com.storyzip.agent.dto.ReceiptCallbackResponse;
import com.storyzip.payment.service.TokenWalletService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Phase 4 §L — 영수증 발행 + 잔액 차감.
 *
 * <p>흐름 (단일 트랜잭션):
 *   1) idempotency_key 중복 시 기존 receipt 반환
 *   2) token_receipt INSERT
 *   3) token_receipt_line N개 batch INSERT
 *   4) TokenWalletService.useBestEffort 로 잔액 차감 (실 사용량 100%)
 *   5) 차감 실 < total 이면 status='partial', abort_reason='balance_exhausted'
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AgentReceiptService {

    private final JdbcTemplate jdbc;
    private final TokenWalletService walletService;
    private final ObjectMapper objectMapper;

    @Transactional
    public ReceiptCallbackResponse issueReceipt(ReceiptCallbackRequest req) {
        UUID writerId = UUID.fromString(req.writerId());
        UUID workId = req.workId() != null ? UUID.fromString(req.workId()) : null;
        UUID referenceId = UUID.fromString(req.referenceId());

        // work 소유권 검증 — AI 가 잘못된 work_id 를 보내도 영수증 무결성 보장
        if (workId != null) {
            Integer match = jdbc.queryForObject(
                    "SELECT count(*) FROM work WHERE id = ? AND writer_id = ?",
                    Integer.class, workId, writerId
            );
            if (match == null || match == 0) {
                log.warn("[AGENT-RECEIPT] work_id mismatch — recording without work_id. " +
                        "writer={} work={}", writerId, workId);
                workId = null;     // 영수증은 발행하되 work_id 는 기록하지 않음
            }
        }

        // ── 1. 멱등성 — 동일 idempotency_key 면 기존 영수증 echo
        if (req.idempotencyKey() != null) {
            var existing = jdbc.query(
                    "SELECT id, total_user_tokens FROM token_receipt WHERE idempotency_key = ?",
                    rs -> rs.next() ? new Object[]{rs.getObject("id", UUID.class), rs.getInt("total_user_tokens")} : null,
                    req.idempotencyKey()
            );
            if (existing != null) {
                UUID rid = (UUID) existing[0];
                int charged = (int) existing[1];
                int balance = currentBalance(writerId);
                log.info("[AGENT-RECEIPT] idempotent_replay receipt={} charged={}", rid, charged);
                return new ReceiptCallbackResponse(rid.toString(), charged, balance, false);
            }
        }

        UUID receiptId = UUID.randomUUID();
        String status = req.status();
        String abortReason = req.abortReason();

        // ── 2. INSERT header
        try {
            jdbc.update(
                    "INSERT INTO token_receipt (" +
                            "id, writer_id, work_id, feature, scenario, reference_type, reference_id, " +
                            "total_user_tokens, total_input_raw, total_output_raw, " +
                            "cache_read_tokens, cache_create_tokens, status, abort_reason, duration_ms, idempotency_key" +
                            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    receiptId, writerId, workId, req.feature(), req.scenario(),
                    req.referenceType(), referenceId,
                    req.totalUserTokens(), req.totalInputRaw(), req.totalOutputRaw(),
                    req.cacheReadTokens(), req.cacheCreateTokens(),
                    status, abortReason, req.durationMs(), req.idempotencyKey()
            );
        } catch (DuplicateKeyException e) {
            // race — 동시 호출 시 idempotency_key 충돌, 다시 lookup
            var existing = jdbc.query(
                    "SELECT id, total_user_tokens FROM token_receipt WHERE idempotency_key = ?",
                    rs -> rs.next() ? new Object[]{rs.getObject("id", UUID.class), rs.getInt("total_user_tokens")} : null,
                    req.idempotencyKey()
            );
            if (existing == null) throw e;
            return new ReceiptCallbackResponse(((UUID) existing[0]).toString(),
                    (int) existing[1], currentBalance(writerId), false);
        }

        // ── 3. INSERT lines (batch)
        List<Map<String, Object>> lines = req.lines() != null ? req.lines() : List.of();
        if (!lines.isEmpty()) {
            jdbc.batchUpdate(
                    "INSERT INTO token_receipt_line (" +
                            "receipt_id, seq, step_type, actor, tool_name, " +
                            "input_tokens, output_tokens, user_tokens, detail" +
                            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb))",
                    lines,
                    lines.size(),
                    (ps, line) -> {
                        ps.setObject(1, receiptId);
                        ps.setInt(2, ((Number) line.getOrDefault("seq", 0)).intValue());
                        ps.setString(3, (String) line.get("step_type"));
                        ps.setString(4, (String) line.get("actor"));
                        ps.setString(5, (String) line.get("tool_name"));
                        ps.setInt(6, ((Number) line.getOrDefault("input_tokens", 0)).intValue());
                        ps.setInt(7, ((Number) line.getOrDefault("output_tokens", 0)).intValue());
                        ps.setInt(8, ((Number) line.getOrDefault("user_tokens", 0)).intValue());
                        ps.setString(9, toJson(line.getOrDefault("detail", Map.of())));
                    }
            );
        }

        // ── 4. 잔액 차감 (실 사용량 100%)
        int charged = 0;
        boolean partial = false;
        if (req.totalUserTokens() > 0) {
            charged = walletService.useBestEffort(
                    writerId, req.totalUserTokens(),
                    "AGENT_" + req.scenario().toUpperCase(),
                    receiptId
            );
            if (charged < req.totalUserTokens()) {
                partial = true;
                // status / abort_reason 보정
                jdbc.update(
                        "UPDATE token_receipt SET status='partial', abort_reason='balance_exhausted' " +
                                "WHERE id = ?",
                        receiptId
                );
            }
        }

        int balance = currentBalance(writerId);
        log.info(
                "[AGENT-RECEIPT] issued receipt={} writer={} feature={} scenario={} requested={} charged={} balance={} status={}",
                receiptId, writerId, req.feature(), req.scenario(),
                req.totalUserTokens(), charged, balance, partial ? "partial" : status
        );
        return new ReceiptCallbackResponse(receiptId.toString(), charged, balance, partial);
    }

    private int currentBalance(UUID writerId) {
        Integer balance = jdbc.queryForObject(
                "SELECT COALESCE(subscription_balance + bonus_balance + purchase_balance, 0) " +
                        "FROM token_wallet WHERE writer_id = ?",
                Integer.class, writerId
        );
        return balance != null ? balance : 0;
    }

    private String toJson(Object obj) {
        if (obj == null) return "{}";
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }
}
