package com.storyzip.payment.dto;

import com.storyzip.payment.domain.Subscription;
import com.storyzip.payment.domain.SubscriptionStatus;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 구독 조회 응답. 빌링키/커스터머키는 민감값이라 노출하지 않는다.
 */
public record SubscriptionResponse(
        UUID id,
        String plan,
        Integer monthlyTokens,
        Integer monthlyAmount,
        SubscriptionStatus status,
        LocalDateTime nextBillingAt,
        LocalDateTime lastPaymentAt,
        LocalDateTime cancelledAt,
        boolean cancelReserved,
        LocalDateTime createdAt
) {
    public static SubscriptionResponse from(Subscription s) {
        return new SubscriptionResponse(
                s.getId(),
                s.getPlan(),
                s.getMonthlyTokens(),
                s.getMonthlyAmount(),
                s.getStatus(),
                s.getNextBillingAt(),
                s.getLastPaymentAt(),
                s.getCancelledAt(),
                s.isCancelReserved(),
                s.getCreatedAt()
        );
    }
}
