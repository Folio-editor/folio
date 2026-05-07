package com.storyzip.payment.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 결제 검증 요청 — 프론트는 PortOne SDK 결제 완료 후 paymentId만 전달한다.
 *
 * <p>서버는 paymentId로 PortOne 단건조회 → DB의 amount/status와 비교해 위변조를 검증한다.
 * 토스와 달리 paymentKey 같은 별도 인증값이 없다.
 */
public record ConfirmPaymentRequest(
        @NotBlank String paymentId
) {
}
