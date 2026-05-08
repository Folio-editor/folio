package com.storyzip.ai.client.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record AgentCreateThreadRequest(
        @JsonProperty("work_id") String workId,
        @JsonProperty("writer_id") String writerId,
        String scenario,
        String title
) {}
