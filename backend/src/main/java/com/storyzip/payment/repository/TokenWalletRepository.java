package com.storyzip.payment.repository;

import com.storyzip.payment.domain.TokenWallet;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.util.Optional;
import java.util.UUID;

public interface TokenWalletRepository extends JpaRepository<TokenWallet, UUID> {

    /** 동시 차감·충전 경합을 막기 위한 행 단위 잠금 조회. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<TokenWallet> findWithLockByWriterId(UUID writerId);
}
