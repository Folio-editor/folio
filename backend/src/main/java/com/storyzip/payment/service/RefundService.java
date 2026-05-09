package com.storyzip.payment.service;

import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.common.notification.EmailNotifier;
import com.storyzip.payment.client.PortOneClient;
import com.storyzip.payment.domain.Payment;
import com.storyzip.payment.domain.PaymentStatus;
import com.storyzip.payment.domain.Refund;
import com.storyzip.payment.domain.RefundReason;
import com.storyzip.payment.domain.RefundStatus;
import com.storyzip.payment.domain.RefundType;
import com.storyzip.payment.domain.TokenWallet;
import com.storyzip.payment.dto.RefundRequest;
import com.storyzip.payment.dto.RefundResponse;
import com.storyzip.payment.repository.PaymentRepository;
import com.storyzip.payment.repository.RefundRepository;
import com.storyzip.payment.repository.TokenWalletRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

/**
 * 환불 서비스 — 약관 제3~6조 + 이메일 기반 운영자 검토.
 *
 * <p>환불은 사용자 클릭 즉시 처리되지 않는다. 다음 흐름을 거친다:
 * <ol>
 *   <li>{@link #requestRefund} — 사용자가 신청. {@link Refund}를 {@code REQUESTED}로 저장하고
 *       운영자에게 이메일 발송. PortOne 호출은 하지 않는다.</li>
 *   <li>운영자가 이메일 확인 후 정책 검토 (DB 직접 또는 별도 관리자 API).</li>
 *   <li>{@link #approveRefund} — 승인 시 PortOne 취소 호출 + 토큰 회수/보상 + Payment 상태 변경.</li>
 *   <li>{@link #rejectRefund} — 거절 시 사유 기록만, 결제 상태는 그대로.</li>
 * </ol>
 *
 * <p>정책 분기 (신청 시 검증):
 * <ul>
 *   <li><b>구독</b> — 7일 이내 미사용만 신청 가능. 일부 사용 시 회사 귀책만 허용.</li>
 *   <li><b>종량제</b> — 7일 이내 미사용은 현금 환불, 일부 사용 + 회사 귀책은 전액 크레딧 보상.</li>
 *   <li><b>회사 귀책({@link RefundReason#COMPANY_FAULT})</b> — 7일 경과/사용 여부 무관 신청 허용.</li>
 * </ul>
 *
 * <p>재신청: 거절 후 1회 가능. 같은 결제에 active(REQUESTED/APPROVED) 환불이 있으면 차단.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RefundService {

    private static final long WITHDRAWAL_DAYS = 7;
    private static final int SUBSCRIPTION_PERIOD_DAYS = 30;
    private static final long MAX_REJECTED_RETRIES = 1;

    private final PaymentRepository paymentRepository;
    private final RefundRepository refundRepository;
    private final TokenWalletRepository tokenWalletRepository;
    private final PortOneClient portOneClient;
    private final TokenWalletService tokenWalletService;
    private final EmailNotifier emailNotifier;

    // ─────────────── 사용자: 신청 ───────────────

    @Transactional
    public RefundResponse requestRefund(UUID writerId, String paymentId, RefundRequest request) {
        Payment payment = paymentRepository.findWithLockByOrderId(paymentId)
                .orElseThrow(() -> new PaymentException(ErrorCode.PAYMENT_NOT_FOUND));

        if (!payment.getWriter().getId().equals(writerId)) {
            throw new PaymentException(ErrorCode.FORBIDDEN);
        }
        if (payment.getStatus() != PaymentStatus.DONE) {
            throw new PaymentException(ErrorCode.REFUND_FAILED, "완료된 결제만 환불할 수 있습니다");
        }

        // active(REQUESTED/APPROVED) 환불이 있으면 신규 신청 차단.
        refundRepository.findActiveByPaymentId(payment.getId()).ifPresent(r -> {
            throw new PaymentException(ErrorCode.REFUND_ALREADY_REQUESTED);
        });

        // 거절 후 재신청 1회 제한.
        long rejectedCount = refundRepository.countByPayment_IdAndStatus(payment.getId(), RefundStatus.REJECTED);
        if (rejectedCount >= MAX_REJECTED_RETRIES) {
            throw new PaymentException(ErrorCode.REFUND_RETRY_LIMIT_EXCEEDED,
                    "거절 후 1회 재신청만 가능합니다");
        }

        boolean isSubscription = payment.isSubscription();
        LocalDateTime approvedAt = payment.getApprovedAt() != null
                ? payment.getApprovedAt() : payment.getCreatedAt();
        long daysElapsed = ChronoUnit.DAYS.between(approvedAt.toLocalDate(),
                LocalDateTime.now(ZoneOffset.UTC).toLocalDate());

        RefundCalculation calc = request.reason() == RefundReason.COMPANY_FAULT
                ? calcCompanyFault(payment, isSubscription, writerId)
                : isSubscription
                    ? calcSubscriptionRequest(payment, writerId, daysElapsed)
                    : calcOnetimeRequest(payment, writerId, daysElapsed);

        Refund refund = refundRepository.save(Refund.builder()
                .payment(payment)
                .reason(request.reason())
                .detail(request.detail())
                .refundType(calc.refundType)
                .refundAmount(calc.refundAmount)
                .tokenDeducted(calc.tokenDeduct)
                .build());

        log.info("[REFUND_REQUESTED] writerId={} paymentId={} refundId={} type={} reason={} amount={} tokenDeduct={} daysElapsed={} subscription={}",
                writerId, paymentId, refund.getId(), calc.refundType, request.reason(),
                calc.refundAmount, calc.tokenDeduct, daysElapsed, isSubscription);

        // 운영자 알림 — 트랜잭션 commit 전이지만 EmailNotifier가 swallow 처리. 실패해도 신청은 보존.
        emailNotifier.notifyOperator(
                buildEmailSubject(refund, payment),
                buildEmailBody(refund, payment, request, daysElapsed, isSubscription));

        return toResponse(payment, refund);
    }

    /**
     * 운영자 화면용 — 특정 status 의 환불 목록 조회.
     * 보통 {@link RefundStatus#REQUESTED} 로 호출해 검토 대기 큐 확인.
     */
    @Transactional(readOnly = true)
    public List<RefundResponse> listByStatus(RefundStatus status) {
        return refundRepository.findAllByStatusOrderByRequestedAtAsc(status).stream()
                .map(refund -> toResponse(refund.getPayment(), refund))
                .toList();
    }

    /**
     * 운영자 화면용 — 검토에 필요한 모든 컨텍스트를 묶은 상세 목록.
     *
     * <p>N+1 회피: {@link RefundRepository#findDetailByStatusWithRejectedCount} 가
     * Payment + Writer fetch join + 거절 횟수 서브쿼리를 한 쿼리로 처리.
     */
    @Transactional(readOnly = true)
    public List<com.storyzip.admin.dto.AdminRefundDetail> listDetailByStatus(RefundStatus status) {
        return refundRepository.findDetailByStatusWithRejectedCount(status).stream()
                .map(row -> {
                    Refund refund = (Refund) row[0];
                    long previousRejected = ((Number) row[1]).longValue();
                    return com.storyzip.admin.dto.AdminRefundDetail.of(refund, previousRejected);
                })
                .toList();
    }

    @Transactional
    public RefundResponse cancelRequest(UUID writerId, UUID refundId) {
        Refund refund = refundRepository.findById(refundId)
                .orElseThrow(() -> new PaymentException(ErrorCode.RESOURCE_NOT_FOUND));
        if (!refund.getPayment().getWriter().getId().equals(writerId)) {
            throw new PaymentException(ErrorCode.FORBIDDEN);
        }
        if (refund.getStatus() != RefundStatus.REQUESTED) {
            throw new PaymentException(ErrorCode.REFUND_FAILED, "신청 대기 중인 환불만 취소할 수 있습니다");
        }
        refund.cancelByUser();
        log.info("[REFUND_CANCELED_BY_USER] writerId={} refundId={}", writerId, refundId);
        return toResponse(refund.getPayment(), refund);
    }

    // ─────────────── 운영자: 승인 / 거절 ───────────────

    /**
     * 운영자 승인 — PortOne 취소 호출 + 토큰 회수/보상 + Payment 상태 변경.
     * COMPANY_FAULT 종량제는 현금 환불 없이 크레딧 보상.
     *
     * <p><b>외부 호출 순서</b>: PortOne {@code cancelPayment} 를 트랜잭션 마지막에 호출한다.
     * <ul>
     *   <li>중간 단계(토큰 회수/Payment 상태/refund.approve) 실패 시 PortOne 호출 전이므로
     *       전체 롤백되어 DB-PG 일관성 유지.</li>
     *   <li>PortOne 호출 자체가 실패하면 트랜잭션 롤백 → 모든 DB 변경 원복 → 운영자 재시도 가능.</li>
     *   <li>PortOne 호출 성공 후 commit 직전 사고는 여전히 가능 (확률 낮음). 별도 불일치 감지
     *       스케줄러로 5분 주기 검증 (Phase B). 운영 모니터링은 {@code [REFUND_APPROVED]} 로그.</li>
     * </ul>
     */
    @Transactional
    public RefundResponse approveRefund(UUID refundId, String adminNote) {
        Refund refund = refundRepository.findById(refundId)
                .orElseThrow(() -> new PaymentException(ErrorCode.RESOURCE_NOT_FOUND));
        if (refund.getStatus() != RefundStatus.REQUESTED) {
            throw new PaymentException(ErrorCode.REFUND_FAILED,
                    "REQUESTED 상태만 승인할 수 있습니다 — 현재: " + refund.getStatus());
        }

        Payment payment = refund.getPayment();
        UUID writerId = payment.getWriter().getId();

        if (refund.getRefundType() == RefundType.COMPANY_FAULT_CREDIT) {
            // 회사 귀책 보상 — PortOne 호출 없이 결제 시 받은 크레딧을 다시 채워준다.
            // (외부 호출 없으므로 순서 신경 쓸 필요 없음)
            tokenWalletService.chargePurchase(
                    writerId, refund.getTokenDeducted(),
                    "REFUND_COMPENSATION_" + payment.getOrderId(), payment.getId());
            refund.approve(adminNote);
        } else {
            // 현금 환불 — DB 먼저 변경, PortOne 호출은 트랜잭션 마지막.
            // 1) refund 승인 도장
            refund.approve(adminNote);
            // 2) Payment 상태 변경
            payment.markCanceled("환불 승인 (" + refund.getRefundAmount() + "원) [" + refund.getReason() + "]");
            // 3) 토큰 회수 (TokenWallet + TokenTransaction 원장)
            if (refund.getTokenDeducted() > 0) {
                tokenWalletService.deductForRefund(
                        writerId, refund.getTokenDeducted(),
                        "REFUND_" + payment.getOrderId(), payment.getId());
            }
            // 4) PortOne 취소 — 마지막. 실패 시 위 1~3번 롤백되어 DB 깨끗하게 복원.
            Integer cancelAmount = isFullCash(refund) ? null : refund.getRefundAmount();
            portOneClient.cancelPayment(payment.getOrderId(),
                    "환불 승인: " + refund.getRefundType() + " — " + (adminNote == null ? "" : adminNote),
                    cancelAmount);
        }

        log.info("[REFUND_APPROVED] writerId={} paymentId={} refundId={} type={} amount={} tokenDeduct={} adminNote={}",
                writerId, payment.getOrderId(), refund.getId(), refund.getRefundType(),
                refund.getRefundAmount(), refund.getTokenDeducted(), adminNote);

        return toResponse(payment, refund);
    }

    @Transactional
    public RefundResponse rejectRefund(UUID refundId, String adminNote) {
        Refund refund = refundRepository.findById(refundId)
                .orElseThrow(() -> new PaymentException(ErrorCode.RESOURCE_NOT_FOUND));
        refund.reject(adminNote);
        log.info("[REFUND_REJECTED] paymentId={} refundId={} adminNote={}",
                refund.getPayment().getOrderId(), refund.getId(), adminNote);
        return toResponse(refund.getPayment(), refund);
    }

    // ─────────────── 정책 계산 (신청 시점) ───────────────

    private RefundCalculation calcOnetimeRequest(Payment payment, UUID writerId, long daysElapsed) {
        if (daysElapsed >= WITHDRAWAL_DAYS) {
            throw new PaymentException(ErrorCode.REFUND_REQUEST_DENIED,
                    "결제 후 7일이 경과해 환불 신청할 수 없습니다");
        }
        int granted = payment.getTokenQty();
        int remaining = remainingPurchaseTokens(writerId, granted);
        int used = granted - remaining;

        if (used > 0) {
            // 정책: 7일 이내라도 종량제 일부 사용은 일반 사유로는 환불 불가, 회사 귀책만 허용.
            throw new PaymentException(ErrorCode.REFUND_REQUEST_DENIED,
                    "크레딧을 일부라도 사용한 경우 단순 변심 환불은 불가합니다");
        }
        return new RefundCalculation(payment.getAmount(), granted, RefundType.FULL);
    }

    private RefundCalculation calcSubscriptionRequest(Payment payment, UUID writerId, long daysElapsed) {
        if (daysElapsed >= WITHDRAWAL_DAYS) {
            throw new PaymentException(ErrorCode.REFUND_REQUEST_DENIED,
                    "구독 시작 후 7일이 경과해 환불할 수 없습니다. 차월부터 구독을 해지할 수 있습니다");
        }
        int granted = payment.getTokenQty();
        int remaining = remainingSubscriptionTokens(writerId, granted);
        if (remaining < granted) {
            throw new PaymentException(ErrorCode.REFUND_REQUEST_DENIED,
                    "구독 크레딧을 일부라도 사용한 경우 환불할 수 없습니다");
        }
        return new RefundCalculation(payment.getAmount(), granted, RefundType.FULL);
    }

    /**
     * 회사 귀책 분기.
     * <ul>
     *   <li>구독: 사용 여부 무관 전액 현금 환불 ({@link RefundType#FULL}).</li>
     *   <li>종량제: 약관 제4조 — <b>전액 크레딧 보상</b> ({@link RefundType#COMPANY_FAULT_CREDIT}).
     *       현금 환불 X, 결제 시 받은 크레딧을 그대로 다시 지급.</li>
     * </ul>
     */
    private RefundCalculation calcCompanyFault(Payment payment, boolean isSubscription, UUID writerId) {
        if (isSubscription) {
            return new RefundCalculation(payment.getAmount(), payment.getTokenQty(), RefundType.FULL);
        }
        // 종량제 — 전액 크레딧 보상.
        return new RefundCalculation(0, payment.getTokenQty(), RefundType.COMPANY_FAULT_CREDIT);
    }

    private int remainingPurchaseTokens(UUID writerId, int granted) {
        return tokenWalletRepository.findById(writerId)
                .map(TokenWallet::getPurchaseBalance)
                .map(balance -> Math.min(balance, granted))
                .orElse(0);
    }

    private int remainingSubscriptionTokens(UUID writerId, int granted) {
        return tokenWalletRepository.findById(writerId)
                .map(TokenWallet::getSubscriptionBalance)
                .map(balance -> Math.min(balance, granted))
                .orElse(0);
    }

    // ─────────────── 헬퍼 ───────────────

    private boolean isFullCash(Refund refund) {
        return refund.getRefundType() == RefundType.FULL
                && refund.getRefundAmount().intValue() == refund.getPayment().getAmount().intValue();
    }

    private RefundResponse toResponse(Payment payment, Refund refund) {
        return new RefundResponse(
                payment.getId(), payment.getOrderId(),
                payment.getAmount(), refund.getRefundAmount(),
                refund.getTokenDeducted(), refund.getRefundType(), refund.getReason(),
                refund.getId(), refund.getStatus());
    }

    private String buildEmailSubject(Refund refund, Payment payment) {
        return String.format("[Folio 환불 신청] %s — %s (%d원)",
                payment.getOrderId(), refund.getReason(), refund.getRefundAmount());
    }

    private String buildEmailBody(Refund refund, Payment payment, RefundRequest request,
                                  long daysElapsed, boolean isSubscription) {
        return """
               환불 신청이 접수되었습니다. 정책 검토 후 승인/거절 처리가 필요합니다.

               ─── 결제 정보 ───
               결제 ID: %s
               결제 종류: %s
               결제 금액: %,d원
               지급 크레딧: %,d
               결제 일시(UTC): %s
               경과 일수: %d일

               ─── 환불 신청 ───
               신청 ID: %s
               분류: %s
               사유 코드: %s
               자유 사유: %s
               예상 환불액: %,d원
               회수 토큰: %,d
               약관 동의 버전: %s

               ─── 작가 ───
               작가 ID: %s
               이메일: %s

               운영자 작업: 정책 검토 후 관리자 도구(DB 또는 API)로 승인/거절.
               """.formatted(
                payment.getOrderId(),
                isSubscription ? "구독 (PRO_MONTHLY)" : "종량제",
                payment.getAmount(),
                payment.getTokenQty(),
                payment.getApprovedAt() != null ? payment.getApprovedAt() : payment.getCreatedAt(),
                daysElapsed,
                refund.getId(),
                refund.getRefundType(),
                request.reason(),
                request.detail() == null ? "(없음)" : request.detail(),
                refund.getRefundAmount(),
                refund.getTokenDeducted(),
                payment.getRefundPolicyVersion(),
                payment.getWriter().getId(),
                payment.getWriter().getEmail()
        );
    }

    private record RefundCalculation(int refundAmount, int tokenDeduct, RefundType refundType) {}
}
