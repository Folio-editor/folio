package com.storyzip.account.service;

import com.storyzip.account.domain.PlanTier;
import com.storyzip.account.dto.AccountInfoResponse;
import com.storyzip.account.dto.AccountInfoResponse.*;
import com.storyzip.account.repository.StorageUsageRepository;
import com.storyzip.auth.domain.Writer;
import com.storyzip.auth.repository.WriterRepository;
import com.storyzip.common.exception.AuthException;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.payment.domain.SubscriptionStatus;
import com.storyzip.payment.repository.SubscriptionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AccountService {

    private final WriterRepository writerRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final StorageUsageRepository storageUsageRepository;

    /**
     * 계정 정보 + 사용량 + 구독 정보 조회.
     */
    @Transactional(readOnly = true)
    public AccountInfoResponse getAccountInfo(UUID writerId) {
        Writer writer = writerRepository.findById(writerId)
                .orElseThrow(() -> new AuthException(ErrorCode.WRITER_NOT_FOUND));

        PlanTier tier = PlanTier.fromRole(writer.getRole());

        // 사용량 집계
        long storageUsedBytes = storageUsageRepository.getStorageUsedBytes(writerId);

        double storagePercent = tier.getStorageLimitBytes() > 0
                ? (double) storageUsedBytes / tier.getStorageLimitBytes() * 100
                : 0.0;

        boolean quotaExceeded = tier.getStorageLimitBytes() > 0
                && storageUsedBytes >= tier.getStorageLimitBytes();

        // 구독 정보 (ACTIVE만)
        SubscriptionInfo subscriptionInfo = subscriptionRepository
                .findByWriter_IdAndStatus(writerId, SubscriptionStatus.ACTIVE)
                .map(SubscriptionInfo::from)
                .orElse(null);

        return new AccountInfoResponse(
                WriterInfo.from(writer),
                PlanInfo.from(tier),
                new UsageInfo(storageUsedBytes, storagePercent, quotaExceeded),
                subscriptionInfo
        );
    }
}
