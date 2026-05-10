package com.storyzip.ai.client.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * AI `/v1/quick/spellcheck` 요청 — 맞춤법 검사 + 결과를 extraction_suggestion(spelling_batch)
 * 큐로 적재하는 통합 흐름.
 *
 * <p>request body 는 SpellcheckRequest 와 동일 — work/writer/episode + 본문 평문 + 컨텍스트.
 * 응답에는 suggestion_id 필드가 추가되어 신규 적재된 큐 행 식별자를 알려준다.
 */
public record QuickSpellcheckRequest(
        @JsonProperty("work_id") String workId,
        @JsonProperty("writer_id") String writerId,
        @JsonProperty("episode_id") String episodeId,
        String content,
        AiContextPayload context
) {
    @Override
    public String toString() {
        return "QuickSpellcheckRequest[workId=" + workId
                + ", writerId=" + writerId
                + ", episodeId=" + episodeId
                + ", contentLen=" + (content == null ? 0 : content.length())
                + ", context=" + (context == null ? "null" : "<redacted>")
                + "]";
    }
}
