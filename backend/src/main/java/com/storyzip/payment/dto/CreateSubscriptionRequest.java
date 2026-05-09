package com.storyzip.payment.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;

/**
 * 구독 신청 — PortOne SDK가 카드 등록 성공 시 직접 반환한 {@code billingKey}와
 * prepare 단계에서 발급된 {@code customerKey}를 함께 전달한다.
 *
 * <p>토스와 달리 authKey → billingKey 교환 단계가 없다 (SDK가 직접 billingKey 반환).
 *
 * <p>구독 결제도 결제이므로 환불 규정 동의가 필수다 ({@code agreeRefundPolicy=true} +
 * {@code refundPolicyVersion} 일치).
 */
public record CreateSubscriptionRequest(
        @NotBlank String planCode,
        @NotBlank String billingKey,
        @NotBlank String customerKey,
        @AssertTrue(message = "환불 규정에 동의해야 구독할 수 있습니다") boolean agreeRefundPolicy,
        @NotBlank String refundPolicyVersion
) {
}
