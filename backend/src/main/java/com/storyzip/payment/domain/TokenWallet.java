package com.storyzip.payment.domain;

import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 토큰 잔액 스냅샷 — token_wallet 테이블.
 *
 * <p>PK가 {@code writerId}라 작가당 정확히 1건. 실제 증감 이력은 {@link TokenTransaction}에 남고
 * 이 테이블은 빠른 조회용 스냅샷 역할.
 */
@Entity
@Table(name = "token_wallet")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class TokenWallet {

    @Id
    @Column(name = "writer_id", columnDefinition = "UUID")
    private UUID writerId;

    @Column(nullable = false)
    private Integer balance;

    @Column(name = "total_charged", nullable = false)
    private Integer totalCharged;

    @Column(name = "total_used", nullable = false)
    private Integer totalUsed;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public static TokenWallet createEmpty(UUID writerId) {
        TokenWallet wallet = new TokenWallet();
        wallet.writerId = writerId;
        wallet.balance = 0;
        wallet.totalCharged = 0;
        wallet.totalUsed = 0;
        return wallet;
    }

    public void charge(int amount) {
        if (amount <= 0) {
            throw new PaymentException(ErrorCode.INVALID_REQUEST, "충전 금액은 양수여야 합니다");
        }
        this.balance += amount;
        this.totalCharged += amount;
    }

    public void use(int amount) {
        if (amount <= 0) {
            throw new PaymentException(ErrorCode.INVALID_REQUEST, "사용 금액은 양수여야 합니다");
        }
        if (this.balance < amount) {
            throw new PaymentException(ErrorCode.INSUFFICIENT_TOKEN);
        }
        this.balance -= amount;
        this.totalUsed += amount;
    }
}
