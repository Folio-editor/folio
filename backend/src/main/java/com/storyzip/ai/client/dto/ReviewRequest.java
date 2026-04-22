package com.storyzip.ai.client.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record ReviewRequest(
        @JsonProperty("work_id") String workId,
        @JsonProperty("writer_id") String writerId,
        @JsonProperty("episode_id") String episodeId,
        String content,
        @JsonProperty("episode_number") int episodeNumber
) {}
