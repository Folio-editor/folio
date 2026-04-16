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
import com.storyzip.payment.domain.Subscription;
import com.storyzip.payment.domain.SubscriptionStatus;
import com.storyzip.payment.domain.TokenTransactionType;
import com.storyzip.payment.dto.CreateSubscriptionRequest;
import com.storyzip.payment.dto.SubscriptionResponse;
import com.storyzip.payment.repository.PaymentRepository;
import com.storyzip.payment.repository.SubscriptionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class SubscriptionServiceTest {

    @Mock SubscriptionRepository subscriptionRepository;
    @Mock PaymentRepository paymentRepository;
    @Mock WriterRepository writerRepository;
    @Mock TossPaymentsClient tossPaymentsClient;
    @Mock TokenWalletService tokenWalletService;
    @Mock TossPaymentsProperties tossProperties;

    @InjectMocks SubscriptionService subscriptionService;

    UUID writerId;
    Writer writer;

    @BeforeEach
    void setUp() {
        writerId = UUID.randomUUID();
        writer = Writer.builder().email("w@storyzip.app").nickname("w").build();
        ReflectionTestUtils.setField(writer, "id", writerId);
    }

    // ===== prepareBillingAuth =====

    @Test
    @DisplayName("prepareBillingAuth: 이미 ACTIVE 구독 있으면 SUBSCRIPTION_ALREADY_ACTIVE")
    void prepareBillingAuth_blockedWhenAlreadyActive() {
        given(writerRepository.findById(writerId)).willReturn(Optional.of(writer));
        given(subscriptionRepository.findByWriter_IdAndStatus(writerId, SubscriptionStatus.ACTIVE))
                .willReturn(Optional.of(newActiveSubscription()));

        assertThatThrownBy(() -> subscriptionService.prepareBillingAuth(writerId))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.SUBSCRIPTION_ALREADY_ACTIVE);
    }

    @Test
    @DisplayName("prepareBillingAuth: customerKey는 ck_ 접두 + clientKey 동시 반환")
    void prepareBillingAuth_returnsCustomerKeyAndClientKey() {
        given(writerRepository.findById(writerId)).willReturn(Optional.of(writer));
        given(subscriptionRepository.findByWriter_IdAndStatus(writerId, SubscriptionStatus.ACTIVE))
                .willReturn(Optional.empty());
        given(tossProperties.clientKey()).willReturn("test_ck_xxx");

        var response = subscriptionService.prepareBillingAuth(writerId);

        assertThat(response.customerKey()).startsWith("ck_");
        assertThat(response.clientKey()).isEqualTo("test_ck_xxx");
    }

    // ===== create =====

    @Test
    @DisplayName("create: 빌링키 발급 + 첫 결제 + 토큰 충전 + Subscription ACTIVE 저장")
    void create_happyPath() {
        given(writerRepository.findById(writerId)).willReturn(Optional.of(writer));
        given(subscriptionRepository.findByWriter_IdAndStatus(writerId, SubscriptionStatus.ACTIVE))
                .willReturn(Optional.empty());
        given(tossPaymentsClient.issueBillingKey("ak_1", "ck_1"))
                .willReturn(new TossBillingAuthResponse(
                        "mid", "ck_1", "2026-04-16T10:00:00+09:00", "카드",
                        "bk_abc", "KB", "****-****-****-1234"));
        given(subscriptionRepository.save(any(Subscription.class))).willAnswer(inv -> inv.getArgument(0));
        given(paymentRepository.save(any(Payment.class))).willAnswer(inv -> inv.getArgument(0));
        given(tossPaymentsClient.chargeBilling(eq("bk_abc"), eq("ck_1"), anyString(), anyString(), eq(9_900), anyString()))
                .willReturn(new TossConfirmResponse("pk_1", "SUB-123", "DONE", "카드",
                        9_900, OffsetDateTime.now()));

        SubscriptionResponse response = subscriptionService.create(
                writerId, new CreateSubscriptionRequest("PRO_MONTHLY", "ak_1", "ck_1"));

        assertThat(response.status()).isEqualTo(SubscriptionStatus.ACTIVE);
        assertThat(response.monthlyAmount()).isEqualTo(9_900);
        assertThat(response.monthlyTokens()).isEqualTo(25_000);

        verify(tokenWalletService).charge(eq(writerId), eq(25_000),
                eq(TokenTransactionType.SUBSCRIPTION), anyString(), any());
    }

    @Test
    @DisplayName("create: 이미 ACTIVE 구독 있으면 SUBSCRIPTION_ALREADY_ACTIVE — 토스 호출 차단")
    void create_blockedWhenAlreadyActive() {
        given(writerRepository.findById(writerId)).willReturn(Optional.of(writer));
        given(subscriptionRepository.findByWriter_IdAndStatus(writerId, SubscriptionStatus.ACTIVE))
                .willReturn(Optional.of(newActiveSubscription()));

        assertThatThrownBy(() -> subscriptionService.create(writerId,
                new CreateSubscriptionRequest("PRO_MONTHLY", "ak_1", "ck_1")))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.SUBSCRIPTION_ALREADY_ACTIVE);

        verify(tossPaymentsClient, never()).issueBillingKey(anyString(), anyString());
        verify(tossPaymentsClient, never()).chargeBilling(anyString(), anyString(), anyString(), anyString(), anyInt(), anyString());
    }

    // ===== cancel / resume =====

    @Test
    @DisplayName("cancel: cancelledAt 기록 + 상태는 ACTIVE 유지")
    void cancel_reservesAndKeepsActive() {
        Subscription s = newActiveSubscription();
        given(subscriptionRepository.findByWriter_IdAndStatus(writerId, SubscriptionStatus.ACTIVE))
                .willReturn(Optional.of(s));

        SubscriptionResponse response = subscriptionService.cancel(writerId);

        assertThat(response.status()).isEqualTo(SubscriptionStatus.ACTIVE);
        assertThat(response.cancelReserved()).isTrue();
        assertThat(response.cancelledAt()).isNotNull();
    }

    @Test
    @DisplayName("resume: cancelledAt 제거")
    void resume_clearsCancelledAt() {
        Subscription s = newActiveSubscription();
        s.reserveCancel();
        given(subscriptionRepository.findByWriter_IdAndStatus(writerId, SubscriptionStatus.ACTIVE))
                .willReturn(Optional.of(s));

        SubscriptionResponse response = subscriptionService.resume(writerId);

        assertThat(response.cancelReserved()).isFalse();
        assertThat(response.cancelledAt()).isNull();
    }

    @Test
    @DisplayName("cancel: ACTIVE 구독이 없으면 SUBSCRIPTION_NOT_FOUND")
    void cancel_notFound() {
        given(subscriptionRepository.findByWriter_IdAndStatus(writerId, SubscriptionStatus.ACTIVE))
                .willReturn(Optional.empty());

        assertThatThrownBy(() -> subscriptionService.cancel(writerId))
                .isInstanceOf(PaymentException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.SUBSCRIPTION_NOT_FOUND);
    }

    // ===== processBilling =====

    @Test
    @DisplayName("processBilling: 해지 예약 구독은 결제 건너뛰고 CANCELLED 전환")
    void processBilling_cancelReserved_expires() {
        Subscription s = newActiveSubscription();
        s.reserveCancel();
        UUID subId = UUID.randomUUID();
        ReflectionTestUtils.setField(s, "id", subId);
        given(subscriptionRepository.findById(subId)).willReturn(Optional.of(s));

        subscriptionService.processBilling(subId);

        assertThat(s.getStatus()).isEqualTo(SubscriptionStatus.CANCELLED);
        verify(tossPaymentsClient, never()).chargeBilling(anyString(), anyString(), anyString(), anyString(), anyInt(), anyString());
    }

    @Test
    @DisplayName("processBilling: 성공 시 다음 청구일 +1개월 + 토큰 충전")
    void processBilling_success_updatesNextBilling() {
        Subscription s = newActiveSubscription();
        UUID subId = UUID.randomUUID();
        ReflectionTestUtils.setField(s, "id", subId);
        LocalDateTime originalNext = s.getNextBillingAt();
        given(subscriptionRepository.findById(subId)).willReturn(Optional.of(s));
        given(paymentRepository.save(any(Payment.class))).willAnswer(inv -> inv.getArgument(0));
        given(tossPaymentsClient.chargeBilling(anyString(), anyString(), anyString(), anyString(), eq(9_900), anyString()))
                .willReturn(new TossConfirmResponse("pk_2", "SUB-999", "DONE", "카드",
                        9_900, OffsetDateTime.now()));

        subscriptionService.processBilling(subId);

        assertThat(s.getNextBillingAt()).isAfter(originalNext);
        assertThat(s.getRetryCount()).isZero();
        verify(tokenWalletService).charge(eq(writerId), eq(25_000),
                eq(TokenTransactionType.SUBSCRIPTION), anyString(), any());
    }

    @Test
    @DisplayName("processBilling: 토스 실패 시 retryCount 증가 + 3일 뒤 재시도 예약 (PAYMENT_FAILED 아님)")
    void processBilling_fail_schedulesRetry() {
        Subscription s = newActiveSubscription();
        UUID subId = UUID.randomUUID();
        ReflectionTestUtils.setField(s, "id", subId);
        given(subscriptionRepository.findById(subId)).willReturn(Optional.of(s));
        given(paymentRepository.save(any(Payment.class))).willAnswer(inv -> inv.getArgument(0));
        given(tossPaymentsClient.chargeBilling(anyString(), anyString(), anyString(), anyString(), anyInt(), anyString()))
                .willThrow(new PaymentException(ErrorCode.PAYMENT_FAILED));

        subscriptionService.processBilling(subId);

        assertThat(s.getRetryCount()).isEqualTo(1);
        assertThat(s.getStatus()).isEqualTo(SubscriptionStatus.ACTIVE);
        verify(tokenWalletService, never()).charge(any(), anyInt(), any(), anyString(), any());
    }

    @Test
    @DisplayName("processBilling: 이미 ACTIVE 아닌 구독(예: CANCELLED)은 노옵")
    void processBilling_notActive_isNoOp() {
        Subscription s = newActiveSubscription();
        s.reserveCancel();
        s.expire();
        UUID subId = UUID.randomUUID();
        ReflectionTestUtils.setField(s, "id", subId);
        given(subscriptionRepository.findById(subId)).willReturn(Optional.of(s));

        subscriptionService.processBilling(subId);

        verify(tossPaymentsClient, never()).chargeBilling(anyString(), anyString(), anyString(), anyString(), anyInt(), anyString());
    }

    private Subscription newActiveSubscription() {
        return Subscription.builder()
                .writer(writer)
                .customerKey("ck_1")
                .billingKey("bk_1")
                .plan("PRO_MONTHLY")
                .monthlyTokens(25_000)
                .monthlyAmount(9_900)
                .nextBillingAt(LocalDateTime.now().plusDays(30))
                .build();
    }
}
