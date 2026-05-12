package com.storyzip.ai.client.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * AI `/v1/quick/summarize` 요청 — 단발 회차 요약 생성 (Sonnet 우회, Haiku 1회).
 *
 * <p>spellcheck 와 달리 본문 평문은 AI 측이 Vault Transit 으로 직접 fetch 하므로
 * 평문/컨텍스트 전송 X. work/writer/sort_order 만 식별자로 전달.
 */
public record QuickSummarizeRequest(
        @JsonProperty("work_id") String workId,
        @JsonProperty("writer_id") String writerId,
        @JsonProperty("sort_order") int sortOrder,
        @JsonProperty("force_regenerate") boolean forceRegenerate
) {
}
