package com.storyzip.payment.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 결제 승인 요청. 프론트는 토스 결제창에서 받은 paymentKey·orderId·amount를 그대로 전달한다.
 *
 * <p>서버는 {@code orderId}로 DB를 조회해 {@code amount}가 일치하는지 재확인한 뒤
 * 토스 승인 API를 호출한다 (위·변조 방지).
 */
public record ConfirmPaymentRequest(
        @NotBlank String paymentKey,
        @NotBlank String orderId,
        @NotNull Integer amount
) {
}
