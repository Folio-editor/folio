package com.storyzip.ai.client.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record DraftRequest(
        @JsonProperty("work_id") String workId,
        @JsonProperty("writer_id") String writerId,
        @JsonProperty("episode_id") String episodeId,
        String storyline,
        @JsonProperty("current_episode_num") int currentEpisodeNum,
        String model,
        @JsonProperty("user_prompt") String userPrompt
) {}
