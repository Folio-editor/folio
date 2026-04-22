package com.storyzip.payment.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.OffsetDateTime;

/**
 * 토스페이먼츠 결제 승인 API 응답 (필요한 필드만 매핑).
 *
 * <p>전체 스펙: <a href="https://docs.tosspayments.com/reference#payment">토스 레퍼런스</a>
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record TossConfirmResponse(
        String paymentKey,
        String orderId,
        String status,
        String method,
        Integer totalAmount,
        OffsetDateTime approvedAt
) {
}
