package com.storyzip.payment.scheduler;

import com.storyzip.payment.domain.TokenWallet;
import com.storyzip.payment.repository.TokenWalletRepository;
import com.storyzip.payment.service.TokenWalletService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

/**
 * 가입 보너스 만료 배치.
 *
 * <p>매일 새벽 3시(UTC) {@code bonus_expires_at <= now}이고 {@code bonus_balance > 0}인
 * 지갑을 찾아 보너스를 0으로 초기화한다. 건별로 독립 트랜잭션을 사용해 한 건 실패가
 * 배치 전체를 망치지 않도록 한다.
 *
 * <p>실제 만료 로직은 {@link TokenWalletService#expireBonus(java.util.UUID)}가
 * 행 잠금을 잡은 뒤 수행 — 레이스 컨디션 방지.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BonusExpireScheduler {

    private final TokenWalletRepository walletRepository;
    private final TokenWalletService tokenWalletService;

    @Scheduled(cron = "0 0 3 * * *", zone = "UTC")
    public void runDailyBonusExpire() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        List<TokenWallet> expired = findExpired(now);
        log.info("Bonus expire scheduler started at {}: {} wallets candidate", now, expired.size());

        int success = 0, failure = 0;
        for (TokenWallet wallet : expired) {
            try {
                tokenWalletService.expireBonus(wallet.getWriterId());
                success++;
            } catch (Exception e) {
                failure++;
                log.error("Bonus expire failed for writer {}: {}", wallet.getWriterId(), e.getMessage(), e);
            }
        }
        log.info("Bonus expire scheduler finished: success={}, failure={}", success, failure);
    }

    @Transactional(readOnly = true)
    protected List<TokenWallet> findExpired(LocalDateTime now) {
        return walletRepository.findExpiredBonusWallets(now);
    }
}
