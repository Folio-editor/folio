package com.storyzip.payment.domain;

import com.storyzip.auth.domain.Writer;
import com.storyzip.common.exception.PaymentException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SubscriptionTest {

    private Subscription newActive() {
        return Subscription.builder()
                .writer(Writer.builder().email("w@storyzip.app").nickname("w").build())
                .customerKey("ck_1")
                .billingKey("bk_1")
                .plan("PRO_MONTHLY")
                .monthlyTokens(25_000)
                .monthlyAmount(19_800)
                .nextBillingAt(LocalDateTime.now().plusDays(30))
                .build();
    }

    @Test
    @DisplayName("build: 기본 상태는 ACTIVE, retryCount는 0")
    void build_defaultsToActive() {
        Subscription s = newActive();
        assertThat(s.getStatus()).isEqualTo(SubscriptionStatus.ACTIVE);
        assertThat(s.getRetryCount()).isZero();
        assertThat(s.isActive()).isTrue();
    }

    @Test
    @DisplayName("recordPaymentSuccess: retryCount 초기화 + nextBillingAt 갱신")
    void recordPaymentSuccess_resetsRetryAndUpdatesNext() {
        Subscription s = newActive();
        s.recordPaymentFailure(LocalDateTime.now());

        LocalDateTime paidAt = LocalDateTime.now();
        s.recordPaymentSuccess(paidAt, paidAt.plusMonths(1));

        assertThat(s.getRetryCount()).isZero();
        assertThat(s.getLastPaymentAt()).isEqualTo(paidAt);
        assertThat(s.getNextBillingAt()).isEqualTo(paidAt.plusMonths(1));
    }

    @Test
    @DisplayName("recordPaymentFailure: 실패 3회 미만은 3일 뒤 재시도 예약, ACTIVE 유지")
    void recordPaymentFailure_schedulesRetry() {
        Subscription s = newActive();
        LocalDateTime failedAt = LocalDateTime.now();
        s.recordPaymentFailure(failedAt);

        assertThat(s.getRetryCount()).isEqualTo(1);
        assertThat(s.getStatus()).isEqualTo(SubscriptionStatus.ACTIVE);
        assertThat(s.getNextBillingAt()).isEqualTo(failedAt.plusDays(3));
    }

    @Test
    @DisplayName("recordPaymentFailure: 3회 실패 시 PAYMENT_FAILED 전환")
    void recordPaymentFailure_transitionsToPaymentFailedAfter3() {
        Subscription s = newActive();
        LocalDateTime t = LocalDateTime.now();
        s.recordPaymentFailure(t);
        s.recordPaymentFailure(t);
        s.recordPaymentFailure(t);

        assertThat(s.getRetryCount()).isEqualTo(3);
        assertThat(s.getStatus()).isEqualTo(SubscriptionStatus.PAYMENT_FAILED);
    }

    @Test
    @DisplayName("reserveCancel: 상태는 ACTIVE 유지 + cancelledAt 기록")
    void reserveCancel_keepsActive() {
        Subscription s = newActive();
        s.reserveCancel();

        assertThat(s.getStatus()).isEqualTo(SubscriptionStatus.ACTIVE);
        assertThat(s.getCancelledAt()).isNotNull();
        assertThat(s.isCancelReserved()).isTrue();
    }

    @Test
    @DisplayName("reserveCancel 중복 호출은 예외")
    void reserveCancel_twice_throws() {
        Subscription s = newActive();
        s.reserveCancel();
        assertThatThrownBy(s::reserveCancel).isInstanceOf(PaymentException.class);
    }

    @Test
    @DisplayName("resume: 해지 예약 철회 — cancelledAt 제거")
    void resume_clearsCancelledAt() {
        Subscription s = newActive();
        s.reserveCancel();
        s.resume();

        assertThat(s.getCancelledAt()).isNull();
        assertThat(s.isCancelReserved()).isFalse();
    }

    @Test
    @DisplayName("resume: 해지 예약 아닌 상태에서 호출 시 예외")
    void resume_withoutCancel_throws() {
        Subscription s = newActive();
        assertThatThrownBy(s::resume).isInstanceOf(PaymentException.class);
    }

    @Test
    @DisplayName("expire: status를 CANCELLED로 전환")
    void expire_marksCancelled() {
        Subscription s = newActive();
        s.reserveCancel();
        s.expire();

        assertThat(s.getStatus()).isEqualTo(SubscriptionStatus.CANCELLED);
    }
}
