package com.storyzip.payment.repository;

import com.storyzip.payment.domain.TokenWallet;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TokenWalletRepository extends JpaRepository<TokenWallet, UUID> {

    /** 동시 차감·충전 경합을 막기 위한 행 단위 잠금 조회. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<TokenWallet> findWithLockByWriterId(UUID writerId);

    /**
     * 만료된 보너스가 남아 있는 지갑 목록.
     * {@code BonusExpireScheduler}가 일 1회 호출.
     */
    @Query("""
           select w from TokenWallet w
            where w.bonusBalance > 0
              and w.bonusExpiresAt is not null
              and w.bonusExpiresAt <= :now
           """)
    List<TokenWallet> findExpiredBonusWallets(LocalDateTime now);
}
