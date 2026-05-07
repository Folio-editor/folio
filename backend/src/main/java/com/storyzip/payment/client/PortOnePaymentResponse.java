package com.storyzip.payment.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.OffsetDateTime;

/**
 * 포트원 V2 결제 단건 조회/빌링 결제 응답 — {@code GET /payments/{paymentId}}
 * 또는 {@code POST /payments/{paymentId}/billing-key}.
 *
 * <p>Status 값: {@code READY}, {@code PENDING}, {@code VIRTUAL_ACCOUNT_ISSUED},
 * {@code PAID}, {@code FAILED}, {@code PARTIAL_CANCELLED}, {@code CANCELLED}.
 *
 * <p>amount는 중첩 객체이며 total을 결제 검증에 사용한다.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record PortOnePaymentResponse(
        String id,
        String status,
        String orderName,
        Amount amount,
        String currency,
        OffsetDateTime paidAt,
        Method method,
        String channelKey,
        String pgCode,
        String pgMessage
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Amount(Integer total, Integer paid, Integer cancelled) {}

    /**
     * 포트원의 결제 수단 정보 — {@code type} 필드로 분기.
     * 카카오페이는 {@code "PaymentMethodEasyPay"} + provider {@code "KAKAOPAY"}.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Method(String type, String provider) {}
}
