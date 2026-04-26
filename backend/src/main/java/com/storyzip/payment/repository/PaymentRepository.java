package com.storyzip.payment.repository;

import com.storyzip.payment.domain.Payment;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    Optional<Payment> findByOrderId(String orderId);

    Optional<Payment> findByPaymentKey(String paymentKey);

    /**
     * 환불 처리 등 결제 상태 변경 시 동시 진입을 막기 위한 행 잠금 조회.
     * 동일 orderId로 환불이 중복 호출되어도 두 번째 트랜잭션은 첫 번째 완료를 기다린 뒤
     * status=CANCELED를 보고 즉시 거절된다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Payment p WHERE p.orderId = :orderId")
    Optional<Payment> findWithLockByOrderId(@Param("orderId") String orderId);
}
