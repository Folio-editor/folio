package com.storyzip.analytics.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ga4")
public record Ga4Properties(
        boolean enabled,
        String measurementId,
        String apiSecret,
        String endpoint,
        String debugEndpoint,
        boolean debugMode
) {
    public boolean canSend() {
        if (!enabled) {
            return false;
        }
        return measurementId != null && !measurementId.isBlank()
                && apiSecret != null && !apiSecret.isBlank();
    }
}
