package com.storyzip.payment.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;

/**
 * 결제 요청 생성. 프론트엔드는 패키지 코드 + 환불 규정 동의 정보를 보내고, 금액·수량은 서버가 확정한다.
 *
 * <p>{@code agreeRefundPolicy=true} 이고 {@code refundPolicyVersion}이 서버 현재 버전과 일치해야
 * 결제가 진행된다. 동의 정보는 {@code payment.refund_policy_*} 컬럼에 영구 보관된다.
 */
public record CreatePaymentRequest(
        @NotBlank String packageCode,
        @AssertTrue(message = "환불 규정에 동의해야 결제할 수 있습니다") boolean agreeRefundPolicy,
        @NotBlank String refundPolicyVersion
) {
}
