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

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    private Payment(Writer writer, String orderId, Integer amount, Integer tokenQty) {
        this.writer = writer;
        this.orderId = orderId;
        this.amount = amount;
        this.tokenQty = tokenQty;
        this.status = PaymentStatus.READY;
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
}
