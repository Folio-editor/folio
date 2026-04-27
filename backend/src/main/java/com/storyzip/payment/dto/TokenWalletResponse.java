package com.storyzip.payment.dto;

import com.storyzip.payment.domain.TokenWallet;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

/**
 * 크레딧 지갑 응답. 3버킷을 분리해서 노출한다.
 *
 * <p>{@code balance}는 현재 사용 가능한 총 잔액(만료 보너스 제외).
 */
public record TokenWalletResponse(
        int balance,
        int subscriptionBalance,
        int bonusBalance,
        LocalDateTime bonusExpiresAt,
        int purchaseBalance,
        int totalCharged,
        int totalUsed
) {
    public static TokenWalletResponse from(TokenWallet w) {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        return new TokenWalletResponse(
                w.totalBalance(now),
                w.getSubscriptionBalance(),
                w.validBonusBalance(now),
                w.getBonusExpiresAt(),
                w.getPurchaseBalance(),
                w.getTotalCharged(),
                w.getTotalUsed()
        );
    }
}
