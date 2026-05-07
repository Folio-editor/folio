package com.storyzip.agent.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record ReceiptCallbackResponse(
        @JsonProperty("receipt_id") String receiptId,
        @JsonProperty("charged") int charged,
        @JsonProperty("balance") int balance,
        @JsonProperty("partial") boolean partial
) {}
