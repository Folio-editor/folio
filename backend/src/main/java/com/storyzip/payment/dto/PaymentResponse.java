package com.storyzip.payment.dto;

import com.storyzip.payment.domain.Payment;
import com.storyzip.payment.domain.PaymentMethod;
import com.storyzip.payment.domain.PaymentStatus;
import com.storyzip.payment.domain.Refund;
import com.storyzip.payment.domain.RefundReason;
import com.storyzip.payment.domain.RefundStatus;
import com.storyzip.payment.domain.RefundType;

import java.time.LocalDateTime;
import java.util.List;
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
        LocalDateTime createdAt,
        String refundPolicyVersion,
        LocalDateTime refundPolicyAgreedAt,
        /** 가장 최근 환불 신청. 없으면 null. 결제 이력 화면에서 환불 가능 여부/상태 배지에 사용. */
        RefundSummary latestRefund
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
                p.getCreatedAt(),
                p.getRefundPolicyVersion(),
                p.getRefundPolicyAgreedAt(),
                null
        );
    }

    public static PaymentResponse from(Payment p, List<Refund> refunds) {
        Refund latest = refunds.isEmpty() ? null : refunds.get(refunds.size() - 1);
        return new PaymentResponse(
                p.getId(),
                p.getOrderId(),
                p.getPaymentKey(),
                p.getAmount(),
                p.getTokenQty(),
                p.getStatus(),
                p.getMethod(),
                p.getApprovedAt(),
                p.getCreatedAt(),
                p.getRefundPolicyVersion(),
                p.getRefundPolicyAgreedAt(),
                latest == null ? null : RefundSummary.from(latest)
        );
    }

    public record RefundSummary(
            UUID refundId,
            RefundStatus status,
            RefundType refundType,
            RefundReason reason,
            int refundAmount,
            int tokenDeducted,
            LocalDateTime requestedAt,
            LocalDateTime processedAt
    ) {
        public static RefundSummary from(Refund r) {
            return new RefundSummary(
                    r.getId(),
                    r.getStatus(),
                    r.getRefundType(),
                    r.getReason(),
                    r.getRefundAmount(),
                    r.getTokenDeducted(),
                    r.getRequestedAt(),
                    r.getProcessedAt()
            );
        }
    }
}
