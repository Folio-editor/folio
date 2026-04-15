package com.storyzip.payment.domain;

import com.storyzip.auth.domain.Writer;
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
 */
@Entity
@Table(name = "subscription")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class Subscription {

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
                         Integer monthlyTokens, LocalDateTime nextBillingAt) {
        this.writer = writer;
        this.customerKey = customerKey;
        this.billingKey = billingKey;
        this.plan = plan;
        this.monthlyTokens = monthlyTokens;
        this.status = SubscriptionStatus.ACTIVE;
        this.nextBillingAt = nextBillingAt;
        this.retryCount = 0;
    }

    public void recordPaymentSuccess(LocalDateTime paidAt, LocalDateTime nextBillingAt) {
        this.lastPaymentAt = paidAt;
        this.nextBillingAt = nextBillingAt;
        this.retryCount = 0;
    }

    public void recordPaymentFailure() {
        this.retryCount += 1;
        if (this.retryCount >= 3) {
            this.status = SubscriptionStatus.PAYMENT_FAILED;
        }
    }

    public void cancel() {
        this.status = SubscriptionStatus.CANCELLED;
        this.cancelledAt = LocalDateTime.now();
    }

    public boolean isActive() {
        return this.status == SubscriptionStatus.ACTIVE;
    }
}
