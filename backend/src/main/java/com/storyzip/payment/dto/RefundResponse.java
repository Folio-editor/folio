package com.storyzip.payment.dto;

import com.storyzip.payment.domain.RefundReason;
import com.storyzip.payment.domain.RefundStatus;
import com.storyzip.payment.domain.RefundType;

import java.util.UUID;

public record RefundResponse(
        UUID paymentId,
        String orderId,
        int originalAmount,
        int refundAmount,
        int tokenDeducted,
        RefundType refundType,
        RefundReason reason,
        UUID refundId,
        RefundStatus status
) {
}
