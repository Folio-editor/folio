package com.storyzip.payment.service;

import com.storyzip.payment.domain.TokenTransaction;
import com.storyzip.payment.domain.TokenTransactionType;
import com.storyzip.payment.domain.TokenWallet;
import com.storyzip.payment.dto.TokenWalletResponse;
import com.storyzip.payment.repository.TokenTransactionRepository;
import com.storyzip.payment.repository.TokenWalletRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 토큰 지갑/원장 서비스.
 *
 * <p>모든 충전·차감 메서드는 {@link TokenWalletRepository#findWithLockByWriterId}로
 * 행 잠금 후 진행해 동시 요청 간 잔액 꼬임을 방지한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TokenWalletService {

    private static final int TOKEN_VALIDITY_DAYS = 365;

    private final TokenWalletRepository walletRepository;
    private final TokenTransactionRepository transactionRepository;

    @Transactional(readOnly = true)
    public TokenWalletResponse getWallet(UUID writerId) {
        TokenWallet wallet = walletRepository.findById(writerId)
                .orElseGet(() -> walletRepository.save(TokenWallet.createEmpty(writerId)));
        return TokenWalletResponse.from(wallet);
    }

    /**
     * 유료 결제·프로 구독으로 인한 충전. 원장에 기록하고 잔액을 증가시킨다.
     *
     * @param referenceId 연관 Payment ID 등 (원장 역추적용)
     */
    @Transactional
    public void charge(UUID writerId, int amount, TokenTransactionType type,
                       String reason, UUID referenceId) {
        TokenWallet wallet = walletRepository.findWithLockByWriterId(writerId)
                .orElseGet(() -> walletRepository.save(TokenWallet.createEmpty(writerId)));
        wallet.charge(amount);

        transactionRepository.save(TokenTransaction.builder()
                .writerId(writerId)
                .amount(amount)
                .type(type)
                .reason(reason)
                .referenceId(referenceId)
                .expiresAt(LocalDateTime.now().plusDays(TOKEN_VALIDITY_DAYS))
                .build());
    }

    /** AI 기능 사용으로 인한 차감. 잔액 부족 시 {@link com.storyzip.common.exception.PaymentException} 발생. */
    @Transactional
    public void use(UUID writerId, int amount, String reason, UUID referenceId) {
        TokenWallet wallet = walletRepository.findWithLockByWriterId(writerId)
                .orElseGet(() -> walletRepository.save(TokenWallet.createEmpty(writerId)));
        wallet.use(amount);

        transactionRepository.save(TokenTransaction.builder()
                .writerId(writerId)
                .amount(-amount)
                .type(TokenTransactionType.USAGE)
                .reason(reason)
                .referenceId(referenceId)
                .build());
    }
}
