package com.storyzip.payment.service;

import com.storyzip.auth.domain.Writer;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.common.notification.EmailNotifier;
import com.storyzip.payment.client.PortOneClient;
import com.storyzip.payment.domain.Payment;
import com.storyzip.payment.domain.PaymentMethod;
import com.storyzip.payment.domain.Refund;
import com.storyzip.payment.domain.RefundReason;
import com.storyzip.payment.domain.RefundStatus;
import com.storyzip.payment.domain.RefundType;
import com.storyzip.payment.domain.TokenWallet;
import com.storyzip.payment.dto.RefundRequest;
import com.storyzip.payment.dto.RefundResponse;
import com.storyzip.payment.domain.Subscription;
import com.storyzip.payment.domain.SubscriptionStatus;
import com.storyzip.payment.repository.PaymentRepository;
import com.storyzip.payment.repository.RefundRepository;
import com.storyzip.payment.repository.SubscriptionRepository;
import com.storyzip.payment.repository.TokenWalletRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RefundServiceTest {

    @Mock PaymentRepository paymentRepository;
    @Mock RefundRepository refundRepository;
    @Mock TokenWalletRepository tokenWalletRepository;
    @Mock SubscriptionRepository subscriptionRepository;
    @Mock PortOneClient portOneClient;
    @Mock TokenWalletService tokenWalletService;
    @Mock EmailNotifier emailNotifier;

    @InjectMocks RefundService refundService;

    UUID writerId;
    Writer writer;

    @BeforeEach
    void setUp() {
        writerId = UUID.randomUUID();
        writer = Writer.builder().email("a@a.com").nickname("a").build();
        ReflectionTestUtils.setField(writer, "id", writerId);
        // RefundRepository.save가 같은 인자 그대로 반환하도록 (실제 PK 부여는 JPA가 하므로 테스트엔 미사용).
        given(refundRepository.save(any(Refund.class))).willAnswer(inv -> inv.getArgument(0));
    }

    // ─────────── 신청 — 종량제 ───────────

    @Test
    @DisplayName("종량제 7일 이내 미사용 신청: REQUESTED + FULL + 이메일 발송, PortOne 호출 없음")
    void onetime_within7Days_unused_request() {
        Payment payment = doneOnetime(5_000, 550, hoursAgo(24));
        TokenWallet wallet = walletWithPurchase(550);
        given(paymentRepository.findWithLockByOrderId("SZ-1")).willReturn(Optional.of(payment));
        given(tokenWalletRepository.findById(writerId)).willReturn(Optional.of(wallet));
        given(refundRepository.findActiveByPaymentId(any())).willReturn(Optional.empty());
        given(refundRepository.countByPayment_IdAndStatus(any(), eq(RefundStatus.REJECTED))).willReturn(0L);

        RefundResponse res = refundService.requestRefund(writerId, "SZ-1",
                new RefundRequest(RefundReason.CUSTOMER_CHANGE_OF_MIND, null));

        assertThat(res.refundType()).isEqualTo(RefundType.FULL);
        assertThat(res.refundAmount()).isEqualTo(5_000);
        assertThat(res.status()).isEqualTo(RefundStatus.REQUESTED);
        verify(refundRepository).save(any(Refund.class));
        verify(emailNotifier).notifyOperator(anyString(), anyString());
        verify(portOneClient, never()).cancelPayment(anyString(), anyString(), any());
        verify(tokenWalletService, never()).deductForRefund(any(), any(Integer.class), anyString(), any());
    }

    @Test
    @DisplayName("종량제 7일 이내 일부 사용 신청 (단순변심): PARTIAL_USED 비례 환불 (약관 제4조 1항)")
    void onetime_within7Days_partialUsed_simpleReason_proratedRefund() {
        // 5,000원 / 550 크레딧, 100 사용 (잔여 450) → 5,000 × 450/550 = 4,090.9... → floor 4,090원
        Payment payment = doneOnetime(5_000, 550, hoursAgo(24));
        TokenWallet wallet = walletWithPurchase(450);
        given(paymentRepository.findWithLockByOrderId("SZ-1")).willReturn(Optional.of(payment));
        given(tokenWalletRepository.findById(writerId)).willReturn(Optional.of(wallet));
        given(refundRepository.findActiveByPaymentId(any())).willReturn(Optional.empty());
        given(refundRepository.countByPayment_IdAndStatus(any(), eq(RefundStatus.REJECTED))).willReturn(0L);

        RefundResponse res = refundService.requestRefund(writerId, "SZ-1",
                new RefundRequest(RefundReason.CUSTOMER_CHANGE_OF_MIND, null));

        assertThat(res.refundType()).isEqualTo(RefundType.PARTIAL_USED);
        assertThat(res.refundAmount()).isEqualTo(4_090);
        assertThat(res.tokenDeducted()).isEqualTo(450);
        assertThat(res.status()).isEqualTo(RefundStatus.REQUESTED);
        verify(portOneClient, never()).cancelPayment(anyString(), anyString(), any());
        verify(tokenWalletService, never()).deductForRefund(any(), any(Integer.class), anyString(), any());
    }

    @Test
    @DisplayName("종량제 7일 이내 전부 사용 신청 (단순변심): REFUND_REQUEST_DENIED (제6조 2항)")
    void onetime_within7Days_fullyUsed_simpleReason_denied() {
        Payment payment = doneOnetime(5_000, 550, hoursAgo(24));
        TokenWallet wallet = walletWithPurchase(0);
        given(paymentRepository.findWithLockByOrderId("SZ-1")).willReturn(Optional.of(payment));
        given(tokenWalletRepository.findById(writerId)).willReturn(Optional.of(wallet));
        given(refundRepository.findActiveByPaymentId(any())).willReturn(Optional.empty());
        given(refundRepository.countByPayment_IdAndStatus(any(), eq(RefundStatus.REJECTED))).willReturn(0L);

        assertThatThrownBy(() -> refundService.requestRefund(writerId, "SZ-1",
                new RefundRequest(RefundReason.CUSTOMER_CHANGE_OF_MIND, null)))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("모두 사용");
    }

    @Test
    @DisplayName("종량제 7일 경과 신청 (단순변심): REFUND_REQUEST_DENIED")
    void onetime_after7Days_simpleReason_denied() {
        Payment payment = doneOnetime(5_000, 550, hoursAgo(24 * 8));
        given(paymentRepository.findWithLockByOrderId("SZ-1")).willReturn(Optional.of(payment));
        given(refundRepository.findActiveByPaymentId(any())).willReturn(Optional.empty());
        given(refundRepository.countByPayment_IdAndStatus(any(), eq(RefundStatus.REJECTED))).willReturn(0L);

        assertThatThrownBy(() -> refundService.requestRefund(writerId, "SZ-1",
                new RefundRequest(RefundReason.CUSTOMER_CHANGE_OF_MIND, null)))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("7일이 경과");
    }

    // ─────────── 신청 — 구독 ───────────

    @Test
    @DisplayName("구독 7일 이내 미사용 신청: REQUESTED + FULL")
    void subscription_within7Days_unused_request() {
        Payment payment = doneSubscription(19_800, 25_000, hoursAgo(24));
        TokenWallet wallet = walletWithSubscription(25_000);
        given(paymentRepository.findWithLockByOrderId("SUB-1")).willReturn(Optional.of(payment));
        given(tokenWalletRepository.findById(writerId)).willReturn(Optional.of(wallet));
        given(refundRepository.findActiveByPaymentId(any())).willReturn(Optional.empty());
        given(refundRepository.countByPayment_IdAndStatus(any(), eq(RefundStatus.REJECTED))).willReturn(0L);

        RefundResponse res = refundService.requestRefund(writerId, "SUB-1",
                new RefundRequest(RefundReason.CUSTOMER_CHANGE_OF_MIND, null));

        assertThat(res.refundType()).isEqualTo(RefundType.FULL);
        assertThat(res.refundAmount()).isEqualTo(19_800);
        assertThat(res.status()).isEqualTo(RefundStatus.REQUESTED);
    }

    @Test
    @DisplayName("구독 7일 이내 일부 사용 신청 (단순변심): REFUND_REQUEST_DENIED")
    void subscription_within7Days_partialUsed_denied() {
        Payment payment = doneSubscription(19_800, 25_000, hoursAgo(24));
        TokenWallet wallet = walletWithSubscription(10_000);
        given(paymentRepository.findWithLockByOrderId("SUB-1")).willReturn(Optional.of(payment));
        given(tokenWalletRepository.findById(writerId)).willReturn(Optional.of(wallet));
        given(refundRepository.findActiveByPaymentId(any())).willReturn(Optional.empty());
        given(refundRepository.countByPayment_IdAndStatus(any(), eq(RefundStatus.REJECTED))).willReturn(0L);

        assertThatThrownBy(() -> refundService.requestRefund(writerId, "SUB-1",
                new RefundRequest(RefundReason.CUSTOMER_CHANGE_OF_MIND, null)))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("일부라도 사용");
    }

    // ─────────── 신청 — 회사 귀책 ───────────

    @Test
    @DisplayName("종량제 회사 귀책: 7일 경과 + 일부 사용이어도 COMPANY_FAULT_CREDIT 신청 OK")
    void onetime_companyFault_anyTime_creditCompensation() {
        Payment payment = doneOnetime(5_000, 550, hoursAgo(24 * 30));
        given(paymentRepository.findWithLockByOrderId("SZ-1")).willReturn(Optional.of(payment));
        given(refundRepository.findActiveByPaymentId(any())).willReturn(Optional.empty());
        given(refundRepository.countByPayment_IdAndStatus(any(), eq(RefundStatus.REJECTED))).willReturn(0L);

        RefundResponse res = refundService.requestRefund(writerId, "SZ-1",
                new RefundRequest(RefundReason.COMPANY_FAULT, "AI 응답 장애"));

        assertThat(res.refundType()).isEqualTo(RefundType.COMPANY_FAULT_CREDIT);
        assertThat(res.refundAmount()).isZero(); // 현금 환불 없음
        assertThat(res.tokenDeducted()).isEqualTo(550); // 전액 크레딧 보상
        assertThat(res.status()).isEqualTo(RefundStatus.REQUESTED);
    }

    @Test
    @DisplayName("구독 회사 귀책: FULL 현금 환불 신청")
    void subscription_companyFault_fullCash() {
        Payment payment = doneSubscription(19_800, 25_000, hoursAgo(24 * 30));
        given(paymentRepository.findWithLockByOrderId("SUB-1")).willReturn(Optional.of(payment));
        given(refundRepository.findActiveByPaymentId(any())).willReturn(Optional.empty());
        given(refundRepository.countByPayment_IdAndStatus(any(), eq(RefundStatus.REJECTED))).willReturn(0L);

        RefundResponse res = refundService.requestRefund(writerId, "SUB-1",
                new RefundRequest(RefundReason.COMPANY_FAULT, "결제 후 서비스 접근 불가"));

        assertThat(res.refundType()).isEqualTo(RefundType.FULL);
        assertThat(res.refundAmount()).isEqualTo(19_800);
    }

    // ─────────── 검증 / 동시성 ───────────

    @Test
    @DisplayName("active 환불 있으면 신규 신청 차단 (REFUND_ALREADY_REQUESTED)")
    void activeRefundExists_blockedFromNewRequest() {
        Payment payment = doneOnetime(5_000, 550, hoursAgo(1));
        Refund existing = Refund.builder()
                .payment(payment).reason(RefundReason.CUSTOMER_CHANGE_OF_MIND)
                .detail(null).refundType(RefundType.FULL).refundAmount(5_000).tokenDeducted(550)
                .build();
        given(paymentRepository.findWithLockByOrderId("SZ-1")).willReturn(Optional.of(payment));
        given(refundRepository.findActiveByPaymentId(any())).willReturn(Optional.of(existing));

        assertThatThrownBy(() -> refundService.requestRefund(writerId, "SZ-1",
                new RefundRequest(RefundReason.CUSTOMER_CHANGE_OF_MIND, null)))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("이미");
    }

    @Test
    @DisplayName("거절 후 1회 재신청 OK, 2회째는 REFUND_RETRY_LIMIT_EXCEEDED")
    void rejectedTwice_retryLimitExceeded() {
        Payment payment = doneOnetime(5_000, 550, hoursAgo(24));
        given(paymentRepository.findWithLockByOrderId("SZ-1")).willReturn(Optional.of(payment));
        given(refundRepository.findActiveByPaymentId(any())).willReturn(Optional.empty());
        // 거절 2회 누적 → 3번째 신청은 차단되어야 함
        given(refundRepository.countByPayment_IdAndStatus(any(), eq(RefundStatus.REJECTED))).willReturn(2L);

        assertThatThrownBy(() -> refundService.requestRefund(writerId, "SZ-1",
                new RefundRequest(RefundReason.CUSTOMER_CHANGE_OF_MIND, null)))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("1회 재신청");
    }

    @Test
    @DisplayName("타인 결제 환불 시도: FORBIDDEN")
    void otherWriterPayment_forbidden() {
        Payment payment = doneOnetime(5_000, 550, hoursAgo(1));
        given(paymentRepository.findWithLockByOrderId("SZ-1")).willReturn(Optional.of(payment));

        assertThatThrownBy(() -> refundService.requestRefund(UUID.randomUUID(), "SZ-1",
                new RefundRequest(RefundReason.CUSTOMER_CHANGE_OF_MIND, null)))
                .isInstanceOf(PaymentException.class);
    }

    // ─────────── 운영자: 승인 ───────────

    @Test
    @DisplayName("FULL 승인: PortOne cancel(null) + 토큰 회수 + Payment.CANCELED")
    void approve_full_callsPortOneAndDeducts() {
        Payment payment = doneOnetime(5_000, 550, hoursAgo(24));
        Refund refund = persistedRefund(payment, RefundType.FULL, 5_000, 550);
        given(refundRepository.findById(refund.getId())).willReturn(Optional.of(refund));

        refundService.approveRefund(refund.getId(), "OK");

        verify(portOneClient).cancelPayment(eq("SZ-1"), anyString(), isNull());
        verify(tokenWalletService).deductForRefund(eq(writerId), eq(550), anyString(), any());
        assertThat(refund.getStatus()).isEqualTo(RefundStatus.APPROVED);
    }

    @Test
    @DisplayName("구독 FULL 승인: PortOne cancel + refundSubscription 호출 + 활성 구독 즉시 만료")
    void approve_subscriptionFull_refundsSubscriptionAndExpires() {
        Payment payment = doneSubscription(19_800, 25_000, hoursAgo(24));
        Refund refund = persistedRefund(payment, RefundType.FULL, 19_800, 25_000);
        Subscription subscription = activeSubscription();
        given(refundRepository.findById(refund.getId())).willReturn(Optional.of(refund));
        given(subscriptionRepository.findByWriter_IdAndStatus(writerId, SubscriptionStatus.ACTIVE))
                .willReturn(Optional.of(subscription));

        refundService.approveRefund(refund.getId(), "OK");

        verify(portOneClient).cancelPayment(eq("SUB-1"), anyString(), isNull());
        // 구독 환불은 deductForRefund (purchase 버킷) 가 아니라 refundSubscription 호출.
        verify(tokenWalletService).refundSubscription(eq(writerId), anyString(), any());
        verify(tokenWalletService, never()).deductForRefund(any(), any(Integer.class), anyString(), any());
        assertThat(refund.getStatus()).isEqualTo(RefundStatus.APPROVED);
        // 활성 구독은 즉시 CANCELLED 로 만료 — 자동 갱신 차단.
        assertThat(subscription.getStatus()).isEqualTo(SubscriptionStatus.CANCELLED);
    }

    @Test
    @DisplayName("구독 FULL 승인: 활성 구독이 없어도 토큰 회수는 정상 진행 (과거 결제 뒤늦은 환불)")
    void approve_subscriptionFull_noActiveSubscription_stillRefundsTokens() {
        Payment payment = doneSubscription(19_800, 25_000, hoursAgo(24));
        Refund refund = persistedRefund(payment, RefundType.FULL, 19_800, 25_000);
        given(refundRepository.findById(refund.getId())).willReturn(Optional.of(refund));
        given(subscriptionRepository.findByWriter_IdAndStatus(writerId, SubscriptionStatus.ACTIVE))
                .willReturn(Optional.empty());

        refundService.approveRefund(refund.getId(), "OK");

        verify(tokenWalletService).refundSubscription(eq(writerId), anyString(), any());
        assertThat(refund.getStatus()).isEqualTo(RefundStatus.APPROVED);
    }

    @Test
    @DisplayName("COMPANY_FAULT_CREDIT 승인: PortOne 호출 없음, 크레딧 보상 (chargePurchase)")
    void approve_companyFaultCredit_skipsPortOneAndCharges() {
        Payment payment = doneOnetime(5_000, 550, hoursAgo(30 * 24));
        Refund refund = persistedRefund(payment, RefundType.COMPANY_FAULT_CREDIT, 0, 550);
        given(refundRepository.findById(refund.getId())).willReturn(Optional.of(refund));

        refundService.approveRefund(refund.getId(), "장애 보상");

        verify(portOneClient, never()).cancelPayment(anyString(), anyString(), any());
        verify(tokenWalletService).chargePurchase(eq(writerId), eq(550), anyString(), any());
        assertThat(refund.getStatus()).isEqualTo(RefundStatus.APPROVED);
    }

    // ─────────── 운영자: 거절 / 사용자 취소 ───────────

    @Test
    @DisplayName("거절: status=REJECTED + adminNote 보존")
    void reject_setsStatus() {
        Payment payment = doneOnetime(5_000, 550, hoursAgo(24));
        Refund refund = persistedRefund(payment, RefundType.FULL, 5_000, 550);
        given(refundRepository.findById(refund.getId())).willReturn(Optional.of(refund));

        refundService.rejectRefund(refund.getId(), "정책 미충족");

        assertThat(refund.getStatus()).isEqualTo(RefundStatus.REJECTED);
        assertThat(refund.getAdminNote()).isEqualTo("정책 미충족");
        verify(portOneClient, never()).cancelPayment(anyString(), anyString(), any());
    }

    @Test
    @DisplayName("사용자 취소: REQUESTED → CANCELED")
    void cancel_byUser() {
        Payment payment = doneOnetime(5_000, 550, hoursAgo(24));
        Refund refund = persistedRefund(payment, RefundType.FULL, 5_000, 550);
        given(refundRepository.findById(refund.getId())).willReturn(Optional.of(refund));

        refundService.cancelRequest(writerId, refund.getId());

        assertThat(refund.getStatus()).isEqualTo(RefundStatus.CANCELED);
    }

    // ─────────── helpers ───────────

    private Payment doneOnetime(int amount, int tokenQty, LocalDateTime approvedAt) {
        return donePayment("SZ-1", amount, tokenQty, approvedAt);
    }

    private Payment doneSubscription(int amount, int tokenQty, LocalDateTime approvedAt) {
        return donePayment("SUB-1", amount, tokenQty, approvedAt);
    }

    private Payment donePayment(String orderId, int amount, int tokenQty, LocalDateTime approvedAt) {
        Payment payment = Payment.builder()
                .writer(writer)
                .orderId(orderId)
                .amount(amount)
                .tokenQty(tokenQty)
                .refundPolicyVersion("v1")
                .refundPolicyAgreedAt(approvedAt)
                .build();
        payment.markInProgress();
        payment.markDone("pk_" + orderId, PaymentMethod.EASY_PAY, approvedAt);
        ReflectionTestUtils.setField(payment, "createdAt", approvedAt);
        ReflectionTestUtils.setField(payment, "id", UUID.randomUUID());
        return payment;
    }

    private TokenWallet walletWithPurchase(int balance) {
        TokenWallet wallet = TokenWallet.createEmpty(writerId);
        if (balance > 0) wallet.chargePurchase(balance);
        return wallet;
    }

    private TokenWallet walletWithSubscription(int balance) {
        TokenWallet wallet = TokenWallet.createEmpty(writerId);
        if (balance > 0) wallet.overwriteSubscription(balance);
        return wallet;
    }

    private Subscription activeSubscription() {
        Subscription subscription = Subscription.builder()
                .writer(writer)
                .customerKey("ck_test")
                .billingKey("bk_test")
                .plan("PRO_MONTHLY")
                .monthlyTokens(25_000)
                .monthlyAmount(19_800)
                .nextBillingAt(LocalDateTime.now(ZoneOffset.UTC).plusMonths(1))
                .build();
        ReflectionTestUtils.setField(subscription, "id", UUID.randomUUID());
        return subscription;
    }

    private Refund persistedRefund(Payment payment, RefundType type, int amount, int tokenDeducted) {
        Refund refund = Refund.builder()
                .payment(payment)
                .reason(RefundReason.CUSTOMER_CHANGE_OF_MIND)
                .detail(null)
                .refundType(type)
                .refundAmount(amount)
                .tokenDeducted(tokenDeducted)
                .build();
        ReflectionTestUtils.setField(refund, "id", UUID.randomUUID());
        return refund;
    }

    private LocalDateTime hoursAgo(long hours) {
        return LocalDateTime.now(ZoneOffset.UTC).minusHours(hours);
    }
}
