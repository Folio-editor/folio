package com.storyzip.analytics.dto;

import java.util.List;
import java.util.UUID;

public record AnalyticsEventResponse(
        List<UUID> accepted,
        List<RejectedEvent> rejected
) {
    public record RejectedEvent(
            UUID id,
            String reason
    ) {
    }
}
