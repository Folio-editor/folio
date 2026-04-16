package com.storyzip.payment.controller;

import com.storyzip.common.exception.AuthException;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.payment.domain.Subscription;
import com.storyzip.payment.domain.SubscriptionStatus;
import com.storyzip.payment.dto.SubscriptionResponse;
import com.storyzip.payment.repository.SubscriptionRepository;
import com.storyzip.payment.service.SubscriptionService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 개발용 구독 트리거 API. 새벽 스케줄러를 기다리지 않고 정기결제를 즉시 실행한다.
 *
 * <p>{@code dev} 프로필에서만 활성화. 운영 빌드엔 노출되지 않는다.
 */
@Profile("dev")
@RestController
@RequestMapping("/api/v1/subscriptions/dev")
@RequiredArgsConstructor
public class DevSubscriptionController {

    private final SubscriptionRepository subscriptionRepository;
    private final SubscriptionService subscriptionService;

    @PersistenceContext
    private EntityManager entityManager;

    /**
     * 현재 로그인한 작가의 ACTIVE 구독을 {@code nextBillingAt = now}로 당기고
     * {@link SubscriptionService#processBilling} 를 호출해 정기결제 1회를 즉시 실행한다.
     */
    @PostMapping("/bill-now")
    @Transactional
    public ResponseEntity<SubscriptionResponse> billNow(Authentication authentication) {
        UUID writerId = requireWriterId(authentication);
        Subscription subscription = subscriptionRepository
                .findByWriter_IdAndStatus(writerId, SubscriptionStatus.ACTIVE)
                .orElseThrow(() -> new PaymentException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        subscriptionRepository.updateNextBillingAt(subscription.getId(), LocalDateTime.now().minusMinutes(1));
        entityManager.flush();
        entityManager.clear();

        subscriptionService.processBilling(subscription.getId());

        Subscription refreshed = subscriptionRepository.findById(subscription.getId())
                .orElseThrow(() -> new PaymentException(ErrorCode.SUBSCRIPTION_NOT_FOUND));
        return ResponseEntity.ok(SubscriptionResponse.from(refreshed));
    }

    private UUID requireWriterId(Authentication authentication) {
        if (authentication == null || authentication.getPrincipal() == null) {
            throw new AuthException(ErrorCode.UNAUTHORIZED);
        }
        return UUID.fromString(authentication.getName());
    }
}
