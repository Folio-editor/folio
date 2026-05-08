package com.storyzip.ai.client.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

/**
 * AI 서버 /v1/agent/threads/{tid}/messages (동기) 응답.
 * 모든 필드 snake_case 양방향 매핑.
 */
public record AgentRunResponse(
        @JsonProperty("thread_id") String threadId,
        @JsonProperty("scenario") String scenario,
        @JsonProperty("status") String status,
        @JsonProperty("answer") String answer,
        @JsonProperty("suggestion_ids") List<String> suggestionIds,
        @JsonProperty("receipt") Map<String, Object> receipt,
        @JsonProperty("duration_ms") Integer durationMs,
        @JsonProperty("budget") Map<String, Object> budget
) {}
