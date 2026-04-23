package com.storyzip.account.dto;

import com.storyzip.account.domain.PlanTier;
import com.storyzip.auth.domain.Writer;
import com.storyzip.payment.domain.Subscription;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * GET /api/v1/account/me 응답.
 */
public record AccountInfoResponse(
        WriterInfo writer,
        PlanInfo plan,
        UsageInfo usage,
        SubscriptionInfo subscription
) {

    public record WriterInfo(
            UUID id,
            String email,
            String nickname,
            String profileImageUrl,
            String role,
            String oauthProvider,
            LocalDateTime createdAt
    ) {
        public static WriterInfo from(Writer w) {
            return new WriterInfo(
                    w.getId(),
                    w.getEmail(),
                    w.getNickname(),
                    w.getProfileImageUrl(),
                    w.getRole().name(),
                    w.getOauthProvider(),
                    w.getCreatedAt()
            );
        }
    }

    public record PlanInfo(
            String tier,
            String displayName,
            long storageLimitBytes
    ) {
        public static PlanInfo from(PlanTier tier) {
            return new PlanInfo(
                    tier.getCode(),
                    tier.getDisplayName(),
                    tier.getStorageLimitBytes()
            );
        }
    }

    public record UsageInfo(
            long storageUsedBytes,
            double storagePercent,
            boolean quotaExceeded
    ) {}

    public record SubscriptionInfo(
            String plan,
            String status,
            int monthlyAmount,
            LocalDateTime nextBillingAt,
            LocalDateTime cancelledAt
    ) {
        public static SubscriptionInfo from(Subscription s) {
            return new SubscriptionInfo(
                    s.getPlan(),
                    s.getStatus().name(),
                    s.getMonthlyAmount(),
                    s.getNextBillingAt(),
                    s.getCancelledAt()
            );
        }
    }
}
