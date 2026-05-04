package com.storyzip.ai.client.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * PR5 — 클라이언트가 KEK + work_key로 복호화한 평문 컨텍스트를 AI 서버로 pass-through.
 *
 * <p>Spring 백엔드는 이 페이로드를 절대 검사·로깅·영속화하지 않고 FastAPI로 그대로 전달한다.
 * vector_search 청크와 timeline은 평문 예외 영역이라 페이로드 비대상.
 */
public record AiContextPayload(
        @JsonProperty("work_meta") WorkMeta workMeta,
        List<Character> characters,
        @JsonProperty("world_notes") List<WorldNote> worldNotes,
        List<Foreshadow> foreshadows,
        List<Plot> plots,
        @JsonProperty("recent_episodes") List<RecentEpisode> recentEpisodes
) {
    // Spring은 페이로드를 검사·로깅·영속화하지 않는다(클래스 javadoc 약속). 그러나 record
    // 기본 toString은 중첩된 모든 평문 필드를 그대로 찍어 로그 한 줄로도 약속이 깨진다.
    // 디버깅에 필요한 카운트만 남기고 본문은 전부 차단.
    @Override
    public String toString() {
        return "AiContextPayload[characters=" + size(characters)
                + ", worldNotes=" + size(worldNotes)
                + ", foreshadows=" + size(foreshadows)
                + ", plots=" + size(plots)
                + ", recentEpisodes=" + size(recentEpisodes)
                + ", workMeta=" + (workMeta == null ? "null" : "<redacted>")
                + "]";
    }

    private static int size(List<?> list) {
        return list == null ? 0 : list.size();
    }

    public record WorkMeta(
            String title,
            @JsonProperty("author_name") String authorName,
            String description,
            String status
    ) {
        @Override public String toString() { return "WorkMeta[<redacted>, status=" + status + "]"; }
    }

    public record CharacterNote(
            String kind,
            String title,
            String content
    ) {
        @Override public String toString() { return "CharacterNote[kind=" + kind + ", <redacted>]"; }
    }

    public record CharacterCustomField(
            @JsonProperty("field_name") String fieldName,
            @JsonProperty("field_value") String fieldValue
    ) {
        @Override public String toString() { return "CharacterCustomField[<redacted>]"; }
    }

    public record Character(
            String id,
            String name,
            String gender,
            String age,
            List<CharacterNote> notes,
            @JsonProperty("custom_fields") List<CharacterCustomField> customFields
    ) {
        @Override public String toString() {
            return "Character[id=" + id
                    + ", notes=" + (notes == null ? 0 : notes.size())
                    + ", customFields=" + (customFields == null ? 0 : customFields.size())
                    + ", <redacted>]";
        }
    }

    public record WorldNote(
            String name,
            String content
    ) {
        @Override public String toString() { return "WorldNote[<redacted>]"; }
    }

    public record Foreshadow(
            String title,
            String status,
            String importance,
            String content
    ) {
        @Override public String toString() {
            return "Foreshadow[status=" + status + ", importance=" + importance + ", <redacted>]";
        }
    }

    public record Plot(
            String title,
            String content
    ) {
        @Override public String toString() { return "Plot[<redacted>]"; }
    }

    public record RecentEpisode(
            @JsonProperty("sort_order") int sortOrder,
            String title,
            String content
    ) {
        @Override public String toString() { return "RecentEpisode[sortOrder=" + sortOrder + ", <redacted>]"; }
    }
}
