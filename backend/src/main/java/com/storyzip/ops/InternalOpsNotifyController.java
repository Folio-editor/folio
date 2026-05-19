package com.storyzip.ops;

import com.storyzip.ai.client.AiClientProperties;
import com.storyzip.common.notification.EmailNotifier;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * 운영 스크립트 (cron 백업, vault-init 등) → backend 운영자 알림 채널.
 *
 * <p>인증: X-Internal-Api-Key 헤더 (AI 서버 ↔ backend 공유 시크릿 재사용).
 * SecurityConfig 의 PUBLIC_ENDPOINTS 에 /internal/** 등재됨.
 *
 * <p>EmailNotifier 가 메일 설정 미주입 시 조용히 skip 하므로 dev/test 에서도 안전.
 */
@Slf4j
@RestController
@RequestMapping("/internal/ops")
@RequiredArgsConstructor
public class InternalOpsNotifyController {

    private final EmailNotifier emailNotifier;
    private final AiClientProperties aiClientProperties;

    public record NotifyRequest(String subject, String body) {}

    @PostMapping("/notify")
    public ResponseEntity<Void> notifyOperator(
            @RequestBody NotifyRequest req,
            @RequestHeader(value = "X-Internal-Api-Key", required = false) String apiKey
    ) {
        if (apiKey == null || !apiKey.equals(aiClientProperties.getInternalApiKey())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "internal api key required");
        }
        if (req == null || req.subject() == null || req.subject().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "subject required");
        }
        String body = req.body() == null ? "" : req.body();
        log.info("[OPS_NOTIFY] subject={} bodyLen={}", req.subject(), body.length());
        emailNotifier.notifyOperator(req.subject(), body);
        return ResponseEntity.noContent().build();
    }
}
