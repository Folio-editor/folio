package com.storyzip.payment.domain;

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
 * 환불 1건 — refund 테이블.
 *
 * <p>약관 제5조에 따라 환불은 즉시 처리되지 않는다. 사용자가 신청하면 {@link RefundStatus#REQUESTED}
 * 상태로 저장되고, 운영자가 이메일을 검토한 뒤 승인/거절을 결정한다.
 *
 * <p>한 결제당 환불 1건 (재신청은 거절 후 1회 허용 — 같은 paymentId의 REJECTED 상태가 있어도
 * 새 row로 INSERT 가능. 단 active(REQUESTED/APPROVED) 상태가 있으면 신규 신청 불가).
 *
 * <p>보존 의무: 전자상거래법 제6조에 따라 5년 이상 보관.
 */
@Entity
@Table(name = "refund", indexes = {
        @Index(name = "idx_refund_payment_id", columnList = "payment_id"),
        @Index(name = "idx_refund_status", columnList = "status"),
        @Index(name = "idx_refund_requested_at", columnList = "requested_at")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class Refund {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "UUID")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "payment_id", nullable = false)
    private Payment payment;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RefundStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private RefundReason reason;

    @Column(length = 500)
    private String detail;

    /** 신청 시점에 정한 분류 — 승인 시 그대로 처리. */
    @Enumerated(EnumType.STRING)
    @Column(name = "refund_type", nullable = false, length = 20)
    private RefundType refundType;

    /** 신청 시점에 계산한 환불 금액 (원). 승인 시 PortOne 취소 호출에 사용. */
    @Column(name = "refund_amount", nullable = false)
    private Integer refundAmount;

    /** 회수할 토큰 양 (회사 귀책 보상 시는 보상 크레딧 양). */
    @Column(name = "token_deducted", nullable = false)
    private Integer tokenDeducted;

    @Column(name = "requested_at", nullable = false)
    private LocalDateTime requestedAt;

    /** 승인/거절 처리 시각. REQUESTED 상태에서는 NULL. */
    @Column(name = "processed_at")
    private LocalDateTime processedAt;

    /** 운영자가 거절 시 입력한 사유 / 승인 시 메모. */
    @Column(name = "admin_note", length = 500)
    private String adminNote;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    private Refund(Payment payment, RefundReason reason, String detail,
                   RefundType refundType, int refundAmount, int tokenDeducted) {
        this.payment = payment;
        this.reason = reason;
        this.detail = detail;
        this.refundType = refundType;
        this.refundAmount = refundAmount;
        this.tokenDeducted = tokenDeducted;
        this.status = RefundStatus.REQUESTED;
        this.requestedAt = LocalDateTime.now(java.time.ZoneOffset.UTC);
    }

    public void approve(String note) {
        if (this.status != RefundStatus.REQUESTED) {
            throw new IllegalStateException("REQUESTED 상태만 승인할 수 있습니다: " + this.status);
        }
        this.status = RefundStatus.APPROVED;
        this.adminNote = note;
        this.processedAt = LocalDateTime.now(java.time.ZoneOffset.UTC);
    }

    public void reject(String note) {
        if (this.status != RefundStatus.REQUESTED) {
            throw new IllegalStateException("REQUESTED 상태만 거절할 수 있습니다: " + this.status);
        }
        this.status = RefundStatus.REJECTED;
        this.adminNote = note;
        this.processedAt = LocalDateTime.now(java.time.ZoneOffset.UTC);
    }

    public void cancelByUser() {
        if (this.status != RefundStatus.REQUESTED) {
            throw new IllegalStateException("REQUESTED 상태만 취소할 수 있습니다: " + this.status);
        }
        this.status = RefundStatus.CANCELED;
        this.processedAt = LocalDateTime.now(java.time.ZoneOffset.UTC);
    }

    public boolean isActive() {
        return this.status == RefundStatus.REQUESTED || this.status == RefundStatus.APPROVED;
    }
}
