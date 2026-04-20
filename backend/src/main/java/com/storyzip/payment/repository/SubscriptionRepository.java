package com.storyzip.payment.repository;

import com.storyzip.payment.domain.Subscription;
import com.storyzip.payment.domain.SubscriptionStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SubscriptionRepository extends JpaRepository<Subscription, UUID> {

    Optional<Subscription> findByWriter_IdAndStatus(UUID writerId, SubscriptionStatus status);

    Optional<Subscription> findByCustomerKey(String customerKey);

    /**
     * 정기 결제 배치가 집어올 구독 — ACTIVE 상태이면서 청구 예정일이 기준 시각 이전인 것.
     * 해지 예약({@code cancelledAt != null})인 구독도 포함한다(스케줄러가 만료 처리).
     */
    @Query("select s from Subscription s " +
            "where s.status = com.storyzip.payment.domain.SubscriptionStatus.ACTIVE " +
            "and s.nextBillingAt <= :now")
    List<Subscription> findDueForBilling(@Param("now") LocalDateTime now);

    /** dev 트리거 전용 — 정기결제를 즉시 실행하도록 {@code nextBillingAt}을 과거로 당긴다. */
    @Modifying
    @Query("update Subscription s set s.nextBillingAt = :nextBillingAt where s.id = :id")
    void updateNextBillingAt(@Param("id") UUID id, @Param("nextBillingAt") LocalDateTime nextBillingAt);
}
