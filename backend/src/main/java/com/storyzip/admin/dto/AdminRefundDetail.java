package com.storyzip.admin.dto;

import com.storyzip.payment.domain.Payment;
import com.storyzip.payment.domain.PaymentMethod;
import com.storyzip.payment.domain.PaymentStatus;
import com.storyzip.payment.domain.Refund;
import com.storyzip.payment.domain.RefundReason;
import com.storyzip.payment.domain.RefundStatus;
import com.storyzip.payment.domain.RefundType;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * 관리자 환불 검토 화면용 상세 응답.
 *
 * <p>운영자가 합리적 결정을 내리기 위해 필요한 컨텍스트를 한 번에 묶음:
 * <ul>
 *   <li>환불 신청 정보 (사유 코드 + 자유 사유 + 분류 + 금액)</li>
 *   <li>원본 결제 정보 (시각 / 결제수단 / paymentKey / 약관 동의 버전)</li>
 *   <li>작가 정보 (이메일 / 닉네임)</li>
 *   <li>경과 일수 자동 계산</li>
 *   <li>이전 거절 횟수 (재신청인지 여부)</li>
 * </ul>
 */
public record AdminRefundDetail(
        // ─ Refund ─
        UUID refundId,
        RefundStatus status,
        RefundReason reason,
        String detail,
        RefundType refundType,
        int refundAmount,
        int tokenDeducted,
        LocalDateTime requestedAt,
        LocalDateTime processedAt,
        String adminNote,
        long previousRejectedCount,

        // ─ Payment ─
        UUID paymentId,
        String orderId,
        String paymentKey,
        int originalAmount,
        int tokenQty,
        PaymentStatus paymentStatus,
        PaymentMethod paymentMethod,
        LocalDateTime approvedAt,
        LocalDateTime paymentCreatedAt,
        String refundPolicyVersion,
        long daysElapsed,
        boolean isSubscription,

        // ─ Writer ─
        UUID writerId,
        String writerEmail,
        String writerNickname
) {

    public static AdminRefundDetail of(Refund refund, long previousRejectedCount) {
        Payment payment = refund.getPayment();
        var writer = payment.getWriter();
        LocalDateTime approvedAt = payment.getApprovedAt() != null
                ? payment.getApprovedAt() : payment.getCreatedAt();
        long elapsed = ChronoUnit.DAYS.between(approvedAt.toLocalDate(),
                LocalDateTime.now(ZoneOffset.UTC).toLocalDate());

        return new AdminRefundDetail(
                refund.getId(),
                refund.getStatus(),
                refund.getReason(),
                refund.getDetail(),
                refund.getRefundType(),
                refund.getRefundAmount(),
                refund.getTokenDeducted(),
                refund.getRequestedAt(),
                refund.getProcessedAt(),
                refund.getAdminNote(),
                previousRejectedCount,

                payment.getId(),
                payment.getOrderId(),
                payment.getPaymentKey(),
                payment.getAmount(),
                payment.getTokenQty(),
                payment.getStatus(),
                payment.getMethod(),
                payment.getApprovedAt(),
                payment.getCreatedAt(),
                payment.getRefundPolicyVersion(),
                elapsed,
                payment.getOrderId() != null && payment.getOrderId().startsWith("SUB-"),

                writer.getId(),
                writer.getEmail(),
                writer.getNickname()
        );
    }
}
