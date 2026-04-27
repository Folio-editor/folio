package com.storyzip.payment.service;

import com.storyzip.auth.domain.Writer;
import com.storyzip.auth.repository.WriterRepository;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.payment.client.TossBillingAuthResponse;
import com.storyzip.payment.client.TossConfirmResponse;
import com.storyzip.payment.client.TossPaymentsClient;
import com.storyzip.payment.config.TossPaymentsProperties;
import com.storyzip.payment.domain.Payment;
import com.storyzip.payment.domain.PaymentMethod;
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
 * <p>플로우:
 * <ol>
 *   <li>{@link #prepareBillingAuth} — customerKey 발급 + clientKey 제공 (프론트가 SDK 호출용)</li>
 *   <li>프론트가 토스 SDK로 카드 등록 → authKey 획득</li>
 *   <li>{@link #create} — authKey → billingKey 교환 → 첫 달 즉시 결제 → Subscription ACTIVE</li>
 *   <li>매월 {@code BillingScheduler}가 {@link #processBilling} 호출해 정기 결제</li>
 * </ol>
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
    private final TossPaymentsClient tossPaymentsClient;
    private final TokenWalletService tokenWalletService;
    private final TossPaymentsProperties tossProperties;

    @Transactional
    public BillingAuthPrepareResponse prepareBillingAuth(UUID writerId) {
        Writer writer = writerRepository.findById(writerId)
                .orElseThrow(() -> new PaymentException(ErrorCode.WRITER_NOT_FOUND));

        subscriptionRepository.findByWriter_IdAndStatus(writer.getId(), SubscriptionStatus.ACTIVE)
                .ifPresent(s -> { throw new PaymentException(ErrorCode.SUBSCRIPTION_ALREADY_ACTIVE); });

        String customerKey = "ck_" + UUID.randomUUID().toString().replace("-", "");
        return new BillingAuthPrepareResponse(customerKey, tossProperties.clientKey());
    }

    @Transactional
    public SubscriptionResponse create(UUID writerId, CreateSubscriptionRequest request) {
        Writer writer = writerRepository.findById(writerId)
                .orElseThrow(() -> new PaymentException(ErrorCode.WRITER_NOT_FOUND));

        subscriptionRepository.findByWriter_IdAndStatus(writer.getId(), SubscriptionStatus.ACTIVE)
                .ifPresent(s -> { throw new PaymentException(ErrorCode.SUBSCRIPTION_ALREADY_ACTIVE); });

        SubscriptionPlan plan = SubscriptionPlan.fromCode(request.planCode());

        TossBillingAuthResponse auth = tossPaymentsClient.issueBillingKey(
                request.authKey(), request.customerKey());

        Subscription subscription = subscriptionRepository.save(Subscription.builder()
                .writer(writer)
                .customerKey(auth.customerKey())
                .billingKey(auth.billingKey())
                .plan(plan.getCode())
                .monthlyTokens(plan.getMonthlyTokens())
                .monthlyAmount(plan.getAmount())
                .nextBillingAt(LocalDateTime.now(ZoneOffset.UTC))
                .build());

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
        log.info("Subscription cancel reserved: writerId={}, subscriptionId={}, endsAt={}",
                writerId, subscription.getId(), subscription.getNextBillingAt());
        return SubscriptionResponse.from(subscription);
    }

    @Transactional
    public SubscriptionResponse resume(UUID writerId) {
        Subscription subscription = subscriptionRepository
                .findByWriter_IdAndStatus(writerId, SubscriptionStatus.ACTIVE)
                .orElseThrow(() -> new PaymentException(ErrorCode.SUBSCRIPTION_NOT_FOUND));
        subscription.resume();
        log.info("Subscription cancel withdrawn: writerId={}, subscriptionId={}",
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
            log.info("Subscription expired by reservation: subscriptionId={}", subscriptionId);
            return;
        }

        SubscriptionPlan plan = SubscriptionPlan.fromCode(subscription.getPlan());
        try {
            chargeAndApply(subscription, plan, subscription.getWriter(), "PRO 구독 정기 결제");
        } catch (PaymentException e) {
            // 정기 결제 실패는 Subscription 상태 업데이트(retryCount++ 또는 PAYMENT_FAILED)만 유지하고
            // 트랜잭션은 커밋되도록 예외를 삼킨다. 결제 Payment는 FAILED로 기록되어 감사에 남는다.
            log.info("Subscription billing swallowed after status update: subscriptionId={}", subscriptionId);
        }
    }

    private void chargeAndApply(Subscription subscription, SubscriptionPlan plan, Writer writer, String orderNameSuffix) {
        String orderId = generateOrderId();
        String orderName = plan.getDisplayName() + " - " + orderNameSuffix;

        Payment payment = paymentRepository.save(Payment.builder()
                .writer(writer)
                .orderId(orderId)
                .amount(plan.getAmount())
                .tokenQty(plan.getMonthlyTokens())
                .build());
        payment.markInProgress();

        try {
            TossConfirmResponse confirmed = tossPaymentsClient.chargeBilling(
                    subscription.getBillingKey(),
                    subscription.getCustomerKey(),
                    orderId,
                    orderName,
                    plan.getAmount(),
                    writer.getEmail()
            );

            LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
            LocalDateTime approvedAt = confirmed.approvedAt() != null
                    ? confirmed.approvedAt().atZoneSameInstant(ZoneOffset.UTC).toLocalDateTime()
                    : now;
            payment.markDone(confirmed.paymentKey(), parseMethod(confirmed.method()), approvedAt);

            subscription.recordPaymentSuccess(now, now.plusMonths(1));

            tokenWalletService.chargeSubscription(
                    writer.getId(),
                    plan.getMonthlyTokens(),
                    "SUBSCRIPTION_" + orderId,
                    payment.getId()
            );
            log.info("Subscription billing success: subscriptionId={}, orderId={}, amount={}",
                    subscription.getId(), orderId, plan.getAmount());
        } catch (PaymentException e) {
            payment.markFailed(e.getMessage());
            subscription.recordPaymentFailure(LocalDateTime.now(ZoneOffset.UTC));
            log.warn("Subscription billing failed: subscriptionId={}, retryCount={}, status={}",
                    subscription.getId(), subscription.getRetryCount(), subscription.getStatus());
            throw e;
        }
    }

    private String generateOrderId() {
        return "SUB-" + UUID.randomUUID().toString().replace("-", "").substring(0, 20);
    }

    private PaymentMethod parseMethod(String raw) {
        if (raw == null) return null;
        return switch (raw) {
            case "카드" -> PaymentMethod.CARD;
            case "가상계좌" -> PaymentMethod.VIRTUAL_ACCOUNT;
            case "간편결제" -> PaymentMethod.EASY_PAY;
            case "계좌이체" -> PaymentMethod.TRANSFER;
            case "휴대폰" -> PaymentMethod.MOBILE_PHONE;
            case "문화상품권" -> PaymentMethod.CULTURE_GIFT_CERTIFICATE;
            default -> null;
        };
    }
}
