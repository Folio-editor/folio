package com.storyzip.payment.domain;

import com.storyzip.auth.domain.Writer;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 구독 — subscription 테이블.
 *
 * <p>한 작가의 활성 구독은 최대 1건({@code status=ACTIVE}). 재구독 시 새 레코드 생성.
 * {@code customerKey}는 토스 정기결제 API에 전달하는 식별자로 빌링키와 세트.
 *
 * <p>해지 정책: 즉시 종료 아닌 "현재 주기 종료 후 만료".
 * {@link #reserveCancel()}이 호출되어도 {@code status}는 ACTIVE 유지되고
 * {@code cancelledAt}만 기록된다. 스케줄러가 {@code nextBillingAt} 도달 시
 * {@code cancelledAt != null}이면 결제를 건너뛰고 {@link #expire()}로 전환한다.
 */
@Entity
@Table(name = "subscription")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class Subscription {

    private static final int MAX_RETRY = 3;
    private static final int RETRY_INTERVAL_DAYS = 3;

    @Id
    @GeneratedValue
    @Column(columnDefinition = "UUID")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "writer_id", nullable = false)
    private Writer writer;

    @Column(name = "customer_key", nullable = false, unique = true, length = 100)
    private String customerKey;

    @Column(name = "billing_key", nullable = false, length = 200)
    private String billingKey;

    @Column(nullable = false, length = 50)
    private String plan;

    @Column(name = "monthly_tokens", nullable = false)
    private Integer monthlyTokens;

    @Column(name = "monthly_amount", nullable = false)
    private Integer monthlyAmount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SubscriptionStatus status;

    @Column(name = "next_billing_at", nullable = false)
    private LocalDateTime nextBillingAt;

    @Column(name = "last_payment_at")
    private LocalDateTime lastPaymentAt;

    @Column(name = "retry_count", nullable = false)
    private Integer retryCount;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private Subscription(Writer writer, String customerKey, String billingKey, String plan,
                         Integer monthlyTokens, Integer monthlyAmount, LocalDateTime nextBillingAt) {
        this.writer = writer;
        this.customerKey = customerKey;
        this.billingKey = billingKey;
        this.plan = plan;
        this.monthlyTokens = monthlyTokens;
        this.monthlyAmount = monthlyAmount;
        this.status = SubscriptionStatus.ACTIVE;
        this.nextBillingAt = nextBillingAt;
        this.retryCount = 0;
    }

    /** 정기 결제 성공 — 다음 청구일을 한 달 뒤로 갱신하고 재시도 카운터 초기화. */
    public void recordPaymentSuccess(LocalDateTime paidAt, LocalDateTime nextBillingAt) {
        this.lastPaymentAt = paidAt;
        this.nextBillingAt = nextBillingAt;
        this.retryCount = 0;
    }

    /**
     * 정기 결제 실패 — 재시도 간격만큼 {@code nextBillingAt}을 미루고 카운터 증가.
     * 3회 연속 실패 시 {@link SubscriptionStatus#PAYMENT_FAILED}로 전환한다.
     */
    public void recordPaymentFailure(LocalDateTime failedAt) {
        this.retryCount += 1;
        if (this.retryCount >= MAX_RETRY) {
            this.status = SubscriptionStatus.PAYMENT_FAILED;
        } else {
            this.nextBillingAt = failedAt.plusDays(RETRY_INTERVAL_DAYS);
        }
    }

    /**
     * 해지 예약. 다음 결제일 전까지는 ACTIVE 유지 — 이미 결제한 기간 혜택 유지.
     * 스케줄러가 {@code nextBillingAt} 도달 시 {@link #expire()}를 호출해 종료.
     */
    public void reserveCancel() {
        if (this.status != SubscriptionStatus.ACTIVE) {
            throw new PaymentException(ErrorCode.INVALID_REQUEST, "ACTIVE 상태인 구독만 해지할 수 있습니다");
        }
        if (this.cancelledAt != null) {
            throw new PaymentException(ErrorCode.INVALID_REQUEST, "이미 해지 예약된 구독입니다");
        }
        this.cancelledAt = LocalDateTime.now();
    }

    /** 해지 예약 취소 — cancelledAt을 지워 정기 갱신을 유지한다. */
    public void resume() {
        if (this.status != SubscriptionStatus.ACTIVE) {
            throw new PaymentException(ErrorCode.INVALID_REQUEST, "해지 예약 취소는 ACTIVE 구독에서만 가능합니다");
        }
        if (this.cancelledAt == null) {
            throw new PaymentException(ErrorCode.INVALID_REQUEST, "해지 예약 상태가 아닙니다");
        }
        this.cancelledAt = null;
    }

    /** 해지 예약 구독의 현재 주기가 끝났을 때 호출 — 실제 종료 처리. */
    public void expire() {
        this.status = SubscriptionStatus.CANCELLED;
    }

    public boolean isActive() {
        return this.status == SubscriptionStatus.ACTIVE;
    }

    public boolean isCancelReserved() {
        return this.status == SubscriptionStatus.ACTIVE && this.cancelledAt != null;
    }
}
