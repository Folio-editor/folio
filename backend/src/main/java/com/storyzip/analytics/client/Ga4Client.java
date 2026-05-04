package com.storyzip.analytics.client;

import com.storyzip.analytics.config.Ga4Properties;
import com.storyzip.analytics.dto.AnalyticsEventRequest.EventPayload;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
@RequiredArgsConstructor
public class Ga4Client {

    private final Ga4Properties properties;
    private final RestClient.Builder restClientBuilder;

    public void send(UUID writerId, String clientId, EventPayload event, Map<String, Object> params) {
        if (!properties.canSend()) {
            throw new IllegalStateException("GA4 is not configured");
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("client_id", resolveClientId(writerId, clientId, event.id()));
        if (writerId != null) {
            body.put("user_id", writerId.toString());
        }
        body.put("events", java.util.List.of(Map.of(
                "name", event.name(),
                "params", params
        )));

        restClientBuilder.build()
                .post()
                .uri(collectUri())
                .body(body)
                .retrieve()
                .toBodilessEntity();
    }

    private URI collectUri() {
        String base = properties.endpoint() != null && !properties.endpoint().isBlank()
                ? properties.endpoint()
                : "https://www.google-analytics.com/mp/collect";
        return URI.create(base
                + "?measurement_id=" + properties.measurementId()
                + "&api_secret=" + properties.apiSecret());
    }

    private String resolveClientId(UUID writerId, String clientId, UUID eventId) {
        if (clientId != null && !clientId.isBlank()) {
            return clientId;
        }
        if (writerId != null) {
            return writerId.toString();
        }
        return "anonymous." + eventId;
    }
}
