package com.storyzip.payment.dto;

/**
 * 결제 요청 생성 응답. 프론트는 이 값들로 토스 결제창을 연다.
 *
 * <p>{@code clientKey}는 toss SDK 초기화에 사용. 구독 흐름의
 * {@link BillingAuthPrepareResponse}와 동일하게 prepare 응답에 포함하여
 * dev/prod 모두에서 단일 endpoint로 동작하도록 통일했다.
 */
public record CreatePaymentResponse(
        String orderId,
        String orderName,
        int amount,
        int tokenQty,
        String clientKey
) {
}
