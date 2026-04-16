package com.storyzip.payment.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 결제 요청 생성. 프론트엔드는 패키지 코드만 보내고, 금액·수량은 서버가 확정한다.
 */
public record CreatePaymentRequest(
        @NotBlank String packageCode
) {
}
