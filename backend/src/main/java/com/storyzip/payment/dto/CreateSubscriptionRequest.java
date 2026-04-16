package com.storyzip.payment.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 구독 신청 — 프론트에서 토스 빌링 인증 성공 후 받은 {@code authKey}와
 * 신청 시 서버에서 미리 내려준 {@code customerKey}를 함께 보낸다.
 */
public record CreateSubscriptionRequest(
        @NotBlank String planCode,
        @NotBlank String authKey,
        @NotBlank String customerKey
) {
}
