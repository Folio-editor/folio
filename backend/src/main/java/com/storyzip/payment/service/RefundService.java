package com.storyzip.payment.service;

import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.payment.client.TossPaymentsClient;
import com.storyzip.payment.domain.Payment;
import com.storyzip.payment.domain.PaymentStatus;
import com.storyzip.payment.domain.TokenTransactionType;
import com.storyzip.payment.dto.RefundResponse;
import com.storyzip.payment.repository.PaymentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * 환불 서비스.
 *
 * <p>환불 정책:
 * <ul>
 *   <li>결제 후 24시간 이내: 전액 환불</li>
 *   <li>결제 후 24시간 이후: 잔여 일수 비례 부분 환불</li>
 * </ul>
 *
 * <p>환불 시 지급된 토큰도 비례 회수한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RefundService {

    private static final int SUBSCRIPTION_PERIOD_DAYS = 30;
    private static final long FULL_REFUND_HOURS = 24;

    private final PaymentRepository paymentRepository;
    private final TossPaymentsClient tossPaymentsClient;
    private final TokenWalletService tokenWalletService;

    @Transactional
    public RefundResponse refund(UUID writerId, String orderId) {
        // 행 잠금 조회 — 동일 orderId로 환불이 동시 호출되어도 한 번만 처리되도록.
        // 두 번째 트랜잭션은 첫 번째가 status=CANCELED로 commit한 뒤 진입해 즉시 거절된다.
        Payment payment = paymentRepository.findWithLockByOrderId(orderId)
                .orElseThrow(() -> new PaymentException(ErrorCode.PAYMENT_NOT_FOUND));

        if (!payment.getWriter().getId().equals(writerId)) {
            throw new PaymentException(ErrorCode.FORBIDDEN);
        }
        if (payment.getStatus() == PaymentStatus.CANCELED) {
            throw new PaymentException(ErrorCode.REFUND_FAILED, "이미 환불된 결제입니다");
        }
        if (payment.getStatus() != PaymentStatus.DONE) {
            throw new PaymentException(ErrorCode.REFUND_FAILED, "완료된 결제만 환불할 수 있습니다");
        }

        LocalDateTime approvedAt = payment.getApprovedAt() != null
                ? payment.getApprovedAt() : payment.getCreatedAt();
        long hoursElapsed = ChronoUnit.HOURS.between(approvedAt, LocalDateTime.now(ZoneOffset.UTC));

        int refundAmount;
        int tokenDeduct;
        String refundType;

        if (hoursElapsed < FULL_REFUND_HOURS) {
            refundAmount = payment.getAmount();
            tokenDeduct = payment.getTokenQty();
            refundType = "FULL";
        } else {
            long daysUsed = ChronoUnit.DAYS.between(approvedAt.toLocalDate(), LocalDateTime.now(ZoneOffset.UTC).toLocalDate());
            if (daysUsed >= SUBSCRIPTION_PERIOD_DAYS) {
                throw new PaymentException(ErrorCode.REFUND_FAILED, "구독 기간이 이미 만료되어 환불할 수 없습니다");
            }
            long daysRemaining = SUBSCRIPTION_PERIOD_DAYS - daysUsed;
            refundAmount = (int) (payment.getAmount() * daysRemaining / SUBSCRIPTION_PERIOD_DAYS);
            tokenDeduct = (int) (payment.getTokenQty() * daysRemaining / SUBSCRIPTION_PERIOD_DAYS);
            refundType = "PARTIAL";

            if (refundAmount <= 0) {
                throw new PaymentException(ErrorCode.REFUND_FAILED, "환불 가능 금액이 없습니다");
            }
        }

        Integer cancelAmount = refundType.equals("FULL") ? null : refundAmount;
        tossPaymentsClient.cancelPayment(payment.getPaymentKey(),
                refundType.equals("FULL") ? "24시간 이내 전액 환불" : "잔여 기간 비례 부분 환불",
                cancelAmount);

        payment.markCanceled(refundType.equals("FULL")
                ? "전액 환불" : "부분 환불 (" + refundAmount + "원)");

        if (tokenDeduct > 0) {
            tokenWalletService.deductForRefund(
                    writerId, tokenDeduct,
                    "REFUND_" + orderId, payment.getId());
        }

        log.info("Refund processed: orderId={}, type={}, refundAmount={}, tokenDeduct={}",
                orderId, refundType, refundAmount, tokenDeduct);

        return new RefundResponse(
                payment.getId(), orderId,
                payment.getAmount(), refundAmount,
                tokenDeduct, refundType);
    }
}
