package com.storyzip.ai.client.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record SpellcheckRequest(
        @JsonProperty("work_id") String workId,
        @JsonProperty("writer_id") String writerId,
        @JsonProperty("episode_id") String episodeId,
        String content,
        AiContextPayload context
) {
    @Override
    public String toString() {
        return "SpellcheckRequest[workId=" + workId
                + ", writerId=" + writerId
                + ", episodeId=" + episodeId
                + ", contentLen=" + (content == null ? 0 : content.length())
                + ", context=" + (context == null ? "null" : "<redacted>")
                + "]";
    }
}
