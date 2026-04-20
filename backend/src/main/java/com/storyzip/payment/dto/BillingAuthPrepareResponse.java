package com.storyzip.payment.dto;

/**
 * 빌링 인증 준비 응답 — 프론트가 토스 SDK {@code requestBillingAuth}에 넘길 값.
 *
 * <p>{@code customerKey}는 서버가 직접 발급해 내부 writer 식별자와 분리한다.
 */
public record BillingAuthPrepareResponse(
        String customerKey,
        String clientKey
) {
}
