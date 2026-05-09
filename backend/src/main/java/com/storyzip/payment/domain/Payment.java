package com.storyzip.payment.domain;

import com.storyzip.auth.domain.Writer;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 결제 1건 — payment 테이블.
 *
 * <p>토큰 충전(1회성)과 구독 월별 결제 모두 이 엔티티로 기록된다.
 * {@code orderId}는 우리가 발급해서 토스에 전달하는 고유 주문번호.
 * {@code paymentKey}는 승인 완료 후 토스가 발급한 결제 식별자.
 */
@Entity
@Table(name = "payment")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class Payment {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "UUID")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "writer_id", nullable = false)
    private Writer writer;

    @Column(name = "order_id", nullable = false, unique = true, length = 100)
    private String orderId;

    @Column(name = "payment_key", length = 200)
    private String paymentKey;

    @Column(nullable = false)
    private Integer amount;

    @Column(name = "token_qty", nullable = false)
    private Integer tokenQty;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PaymentStatus status;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private PaymentMethod method;

    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "failure_reason", columnDefinition = "TEXT")
    private String failureReason;

    /**
     * 결제 시 사용자가 동의한 환불 규정의 버전. NOT NULL 강제 — 동의 없이 결제 불가.
     * 약관 변경 시 이 버전으로 어떤 약관에 동의했는지 추적.
     */
    @Column(name = "refund_policy_version", nullable = false, length = 20)
    private String refundPolicyVersion;

    /** 환불 규정 동의 시각 — 결제 생성 시점. */
    @Column(name = "refund_policy_agreed_at", nullable = false)
    private LocalDateTime refundPolicyAgreedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    private Payment(Writer writer, String orderId, Integer amount, Integer tokenQty,
                    String refundPolicyVersion, LocalDateTime refundPolicyAgreedAt) {
        this.writer = writer;
        this.orderId = orderId;
        this.amount = amount;
        this.tokenQty = tokenQty;
        this.status = PaymentStatus.READY;
        this.refundPolicyVersion = refundPolicyVersion;
        this.refundPolicyAgreedAt = refundPolicyAgreedAt;
    }

    public void markInProgress() {
        this.status = PaymentStatus.IN_PROGRESS;
    }

    public void markDone(String paymentKey, PaymentMethod method, LocalDateTime approvedAt) {
        this.paymentKey = paymentKey;
        this.method = method;
        this.approvedAt = approvedAt;
        this.status = PaymentStatus.DONE;
    }

    public void markFailed(String reason) {
        this.failureReason = reason;
        this.status = PaymentStatus.FAILED;
    }

    public void markCanceled(String reason) {
        this.failureReason = reason;
        this.status = PaymentStatus.CANCELED;
    }

    public boolean isDone() {
        return this.status == PaymentStatus.DONE;
    }

    /**
     * 구독 결제(정기결제) 여부.
     *
     * <p>현재는 {@code orderId} prefix({@code SUB-}) 로 식별 — {@code SubscriptionService}
     * 의 {@code generatePaymentId()} 가 발급. 종량제는 {@code SZ-}.
     *
     * <p>식별 방식이 변경되면 (예: 별도 {@code subscription_id} FK 도입) 이 메서드만 수정.
     */
    public boolean isSubscription() {
        return orderId != null && orderId.startsWith(SUBSCRIPTION_ORDER_PREFIX);
    }

    private static final String SUBSCRIPTION_ORDER_PREFIX = "SUB-";
}
