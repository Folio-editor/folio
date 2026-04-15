package com.storyzip.payment.repository;

import com.storyzip.payment.domain.Subscription;
import com.storyzip.payment.domain.SubscriptionStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SubscriptionRepository extends JpaRepository<Subscription, UUID> {

    Optional<Subscription> findByWriter_IdAndStatus(UUID writerId, SubscriptionStatus status);

    Optional<Subscription> findByCustomerKey(String customerKey);
}
