package com.storyzip.payment.scheduler;

import com.storyzip.payment.domain.Subscription;
import com.storyzip.payment.repository.SubscriptionRepository;
import com.storyzip.payment.service.SubscriptionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

/**
 * 정기결제 배치.
 *
 * <p>매일 새벽 4시(KST) {@code nextBillingAt <= now}인 ACTIVE 구독을 집어
 * 건별로 {@link SubscriptionService#processBilling(java.util.UUID)}에 위임한다.
 * 각 호출은 독립 트랜잭션이라 한 건 실패가 배치 전체를 망치지 않는다.
 *
 * <p>해지 예약 상태({@code cancelledAt != null})인 구독도 함께 집힌다 — 서비스 쪽에서
 * 결제를 건너뛰고 {@code expire()}로 종료 처리한다.
 *
 * <p>재시도/종료 규칙은 {@link com.storyzip.payment.domain.Subscription}이 관리:
 * 실패 시 3일 뒤 재시도, 3회 실패 시 {@code PAYMENT_FAILED} 전환.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BillingScheduler {

    private final SubscriptionRepository subscriptionRepository;
    private final SubscriptionService subscriptionService;

    @Scheduled(cron = "0 0 19 * * *", zone = "UTC")
    public void runDailyBilling() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        List<Subscription> due = findDue(now);
        log.info("Billing scheduler started at {}: {} subscriptions due", now, due.size());

        int success = 0, failure = 0;
        for (Subscription s : due) {
            try {
                subscriptionService.processBilling(s.getId());
                success++;
            } catch (Exception e) {
                failure++;
                log.error("Billing failed for subscription {}: {}", s.getId(), e.getMessage(), e);
            }
        }
        log.info("Billing scheduler finished: success={}, failure={}", success, failure);
    }

    @Transactional(readOnly = true)
    protected List<Subscription> findDue(LocalDateTime now) {
        return subscriptionRepository.findDueForBilling(now);
    }
}
