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
     *
     * <p>요금제는 활성 구독이 있으면 PRO, 없으면 Role 기반으로 결정한다.
     * Role을 결제 시점에 PREMIUM으로 동기화하지 않아도 되어 유지보수 비용이 낮고,
     * 구독 해지/만료 시 자동으로 STARTER로 복귀한다.
     */
    @Transactional(readOnly = true)
    public AccountInfoResponse getAccountInfo(UUID writerId) {
        Writer writer = writerRepository.findById(writerId)
                .orElseThrow(() -> new AuthException(ErrorCode.WRITER_NOT_FOUND));

        // 구독 정보 (ACTIVE만)
        SubscriptionInfo subscriptionInfo = subscriptionRepository
                .findByWriter_IdAndStatus(writerId, SubscriptionStatus.ACTIVE)
                .map(SubscriptionInfo::from)
                .orElse(null);

        // 활성 구독이 있으면 PRO로 승격 (Role과 무관). 없으면 Role 기반.
        PlanTier tier = subscriptionInfo != null
                ? PlanTier.PRO
                : PlanTier.fromRole(writer.getRole());

        // 사용량 집계
        long storageUsedBytes = storageUsageRepository.getStorageUsedBytes(writerId);

        double storagePercent = tier.getStorageLimitBytes() > 0
                ? (double) storageUsedBytes / tier.getStorageLimitBytes() * 100
                : 0.0;

        boolean quotaExceeded = tier.getStorageLimitBytes() > 0
                && storageUsedBytes >= tier.getStorageLimitBytes();

        return new AccountInfoResponse(
                WriterInfo.from(writer),
                PlanInfo.from(tier),
                new UsageInfo(storageUsedBytes, storagePercent, quotaExceeded),
                subscriptionInfo
        );
    }
}
