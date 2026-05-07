package com.storyzip.payment.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 구독 신청 — PortOne SDK가 카드 등록 성공 시 직접 반환한 {@code billingKey}와
 * prepare 단계에서 발급된 {@code customerKey}를 함께 전달한다.
 *
 * <p>토스와 달리 authKey → billingKey 교환 단계가 없다 (SDK가 직접 billingKey 반환).
 */
public record CreateSubscriptionRequest(
        @NotBlank String planCode,
        @NotBlank String billingKey,
        @NotBlank String customerKey
) {
}
