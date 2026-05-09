package com.storyzip.payment.repository;

import com.storyzip.payment.domain.Payment;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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
     * 결제 이력 페이지 조회 — 최근 결제부터. 정렬은 호출자가 {@link Pageable} 로 지정.
     *
     * <p>환불 정보는 별도 쿼리({@link RefundRepository#findAllByPayment_IdIn}) 로 batch 조회 후
     * 서비스에서 결합. fetch join 으로 묶을 수도 있으나 환불이 0~N 인 1:N 이라 페이지 row 가
     * 중복돼 카운트가 어긋나는 문제가 있어 분리.
     */
    Page<Payment> findAllByWriter_Id(UUID writerId, Pageable pageable);

    /**
     * 환불 처리 등 결제 상태 변경 시 동시 진입을 막기 위한 행 잠금 조회.
     * 동일 orderId로 환불이 중복 호출되어도 두 번째 트랜잭션은 첫 번째 완료를 기다린 뒤
     * status=CANCELED를 보고 즉시 거절된다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Payment p WHERE p.orderId = :orderId")
    Optional<Payment> findWithLockByOrderId(@Param("orderId") String orderId);
}
