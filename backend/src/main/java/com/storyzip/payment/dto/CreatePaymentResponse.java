package com.storyzip.payment.dto;

/**
 * 결제 요청 생성 응답. 프론트는 이 값들로 토스 결제창을 연다.
 */
public record CreatePaymentResponse(
        String orderId,
        String orderName,
        int amount,
        int tokenQty
) {
}
