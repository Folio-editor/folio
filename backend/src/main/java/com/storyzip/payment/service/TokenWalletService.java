package com.storyzip.payment.service;

import com.storyzip.payment.domain.TokenBucket;
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
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 크레딧 지갑/원장 서비스.
 *
 * <p>지갑은 3버킷(SUBSCRIPTION / BONUS / PURCHASE)으로 분리되어 있고,
 * 차감 시 구독 → 보너스 → 종량제 순으로 소진한다. 원장에는 버킷별로
 * 분리된 레코드가 기록되어 감사 추적이 정확하다.
 *
 * <p>모든 쓰기 메서드는 {@link TokenWalletRepository#findWithLockByWriterId}로
 * 행 잠금을 획득한 뒤 진행해 동시 요청 간 잔액 꼬임을 방지한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TokenWalletService {

    private static final int BONUS_VALIDITY_DAYS = 90;
    private static final int SIGNUP_BONUS_AMOUNT = 300;

    private final TokenWalletRepository walletRepository;
    private final TokenTransactionRepository transactionRepository;

    @Transactional(readOnly = true)
    public TokenWalletResponse getWallet(UUID writerId) {
        TokenWallet wallet = walletRepository.findById(writerId)
                .orElseGet(() -> walletRepository.save(TokenWallet.createEmpty(writerId)));
        return TokenWalletResponse.from(wallet);
    }

    // ─────────────── 충전 ───────────────

    /** 종량제 결제 성공 시 충전. */
    @Transactional
    public void chargePurchase(UUID writerId, int amount, String reason, UUID referenceId) {
        TokenWallet wallet = lockOrCreate(writerId);
        wallet.chargePurchase(amount);
        recordTx(writerId, TokenBucket.PURCHASE, amount,
                TokenTransactionType.CHARGE, reason, referenceId);
        log.info("[CHARGE_SUCCESS] writerId={} amount={} bucket=PURCHASE balanceAfter={} reason={} referenceId={}",
                writerId, amount, wallet.totalBalance(LocalDateTime.now(ZoneOffset.UTC)), reason, referenceId);
    }

    /**
     * 프로 구독 월 갱신 충전 — subscription 버킷 덮어쓰기.
     * 이전 잔여분이 있으면 EXPIRE 원장에 먼저 기록한 뒤 새 금액을 충전한다.
     */
    @Transactional
    public void chargeSubscription(UUID writerId, int amount, String reason, UUID referenceId) {
        TokenWallet wallet = lockOrCreate(writerId);
        int expired = wallet.overwriteSubscription(amount);
        if (expired > 0) {
            recordTx(writerId, TokenBucket.SUBSCRIPTION, -expired,
                    TokenTransactionType.EXPIRE,
                    "SUBSCRIPTION_ROLLOVER_EXPIRE", referenceId);
            log.info("[TOKEN_EXPIRE] writerId={} amount={} type=SUBSCRIPTION_ROLLOVER referenceId={}",
                    writerId, expired, referenceId);
        }
        recordTx(writerId, TokenBucket.SUBSCRIPTION, amount,
                TokenTransactionType.SUBSCRIPTION, reason, referenceId);
        log.info("[CHARGE_SUCCESS] writerId={} amount={} bucket=SUBSCRIPTION balanceAfter={} reason={} referenceId={}",
                writerId, amount, wallet.totalBalance(LocalDateTime.now(ZoneOffset.UTC)), reason, referenceId);
    }

    /** 신규 가입 시 보너스 300 크레딧 지급 (90일 만료). */
    @Transactional
    public void grantSignupBonus(UUID writerId) {
        TokenWallet wallet = lockOrCreate(writerId);
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        LocalDateTime expiresAt = now.plusDays(BONUS_VALIDITY_DAYS);
        wallet.grantBonus(SIGNUP_BONUS_AMOUNT, expiresAt);
        recordTx(writerId, TokenBucket.BONUS, SIGNUP_BONUS_AMOUNT,
                TokenTransactionType.BONUS_GRANT, "SIGNUP_BONUS", null);
        log.info("[CHARGE_SUCCESS] writerId={} amount={} bucket=BONUS balanceAfter={} reason=SIGNUP_BONUS expiresAt={}",
                writerId, SIGNUP_BONUS_AMOUNT, wallet.totalBalance(now), expiresAt);
    }

    // ─────────────── 차감 ───────────────

    /**
     * AI 기능 사용 차감. 구독 → 보너스 → 종량제 순으로 소진.
     * 잔액 부족 시 {@link com.storyzip.common.exception.PaymentException} 발생.
     */
    @Transactional
    public void use(UUID writerId, int amount, String reason, UUID referenceId) {
        TokenWallet wallet = lockOrCreate(writerId);
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        TokenWallet.DeductResult result = wallet.deductForUsage(amount, now);

        if (result.fromSubscription() > 0) {
            recordTx(writerId, TokenBucket.SUBSCRIPTION, -result.fromSubscription(),
                    TokenTransactionType.USAGE, reason, referenceId);
        }
        if (result.fromBonus() > 0) {
            recordTx(writerId, TokenBucket.BONUS, -result.fromBonus(),
                    TokenTransactionType.USAGE, reason, referenceId);
        }
        if (result.fromPurchase() > 0) {
            recordTx(writerId, TokenBucket.PURCHASE, -result.fromPurchase(),
                    TokenTransactionType.USAGE, reason, referenceId);
        }
        log.info("[TOKEN_USAGE] writerId={} amount={} fromSubscription={} fromBonus={} fromPurchase={} balanceAfter={} reason={} referenceId={}",
                writerId, amount, result.fromSubscription(), result.fromBonus(), result.fromPurchase(),
                wallet.totalBalance(now), reason, referenceId);
    }

    /**
     * 환불로 인한 회수 — 종량제 버킷에서만 차감.
     * 이미 사용한 유저도 환불 가능해야 하므로 잔액 부족 시 에러 없이 가진 만큼만 차감.
     */
    @Transactional
    public void deductForRefund(UUID writerId, int amount, String reason, UUID referenceId) {
        TokenWallet wallet = lockOrCreate(writerId);
        int actual = wallet.deductForRefund(amount);
        if (actual > 0) {
            recordTx(writerId, TokenBucket.PURCHASE, -actual,
                    TokenTransactionType.REFUND, reason, referenceId);
        }
        log.info("[REFUND_DEDUCT] writerId={} requested={} actual={} balanceAfter={} reason={} referenceId={}",
                writerId, amount, actual, wallet.totalBalance(LocalDateTime.now(ZoneOffset.UTC)), reason, referenceId);
    }

    // ─────────────── 만료 ───────────────

    /** 구독 해지 예약 주기 만료 시 호출 — 구독 잔여분 전부 소멸. */
    @Transactional
    public void expireSubscription(UUID writerId, UUID subscriptionId) {
        TokenWallet wallet = lockOrCreate(writerId);
        int expired = wallet.expireSubscription();
        if (expired > 0) {
            recordTx(writerId, TokenBucket.SUBSCRIPTION, -expired,
                    TokenTransactionType.EXPIRE,
                    "SUBSCRIPTION_CANCEL_EXPIRE", subscriptionId);
            log.info("[TOKEN_EXPIRE] writerId={} amount={} type=SUBSCRIPTION_CANCEL balanceAfter={} subscriptionId={}",
                    writerId, expired, wallet.totalBalance(LocalDateTime.now(ZoneOffset.UTC)), subscriptionId);
        }
    }

    /** 보너스 90일 만료 시 호출 — 보너스 잔여분 전부 소멸. */
    @Transactional
    public void expireBonus(UUID writerId) {
        TokenWallet wallet = lockOrCreate(writerId);
        int expired = wallet.expireBonus();
        if (expired > 0) {
            recordTx(writerId, TokenBucket.BONUS, -expired,
                    TokenTransactionType.EXPIRE, "BONUS_TTL_EXPIRE", null);
            log.info("[TOKEN_EXPIRE] writerId={} amount={} type=BONUS_TTL balanceAfter={}",
                    writerId, expired, wallet.totalBalance(LocalDateTime.now(ZoneOffset.UTC)));
        }
    }

    // ─────────────── 내부 ───────────────

    private TokenWallet lockOrCreate(UUID writerId) {
        return walletRepository.findWithLockByWriterId(writerId)
                .orElseGet(() -> walletRepository.save(TokenWallet.createEmpty(writerId)));
    }

    private void recordTx(UUID writerId, TokenBucket bucket, int amount,
                          TokenTransactionType type, String reason, UUID referenceId) {
        transactionRepository.save(TokenTransaction.builder()
                .writerId(writerId)
                .bucket(bucket)
                .amount(amount)
                .type(type)
                .reason(reason)
                .referenceId(referenceId)
                .build());
    }
}
