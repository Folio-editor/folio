package com.storyzip.ai.controller;

import com.storyzip.ai.client.AiClient;
import com.storyzip.ai.client.dto.HealthResponse;
import com.storyzip.ai.client.dto.PingEnqueuedResponse;
import com.storyzip.ai.client.dto.PingResultResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Spring ↔ FastAPI 배선 확인용 dev 전용 컨트롤러.
 * prod 프로필에서는 빈이 등록되지 않는다.
 */
@RestController
@RequestMapping("/api/v1/_dev/ai")
@RequiredArgsConstructor
@Profile("dev")
public class AiDevController {

    private final AiClient aiClient;

    @GetMapping("/health")
    public HealthResponse health() {
        return aiClient.health();
    }

    @PostMapping("/ping")
    public PingEnqueuedResponse ping(@RequestBody(required = false) Map<String, String> body) {
        String msg = (body == null) ? "hello" : body.getOrDefault("msg", "hello");
        return aiClient.enqueuePing(msg);
    }

    @GetMapping("/ping/{taskId}")
    public PingResultResponse pingResult(@PathVariable String taskId) {
        return aiClient.getPingResult(taskId);
    }
}
