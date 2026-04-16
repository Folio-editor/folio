package com.storyzip.payment.scheduler;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.storyzip.payment.domain.Payment;
import com.storyzip.payment.domain.PaymentEvent;
import com.storyzip.payment.repository.PaymentEventRepository;
import com.storyzip.payment.repository.PaymentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 토스 웹훅 이벤트를 소비해 Payment 상태를 동기화한다.
 *
 * <p>30초 간격으로 미소비({@code consumed=false}) 이벤트를 조회하고,
 * 이벤트 타입에 따라 Payment 엔티티의 상태를 갱신한다.
 *
 * <p>처리 대상:
 * <ul>
 *   <li>{@code PAYMENT_STATUS_CHANGED} — 토스 측 결제 상태 변경 (취소, 실패 등)</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentEventProcessor {

    private final PaymentEventRepository paymentEventRepository;
    private final PaymentRepository paymentRepository;
    private final ObjectMapper objectMapper;

    @Scheduled(fixedDelay = 30_000)
    public void processUnconsumedEvents() {
        List<PaymentEvent> events = paymentEventRepository.findByConsumedFalseOrderByProcessedAtAsc();
        if (events.isEmpty()) return;

        int success = 0;
        int failure = 0;

        for (PaymentEvent event : events) {
            try {
                processEvent(event);
                success++;
            } catch (Exception e) {
                failure++;
                log.error("Failed to process event: eventId={}, type={}",
                        event.getEventId(), event.getEventType(), e);
            }
        }

        if (success + failure > 0) {
            log.info("PaymentEvent processing complete: success={}, failure={}", success, failure);
        }
    }

    @Transactional
    public void processEvent(PaymentEvent event) {
        JsonNode payload;
        try {
            payload = objectMapper.readTree(event.getPayload());
        } catch (Exception e) {
            log.warn("Invalid payload for eventId={}", event.getEventId());
            event.markConsumed();
            return;
        }

        JsonNode data = payload.path("data");
        String paymentKey = data.path("paymentKey").asText(null);
        String tossStatus = data.path("status").asText(null);

        if (paymentKey == null || tossStatus == null) {
            log.debug("Event has no paymentKey/status, marking consumed: eventId={}", event.getEventId());
            event.markConsumed();
            return;
        }

        paymentRepository.findByPaymentKey(paymentKey).ifPresentOrElse(
                payment -> {
                    syncPaymentStatus(payment, tossStatus, data);
                    event.markConsumed();
                    log.info("Event consumed: eventId={}, paymentKey={}, tossStatus={}",
                            event.getEventId(), paymentKey, tossStatus);
                },
                () -> {
                    log.debug("No matching payment for paymentKey={}, marking consumed", paymentKey);
                    event.markConsumed();
                }
        );
    }

    private void syncPaymentStatus(Payment payment, String tossStatus, JsonNode data) {
        switch (tossStatus) {
            case "CANCELED" -> {
                if (!payment.isDone()) return;
                String cancelReason = data.path("cancels").isArray() && data.path("cancels").size() > 0
                        ? data.path("cancels").get(0).path("cancelReason").asText("토스 측 취소")
                        : "토스 측 취소";
                payment.markCanceled(cancelReason);
                log.info("Payment canceled via webhook: paymentKey={}, reason={}",
                        payment.getPaymentKey(), cancelReason);
            }
            case "ABORTED", "EXPIRED" -> {
                if (payment.isDone()) return;
                String reason = data.path("failure").path("message").asText("토스 측 " + tossStatus);
                payment.markFailed(reason);
                log.info("Payment failed via webhook: paymentKey={}, tossStatus={}",
                        payment.getPaymentKey(), tossStatus);
            }
            default -> log.debug("Unhandled toss status: {}", tossStatus);
        }
    }
}
