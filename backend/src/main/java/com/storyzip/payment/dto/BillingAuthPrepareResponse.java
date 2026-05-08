package com.storyzip.payment.dto;

/**
 * 빌링 인증 준비 응답 — 프론트가 PortOne SDK {@code requestIssueBillingKey}에 넘길 값.
 *
 * <p>{@code customerKey}는 서버가 직접 발급해 내부 writer 식별자와 분리한다.
 * storeId/channelKey는 클라이언트 환경변수에서 직접 사용한다.
 */
public record BillingAuthPrepareResponse(
        String customerKey
) {
}
