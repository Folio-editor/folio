package com.storyzip.analytics.controller;

import com.storyzip.analytics.dto.AnalyticsEventRequest;
import com.storyzip.analytics.dto.AnalyticsEventResponse;
import com.storyzip.analytics.service.AnalyticsService;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/analytics")
@RequiredArgsConstructor
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    @PostMapping("/events")
    public ResponseEntity<AnalyticsEventResponse> ingest(
            Authentication authentication,
            @Valid @RequestBody AnalyticsEventRequest request) {
        return ResponseEntity.ok(analyticsService.ingest(optionalWriterId(authentication), request));
    }

    private UUID optionalWriterId(Authentication authentication) {
        if (authentication == null || authentication.getPrincipal() == null) {
            return null;
        }
        return UUID.fromString(authentication.getName());
    }
}
