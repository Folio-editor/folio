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
 * 크레딧 지갑 스냅샷 — token_wallet 테이블.
 *
 * <p>PK가 {@code writerId}라 작가당 정확히 1건. 원장은 {@link TokenTransaction}에 남고
 * 이 테이블은 빠른 조회용 스냅샷.
 *
 * <h3>3버킷 구조</h3>
 * <ul>
 *   <li>{@code subscriptionBalance} — 프로 구독 월 지급분. 다음 갱신 시 전부 소멸.</li>
 *   <li>{@code bonusBalance} / {@code bonusExpiresAt} — 신규 가입 보너스. 90일 만료.</li>
 *   <li>{@code purchaseBalance} — 종량제 구매분. 영구 유지.</li>
 * </ul>
 *
 * <h3>차감 우선순위</h3>
 * 구독 → 보너스 → 종량제 (빨리 소멸하는 순). 혼합 차감 허용.
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

    @Column(name = "subscription_balance", nullable = false)
    private Integer subscriptionBalance;

    @Column(name = "bonus_balance", nullable = false)
    private Integer bonusBalance;

    @Column(name = "bonus_expires_at")
    private LocalDateTime bonusExpiresAt;

    @Column(name = "purchase_balance", nullable = false)
    private Integer purchaseBalance;

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
        wallet.subscriptionBalance = 0;
        wallet.bonusBalance = 0;
        wallet.bonusExpiresAt = null;
        wallet.purchaseBalance = 0;
        wallet.totalCharged = 0;
        wallet.totalUsed = 0;
        return wallet;
    }

    /** 유효 보너스 잔액 — 만료 시각이 지났으면 0으로 간주. */
    public int validBonusBalance(LocalDateTime now) {
        if (bonusExpiresAt == null || !now.isBefore(bonusExpiresAt)) {
            return 0;
        }
        return bonusBalance;
    }

    /** 현재 사용 가능한 총 잔액. */
    public int totalBalance(LocalDateTime now) {
        return subscriptionBalance + validBonusBalance(now) + purchaseBalance;
    }

    // ─────────────── 충전 ───────────────

    /** 종량제 결제 충전 — purchase 버킷 누적. */
    public void chargePurchase(int amount) {
        requirePositive(amount);
        this.purchaseBalance += amount;
        this.totalCharged += amount;
    }

    /**
     * 구독 월 갱신 충전 — subscription 버킷 덮어쓰기.
     * 이전 잔여분은 호출자가 EXPIRE 원장에 기록한 뒤 이 메서드를 호출한다.
     *
     * @return 덮어쓰기로 인해 소멸된 이전 구독 잔여분 (EXPIRE 원장 기록용)
     */
    public int overwriteSubscription(int amount) {
        requirePositive(amount);
        int expired = this.subscriptionBalance;
        this.subscriptionBalance = amount;
        this.totalCharged += amount;
        return expired;
    }

    /** 신규 가입 보너스 지급 — bonus 버킷 덮어쓰기 + 만료일 설정. */
    public void grantBonus(int amount, LocalDateTime expiresAt) {
        requirePositive(amount);
        if (expiresAt == null) {
            throw new PaymentException(ErrorCode.INVALID_REQUEST, "보너스 만료일은 필수입니다");
        }
        this.bonusBalance = amount;
        this.bonusExpiresAt = expiresAt;
        this.totalCharged += amount;
    }

    // ─────────────── 차감 ───────────────

    /**
     * 차감 계산 결과 — 어느 버킷에서 얼마씩 뺐는지.
     * 혼합 차감 시 원장에 복수 레코드를 기록할 때 쓰인다.
     */
    public record DeductResult(int fromSubscription, int fromBonus, int fromPurchase) {
        public int total() {
            return fromSubscription + fromBonus + fromPurchase;
        }
    }

    /**
     * 기능 사용 차감. 구독 → 보너스 → 종량제 순으로 차감하고,
     * 잔액 부족 시 {@link PaymentException}({@link ErrorCode#INSUFFICIENT_TOKEN}).
     */
    public DeductResult deductForUsage(int amount, LocalDateTime now) {
        requirePositive(amount);
        int validBonus = validBonusBalance(now);
        if (subscriptionBalance + validBonus + purchaseBalance < amount) {
            throw new PaymentException(ErrorCode.INSUFFICIENT_TOKEN);
        }
        int remaining = amount;

        int fromSub = Math.min(remaining, subscriptionBalance);
        this.subscriptionBalance -= fromSub;
        remaining -= fromSub;

        int fromBonus = Math.min(remaining, validBonus);
        this.bonusBalance -= fromBonus;
        remaining -= fromBonus;

        int fromPurchase = Math.min(remaining, purchaseBalance);
        this.purchaseBalance -= fromPurchase;
        remaining -= fromPurchase;

        this.totalUsed += amount;
        return new DeductResult(fromSub, fromBonus, fromPurchase);
    }

    /**
     * 환불로 인한 회수 — 종량제(purchase)에서만 차감. 가진 만큼만 빼고 음수로 가지 않는다.
     *
     * @return 실제 차감된 양
     */
    public int deductForRefund(int amount) {
        requirePositive(amount);
        int actual = Math.min(amount, purchaseBalance);
        this.purchaseBalance -= actual;
        this.totalUsed += actual;
        return actual;
    }

    // ─────────────── 만료 ───────────────

    /**
     * 구독 만료 처리 — 해지 예약 구독의 주기가 끝났을 때 호출.
     *
     * @return 소멸된 구독 잔여분 (EXPIRE 원장 기록용)
     */
    public int expireSubscription() {
        int expired = this.subscriptionBalance;
        this.subscriptionBalance = 0;
        return expired;
    }

    /**
     * 보너스 만료 처리 — 스케줄러에서 호출.
     *
     * @return 소멸된 보너스 잔여분
     */
    public int expireBonus() {
        int expired = this.bonusBalance;
        this.bonusBalance = 0;
        this.bonusExpiresAt = null;
        return expired;
    }

    private static void requirePositive(int amount) {
        if (amount <= 0) {
            throw new PaymentException(ErrorCode.INVALID_REQUEST, "크레딧 금액은 양수여야 합니다");
        }
    }
}
