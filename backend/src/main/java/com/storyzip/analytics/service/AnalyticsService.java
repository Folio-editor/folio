package com.storyzip.analytics.service;

import com.storyzip.analytics.client.Ga4Client;
import com.storyzip.analytics.config.Ga4Properties;
import com.storyzip.analytics.domain.AnalyticsEventDedup;
import com.storyzip.analytics.dto.AnalyticsEventRequest;
import com.storyzip.analytics.dto.AnalyticsEventRequest.EventPayload;
import com.storyzip.analytics.dto.AnalyticsEventResponse;
import com.storyzip.analytics.dto.AnalyticsEventResponse.RejectedEvent;
import com.storyzip.analytics.repository.AnalyticsEventDedupRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalyticsService {

    private final AnalyticsEventDedupRepository dedupRepository;
    private final Ga4Client ga4Client;
    private final Ga4Properties ga4Properties;

    public AnalyticsEventResponse ingest(UUID writerId, AnalyticsEventRequest request) {
        List<UUID> accepted = new ArrayList<>();
        List<RejectedEvent> rejected = new ArrayList<>();

        for (EventPayload event : request.events()) {
            String rejectionReason = validate(event);
            if (rejectionReason != null) {
                rejected.add(new RejectedEvent(event.id(), rejectionReason));
                continue;
            }

            if (!insertDedup(writerId, request.clientId(), event)) {
                accepted.add(event.id());
                continue;
            }

            try {
                ga4Client.send(writerId, request.clientId(), event, sanitizeParams(event));
                accepted.add(event.id());
            } catch (Exception e) {
                dedupRepository.deleteById(event.id());
                log.warn("GA4 send failed. eventId={} eventName={} reason={}",
                        event.id(), event.name(), e.getMessage());
                rejected.add(new RejectedEvent(event.id(), "ga4_send_failed"));
            }
        }

        return new AnalyticsEventResponse(accepted, rejected);
    }

    private boolean insertDedup(UUID writerId, String clientId, EventPayload event) {
        try {
            dedupRepository.saveAndFlush(AnalyticsEventDedup.builder()
                    .eventId(event.id())
                    .writerId(writerId)
                    .clientId(clientId)
                    .eventName(event.name())
                    .build());
            return true;
        } catch (DataIntegrityViolationException e) {
            return false;
        }
    }

    private String validate(EventPayload event) {
        if (!AnalyticsEventSpec.isAllowedEvent(event.name())) {
            return "unknown_event_name";
        }
        if (event.params() == null) {
            return null;
        }
        for (String paramName : event.params().keySet()) {
            if (!AnalyticsEventSpec.isAllowedParam(event.name(), paramName)) {
                return "unknown_param:" + paramName;
            }
        }
        return null;
    }

    private Map<String, Object> sanitizeParams(EventPayload event) {
        Map<String, Object> params = new LinkedHashMap<>();
        if (event.params() == null) {
            return params;
        }

        for (Map.Entry<String, Object> entry : event.params().entrySet()) {
            Object value = entry.getValue();
            if (value instanceof String || value instanceof Number || value instanceof Boolean) {
                params.put(entry.getKey(), value);
            }
        }
        if (ga4Properties.debugMode()) {
            params.put("debug_mode", true);
        }
        return params;
    }
}
