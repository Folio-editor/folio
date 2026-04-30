package com.storyzip.analytics.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record AnalyticsEventRequest(
        @Size(max = 120)
        String clientId,

        @NotEmpty
        @Size(max = 50)
        List<@Valid EventPayload> events
) {
    public record EventPayload(
            @NotNull
            UUID id,

            @NotBlank
            @Size(max = 80)
            String name,

            Map<String, Object> params,

            @NotNull
            Instant createdAt
    ) {
    }
}
