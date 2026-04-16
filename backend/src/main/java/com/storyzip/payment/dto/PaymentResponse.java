package com.storyzip.payment.dto;

import com.storyzip.payment.domain.Payment;
import com.storyzip.payment.domain.PaymentMethod;
import com.storyzip.payment.domain.PaymentStatus;

import java.time.LocalDateTime;
import java.util.UUID;

public record PaymentResponse(
        UUID id,
        String orderId,
        String paymentKey,
        int amount,
        int tokenQty,
        PaymentStatus status,
        PaymentMethod method,
        LocalDateTime approvedAt,
        LocalDateTime createdAt
) {
    public static PaymentResponse from(Payment p) {
        return new PaymentResponse(
                p.getId(),
                p.getOrderId(),
                p.getPaymentKey(),
                p.getAmount(),
                p.getTokenQty(),
                p.getStatus(),
                p.getMethod(),
                p.getApprovedAt(),
                p.getCreatedAt()
        );
    }
}
