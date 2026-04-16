package com.storyzip.ai.client.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record EpisodePipelineRequest(
        @JsonProperty("episode_id") String episodeId,
        @JsonProperty("work_id") String workId,
        @JsonProperty("writer_id") String writerId,
        String content
) {}
