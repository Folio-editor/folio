package com.storyzip.payment.webhook;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.storyzip.payment.domain.PaymentEvent;
import com.storyzip.payment.repository.PaymentEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 토스페이먼츠 웹훅 수신.
 *
 * <p>멱등성 전략: event_id에 UNIQUE 제약이 걸린 {@code payment_event}에 먼저 INSERT.
 * 중복이면 UNIQUE 위반 예외가 발생하고, 이미 처리한 이벤트로 간주해 200만 반환한다.
 *
 * <p>실제 결제 상태 반영(DB payment.status 동기화 등)은 후속 작업에서 이 로그를
 * 소비해 처리하는 방식으로 확장. MVP에서는 수신·기록까지만 담당.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/payments/webhook/toss")
@RequiredArgsConstructor
public class TossWebhookController {

    private final PaymentEventRepository paymentEventRepository;
    private final ObjectMapper objectMapper;

    @PostMapping
    @Transactional
    public ResponseEntity<Void> receive(@RequestBody JsonNode body) {
        String eventId = extractEventId(body);
        String eventType = body.path("eventType").asText("UNKNOWN");

        if (eventId == null) {
            log.warn("Webhook missing eventId: {}", body);
            return ResponseEntity.ok().build();
        }

        if (paymentEventRepository.existsByEventId(eventId)) {
            log.info("Duplicate webhook ignored: eventId={}", eventId);
            return ResponseEntity.ok().build();
        }

        try {
            paymentEventRepository.save(PaymentEvent.builder()
                    .eventId(eventId)
                    .eventType(eventType)
                    .payload(objectMapper.writeValueAsString(body))
                    .build());
            log.info("Webhook stored: eventId={}, eventType={}", eventId, eventType);
        } catch (DataIntegrityViolationException e) {
            log.info("Concurrent duplicate webhook: eventId={}", eventId);
        } catch (Exception e) {
            log.error("Webhook persist failed: eventId={}", eventId, e);
            throw new RuntimeException(e);
        }

        return ResponseEntity.ok().build();
    }

    /**
     * 토스가 내려주는 이벤트 식별자를 추출.
     * 실제 스펙에서는 헤더 혹은 eventId 필드로 내려오지만, 없을 경우 결제 식별자를 사용해 키로 삼는다.
     */
    private String extractEventId(JsonNode body) {
        String direct = body.path("eventId").asText(null);
        if (direct != null && !direct.isBlank()) return direct;

        String paymentKey = body.path("data").path("paymentKey").asText(null);
        String status = body.path("data").path("status").asText(null);
        if (paymentKey != null && status != null) {
            return paymentKey + ":" + status;
        }
        return null;
    }
}
