package com.storyzip.ai.client.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record ReviewRequest(
        @JsonProperty("work_id") String workId,
        @JsonProperty("writer_id") String writerId,
        @JsonProperty("episode_id") String episodeId,
        String content,
        @JsonProperty("episode_number") int episodeNumber,
        // PR5 — 클라이언트 평문 RAG 컨텍스트.
        AiContextPayload context
) {
    // 기본 record toString이 본문/컨텍스트 평문을 그대로 찍지 않게 차단.
    // Plan C 옵션 1 — 운영자도 로그에서 원고를 볼 수 없어야 한다.
    @Override
    public String toString() {
        return "ReviewRequest[workId=" + workId
                + ", writerId=" + writerId
                + ", episodeId=" + episodeId
                + ", episodeNumber=" + episodeNumber
                + ", contentLen=" + (content == null ? 0 : content.length())
                + ", context=" + (context == null ? "null" : "<redacted>")
                + "]";
    }
}
