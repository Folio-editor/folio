package com.storyzip.payment.dto;

import com.storyzip.payment.domain.RefundReason;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 환불 요청 본문.
 *
 * <p>사유 코드(reason)는 필수, 자유 사유(detail)는 선택. CS 분석/통계용으로 사유 코드를 분류한다.
 */
public record RefundRequest(
        @NotNull RefundReason reason,
        @Size(max = 500) String detail
) {
}
