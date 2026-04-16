package com.storyzip.payment.dto;

import java.util.UUID;

public record RefundResponse(
        UUID paymentId,
        String orderId,
        int originalAmount,
        int refundAmount,
        int tokenDeducted,
        String refundType
) {
}
