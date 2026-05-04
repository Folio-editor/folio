package com.storyzip.ai.client.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record DraftRequest(
        @JsonProperty("work_id") String workId,
        @JsonProperty("writer_id") String writerId,
        @JsonProperty("episode_id") String episodeId,
        String storyline,
        @JsonProperty("current_episode_num") int currentEpisodeNum,
        String model,
        @JsonProperty("user_prompt") String userPrompt,
        // PR5 — 클라이언트가 KEK + work_key로 평문화한 RAG 컨텍스트.
        // Spring은 검사·로깅 없이 FastAPI로 그대로 pass-through.
        AiContextPayload context
) {
    // 기본 record toString은 모든 필드를 그대로 찍어 평문 원고/스토리라인이 로그에 흘러나갈 수 있다.
    // Plan C 옵션 1 보안 모델 — 운영자가 로그에서도 평문을 볼 수 없게 본문성 필드는 길이만 노출.
    @Override
    public String toString() {
        return "DraftRequest[workId=" + workId
                + ", writerId=" + writerId
                + ", episodeId=" + episodeId
                + ", currentEpisodeNum=" + currentEpisodeNum
                + ", model=" + model
                + ", storylineLen=" + (storyline == null ? 0 : storyline.length())
                + ", userPromptLen=" + (userPrompt == null ? 0 : userPrompt.length())
                + ", context=" + (context == null ? "null" : "<redacted>")
                + "]";
    }
}
