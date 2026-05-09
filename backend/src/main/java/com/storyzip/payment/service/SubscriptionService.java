package com.storyzip.payment.service;

import com.storyzip.auth.domain.Writer;
import com.storyzip.auth.repository.WriterRepository;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.payment.client.PortOneClient;
import com.storyzip.payment.client.PortOnePaymentResponse;
import com.storyzip.payment.domain.Payment;
import com.storyzip.payment.domain.PaymentMethod;
import com.storyzip.payment.domain.RefundPolicy;
import com.storyzip.payment.domain.Subscription;
import com.storyzip.payment.domain.SubscriptionStatus;
import com.storyzip.payment.dto.BillingAuthPrepareResponse;
import com.storyzip.payment.dto.CreateSubscriptionRequest;
import com.storyzip.payment.dto.SubscriptionPlan;
import com.storyzip.payment.dto.SubscriptionResponse;
import com.storyzip.payment.repository.PaymentRepository;
import com.storyzip.payment.repository.SubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 프로 구독(정기결제) 서비스.
 *
 * <p>플로우 (PortOne V2):
 * <ol>
 *   <li>{@link #prepareBillingAuth} — customerKey 발급 (프론트가 SDK 호출용)</li>
 *   <li>프론트가 PortOne SDK로 카드 등록 → billingKey를 직접 받아 서버로 전달</li>
 *   <li>{@link #create} — billingKey로 첫 달 즉시 결제 → Subscription ACTIVE</li>
 *   <li>매월 {@code BillingScheduler}가 {@link #processBilling} 호출해 정기 결제</li>
 * </ol>
 *
 * <p>토스 대비 차이: authKey → billingKey 교환 단계 없음 (SDK가 직접 billingKey 반환).
 *
 * <p>해지 정책: 즉시 종료 아닌 "현재 주기 종료 후 만료".
 * {@link #cancel}은 cancelledAt만 기록하고 ACTIVE 유지 — 이미 결제한 기간은 혜택 유지.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SubscriptionService {

    private final SubscriptionRepository subscriptionRepository;
    private final PaymentRepository paymentRepository;
    private final WriterRepository writerRepository;
    private final PortOneClient portOneClient;
    private final TokenWalletService tokenWalletService;

    @Transactional
    public BillingAuthPrepareResponse prepareBillingAuth(UUID writerId) {
        Writer writer = writerRepository.findById(writerId)
                .orElseThrow(() -> new PaymentException(ErrorCode.WRITER_NOT_FOUND));

        subscriptionRepository.findByWriter_IdAndStatus(writer.getId(), SubscriptionStatus.ACTIVE)
                .ifPresent(s -> { throw new PaymentException(ErrorCode.SUBSCRIPTION_ALREADY_ACTIVE); });

        String customerKey = "ck_" + UUID.randomUUID().toString().replace("-", "");
        return new BillingAuthPrepareResponse(customerKey);
    }

    @Transactional
    public SubscriptionResponse create(UUID writerId, CreateSubscriptionRequest request) {
        Writer writer = writerRepository.findById(writerId)
                .orElseThrow(() -> new PaymentException(ErrorCode.WRITER_NOT_FOUND));

        if (!RefundPolicy.CURRENT_VERSION.equals(request.refundPolicyVersion())) {
            throw new PaymentException(ErrorCode.INVALID_REQUEST,
                    "환불 규정이 업데이트되었습니다. 최신 버전을 확인하고 다시 시도해주세요.");
        }

        subscriptionRepository.findByWriter_IdAndStatus(writer.getId(), SubscriptionStatus.ACTIVE)
                .ifPresent(s -> { throw new PaymentException(ErrorCode.SUBSCRIPTION_ALREADY_ACTIVE); });

        SubscriptionPlan plan = SubscriptionPlan.fromCode(request.planCode());

        Subscription subscription = subscriptionRepository.save(Subscription.builder()
                .writer(writer)
                .customerKey(request.customerKey())
                .billingKey(request.billingKey())
                .plan(plan.getCode())
                .monthlyTokens(plan.getMonthlyTokens())
                .monthlyAmount(plan.getAmount())
                .nextBillingAt(LocalDateTime.now(ZoneOffset.UTC))
                .build());

        log.info("[SUBSCRIPTION_CREATED] writerId={} subscriptionId={} plan={} monthlyAmount={} monthlyTokens={}",
                writer.getId(), subscription.getId(), plan.name(), plan.getAmount(), plan.getMonthlyTokens());
        chargeAndApply(subscription, plan, writer, "PRO 구독 가입 결제");
        return SubscriptionResponse.from(subscription);
    }

    @Transactional(readOnly = true)
    public SubscriptionResponse getMine(UUID writerId) {
        return subscriptionRepository.findByWriter_IdAndStatus(writerId, SubscriptionStatus.ACTIVE)
                .map(SubscriptionResponse::from)
                .orElseThrow(() -> new PaymentException(ErrorCode.SUBSCRIPTION_NOT_FOUND));
    }

    @Transactional
    public SubscriptionResponse cancel(UUID writerId) {
        Subscription subscription = subscriptionRepository
                .findByWriter_IdAndStatus(writerId, SubscriptionStatus.ACTIVE)
                .orElseThrow(() -> new PaymentException(ErrorCode.SUBSCRIPTION_NOT_FOUND));
        subscription.reserveCancel();
        log.info("[SUBSCRIPTION_CANCEL_RESERVED] writerId={} subscriptionId={} endsAt={}",
                writerId, subscription.getId(), subscription.getNextBillingAt());
        return SubscriptionResponse.from(subscription);
    }

    @Transactional
    public SubscriptionResponse resume(UUID writerId) {
        Subscription subscription = subscriptionRepository
                .findByWriter_IdAndStatus(writerId, SubscriptionStatus.ACTIVE)
                .orElseThrow(() -> new PaymentException(ErrorCode.SUBSCRIPTION_NOT_FOUND));
        subscription.resume();
        log.info("[SUBSCRIPTION_RESUME] writerId={} subscriptionId={}",
                writerId, subscription.getId());
        return SubscriptionResponse.from(subscription);
    }

    /**
     * 스케줄러에서 호출. 각 구독을 독립 트랜잭션에서 처리해 한 건 실패가 다른 건에 전파되지 않도록 한다.
     *
     * <p>해지 예약 상태면 결제 건너뛰고 {@link Subscription#expire()}로 종료한다.
     */
    @Transactional
    public void processBilling(UUID subscriptionId) {
        Subscription subscription = subscriptionRepository.findById(subscriptionId)
                .orElseThrow(() -> new PaymentException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        if (!subscription.isActive()) {
            return;
        }
        if (subscription.isCancelReserved()) {
            subscription.expire();
            tokenWalletService.expireSubscription(subscription.getWriter().getId(), subscription.getId());
            log.info("[SUBSCRIPTION_EXPIRED] writerId={} subscriptionId={} reason=CANCEL_RESERVED",
                    subscription.getWriter().getId(), subscriptionId);
            return;
        }

        SubscriptionPlan plan = SubscriptionPlan.fromCode(subscription.getPlan());
        try {
            chargeAndApply(subscription, plan, subscription.getWriter(), "PRO 구독 정기 결제");
        } catch (PaymentException e) {
            boolean terminated = subscription.getStatus() == SubscriptionStatus.PAYMENT_FAILED;
            String prefix = terminated
                    ? "[SUBSCRIPTION_BILLING_TERMINATED]"
                    : "[SUBSCRIPTION_BILLING_RETRY_PENDING]";
            log.info("{} writerId={} subscriptionId={} retryCount={} status={} errCode={}",
                    prefix, subscription.getWriter().getId(), subscriptionId,
                    subscription.getRetryCount(), subscription.getStatus(),
                    e.getErrorCode().getCode());
        }
    }

    private void chargeAndApply(Subscription subscription, SubscriptionPlan plan, Writer writer, String orderNameSuffix) {
        String paymentId = generatePaymentId();
        String orderName = plan.getDisplayName() + " - " + orderNameSuffix;

        // 정기결제 갱신은 사용자가 가입 시 동의한 약관 버전을 그대로 이어 사용한다.
        // 가입 결제와 매월 갱신 결제의 추적을 일관되게 유지하기 위함.
        Payment payment = paymentRepository.save(Payment.builder()
                .writer(writer)
                .orderId(paymentId)
                .amount(plan.getAmount())
                .tokenQty(plan.getMonthlyTokens())
                .refundPolicyVersion(RefundPolicy.CURRENT_VERSION)
                .refundPolicyAgreedAt(LocalDateTime.now(ZoneOffset.UTC))
                .build());
        payment.markInProgress();

        try {
            PortOnePaymentResponse charged = portOneClient.chargeBilling(
                    paymentId,
                    subscription.getBillingKey(),
                    orderName,
                    plan.getAmount(),
                    subscription.getCustomerKey(),
                    writer.getEmail()
            );

            LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
            LocalDateTime paidAt = charged.paidAt() != null
                    ? charged.paidAt().atZoneSameInstant(ZoneOffset.UTC).toLocalDateTime()
                    : now;
            payment.markDone(charged.id(), parseMethod(charged.method()), paidAt);

            subscription.recordPaymentSuccess(now, now.plusMonths(1));

            tokenWalletService.chargeSubscription(
                    writer.getId(),
                    plan.getMonthlyTokens(),
                    "SUBSCRIPTION_" + paymentId,
                    payment.getId()
            );
            log.info("[SUBSCRIPTION_BILLING_SUCCESS] writerId={} subscriptionId={} paymentId={} amount={} tokenQty={}",
                    writer.getId(), subscription.getId(), paymentId, plan.getAmount(), plan.getMonthlyTokens());
        } catch (PaymentException e) {
            payment.markFailed(e.getMessage());
            subscription.recordPaymentFailure(LocalDateTime.now(ZoneOffset.UTC));
            log.warn("[SUBSCRIPTION_BILLING_FAILED] writerId={} subscriptionId={} paymentId={} retryCount={} status={} errCode={} reason={}",
                    writer.getId(), subscription.getId(), paymentId,
                    subscription.getRetryCount(), subscription.getStatus(),
                    e.getErrorCode().getCode(), e.getMessage());
            throw e;
        }
    }

    private String generatePaymentId() {
        return "SUB-" + UUID.randomUUID().toString().replace("-", "").substring(0, 20);
    }

    private PaymentMethod parseMethod(PortOnePaymentResponse.Method method) {
        if (method == null || method.type() == null) return null;
        return switch (method.type()) {
            case "PaymentMethodCard" -> PaymentMethod.CARD;
            case "PaymentMethodVirtualAccount" -> PaymentMethod.VIRTUAL_ACCOUNT;
            case "PaymentMethodEasyPay" -> PaymentMethod.EASY_PAY;
            case "PaymentMethodTransfer" -> PaymentMethod.TRANSFER;
            case "PaymentMethodMobile" -> PaymentMethod.MOBILE_PHONE;
            case "PaymentMethodGiftCertificate" -> PaymentMethod.CULTURE_GIFT_CERTIFICATE;
            default -> null;
        };
    }
}
