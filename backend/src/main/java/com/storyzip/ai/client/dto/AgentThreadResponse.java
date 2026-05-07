package com.storyzip.ai.client.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record AgentThreadResponse(
        @JsonProperty("thread_id") String threadId,
        @JsonProperty("scenario") String scenario,
        @JsonProperty("title") String title
) {}
