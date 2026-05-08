package com.storyzip.agent.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

/**
 * AI 서버 → backend 영수증 발행 요청 (POST /internal/v1/token-receipts).
 * payload 는 ai/app/agent/budget.py BudgetTracker.to_receipt_payload 와 정합.
 */
public record ReceiptCallbackRequest(
        @JsonProperty("writer_id") String writerId,
        @JsonProperty("work_id") String workId,
        String feature,
        String scenario,
        @JsonProperty("reference_type") String referenceType,
        @JsonProperty("reference_id") String referenceId,
        @JsonProperty("total_user_tokens") int totalUserTokens,
        @JsonProperty("total_input_raw") int totalInputRaw,
        @JsonProperty("total_output_raw") int totalOutputRaw,
        @JsonProperty("cache_read_tokens") int cacheReadTokens,
        @JsonProperty("cache_create_tokens") int cacheCreateTokens,
        String status,
        @JsonProperty("abort_reason") String abortReason,
        @JsonProperty("duration_ms") Integer durationMs,
        @JsonProperty("idempotency_key") String idempotencyKey,
        List<Map<String, Object>> lines
) {}
