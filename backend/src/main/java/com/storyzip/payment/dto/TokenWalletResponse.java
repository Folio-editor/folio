package com.storyzip.payment.dto;

import com.storyzip.payment.domain.TokenWallet;

public record TokenWalletResponse(
        int balance,
        int totalCharged,
        int totalUsed
) {
    public static TokenWalletResponse from(TokenWallet w) {
        return new TokenWalletResponse(w.getBalance(), w.getTotalCharged(), w.getTotalUsed());
    }
}
