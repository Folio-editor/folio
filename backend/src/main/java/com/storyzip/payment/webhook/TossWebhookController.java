package com.storyzip.payment.webhook;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.payment.config.TossPaymentsProperties;
import com.storyzip.payment.domain.PaymentEvent;
import com.storyzip.payment.repository.PaymentEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;

/**
 * 토스페이먼츠 웹훅 수신.
 *
 * <p>서명 검증: 토스가 보내는 {@code Toss-Signature} 헤더를
 * HMAC-SHA256(webhookSecret, requestBody)과 비교해 위변조를 차단한다.
 * webhookSecret이 비어있으면 위조 webhook이 통과될 수 있어 즉시 거절한다.
 *
 * <p>멱등성 전략: event_id에 UNIQUE 제약이 걸린 {@code payment_event}에 먼저 INSERT.
 * 중복이면 UNIQUE 위반 예외가 발생하고, 이미 처리한 이벤트로 간주해 200만 반환한다.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/payments/webhook/toss")
@RequiredArgsConstructor
public class TossWebhookController {

    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final PaymentEventRepository paymentEventRepository;
    private final ObjectMapper objectMapper;
    private final TossPaymentsProperties properties;

    @PostMapping
    @Transactional
    public ResponseEntity<Void> receive(
            @RequestHeader(value = "Toss-Signature", required = false) String signature,
            @RequestBody String rawBody) {

        verifySignature(signature, rawBody);

        JsonNode body;
        try {
            body = objectMapper.readTree(rawBody);
        } catch (Exception e) {
            log.warn("Webhook body parse failed", e);
            return ResponseEntity.ok().build();
        }

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

    private void verifySignature(String signature, String payload) {
        String secret = properties.webhookSecret();
        if (secret == null || secret.isBlank()) {
            // secret이 비어있으면 검증을 우회하지 않고 거절한다 — 위조 webhook 차단.
            // prod에서 Doppler에 TOSS_WEBHOOK_SECRET 설정 누락 시 즉시 드러난다.
            log.error("[WEBHOOK_SECRET_MISSING] Toss webhook secret is not configured — rejecting request");
            throw new PaymentException(ErrorCode.WEBHOOK_SIGNATURE_INVALID, "Webhook secret not configured");
        }
        if (signature == null || signature.isBlank()) {
            throw new PaymentException(ErrorCode.WEBHOOK_SIGNATURE_INVALID, "Missing Toss-Signature header");
        }
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            String expected = Base64.getEncoder().encodeToString(
                    mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
            if (!MessageDigest.isEqual(
                    expected.getBytes(StandardCharsets.UTF_8),
                    signature.getBytes(StandardCharsets.UTF_8))) {
                throw new PaymentException(ErrorCode.WEBHOOK_SIGNATURE_INVALID, "Signature mismatch");
            }
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new PaymentException(ErrorCode.INTERNAL_SERVER_ERROR, e);
        }
    }

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
