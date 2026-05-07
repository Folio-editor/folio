package com.storyzip.payment.dto;

/**
 * 결제 요청 생성 응답. 프론트는 paymentId로 PortOne SDK 결제창을 연다.
 *
 * <p>PortOne은 storeId/channelKey가 클라이언트 환경변수(VITE_PORTONE_*)로 주입되므로
 * 서버 응답에 별도 키를 포함하지 않는다.
 */
public record CreatePaymentResponse(
        String paymentId,
        String orderName,
        int amount,
        int tokenQty
) {
}
