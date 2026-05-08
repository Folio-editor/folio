package com.storyzip.ai.client.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * AI 서버 /v1/agent/threads/{tid}/messages/async 응답.
 * snake_case (taskId vs task_id) 양방향 매핑 — JsonProperty 는 deserialize + serialize 둘 다 동작.
 */
public record AgentTaskResponse(
        @JsonProperty("task_id") String taskId,
        @JsonProperty("thread_id") String threadId,
        @JsonProperty("scenario") String scenario
) {}
