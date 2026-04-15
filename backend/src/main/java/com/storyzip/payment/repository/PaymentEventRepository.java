package com.storyzip.payment.repository;

import com.storyzip.payment.domain.PaymentEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface PaymentEventRepository extends JpaRepository<PaymentEvent, UUID> {

    boolean existsByEventId(String eventId);
}
