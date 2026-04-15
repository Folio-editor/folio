package com.storyzip.payment.domain;

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
 * 토큰 원장 — token_transaction 테이블. append-only.
 *
 * <p>충전/차감/만료를 모두 개별 레코드로 기록. 잔액 계산의 진실의 소스.
 * {@code expiresAt}은 충전 성격의 레코드에서만 채워지며, FIFO 만료 처리의 기준.
 */
@Entity
@Table(name = "token_transaction")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class TokenTransaction {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "UUID")
    private UUID id;

    @Column(name = "writer_id", nullable = false, columnDefinition = "UUID")
    private UUID writerId;

    @Column(nullable = false)
    private Integer amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TokenTransactionType type;

    @Column(length = 100)
    private String reason;

    @Column(name = "reference_id", columnDefinition = "UUID")
    private UUID referenceId;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private TokenTransaction(UUID writerId, Integer amount, TokenTransactionType type,
                             String reason, UUID referenceId, LocalDateTime expiresAt) {
        this.writerId = writerId;
        this.amount = amount;
        this.type = type;
        this.reason = reason;
        this.referenceId = referenceId;
        this.expiresAt = expiresAt;
    }
}
