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
 * 혼합 차감(구독+보너스 등) 시에는 버킷별로 분리된 레코드가 복수 생성된다.
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

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TokenBucket bucket;

    @Column(nullable = false)
    private Integer amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TokenTransactionType type;

    @Column(length = 100)
    private String reason;

    @Column(name = "reference_id", columnDefinition = "UUID")
    private UUID referenceId;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private TokenTransaction(UUID writerId, TokenBucket bucket, Integer amount,
                             TokenTransactionType type, String reason, UUID referenceId) {
        this.writerId = writerId;
        this.bucket = bucket;
        this.amount = amount;
        this.type = type;
        this.reason = reason;
        this.referenceId = referenceId;
    }
}
