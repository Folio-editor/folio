package com.storyzip.payment.repository;

import com.storyzip.payment.domain.Refund;
import com.storyzip.payment.domain.RefundStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RefundRepository extends JpaRepository<Refund, UUID> {

    /**
     * 결제별 active 환불 신청이 있는지. (REQUESTED/APPROVED는 active.)
     * 거절(REJECTED) 후 재신청 가능하므로 status로 필터링.
     */
    @Query("""
           select r from Refund r
            where r.payment.id = :paymentId
              and r.status in (com.storyzip.payment.domain.RefundStatus.REQUESTED,
                               com.storyzip.payment.domain.RefundStatus.APPROVED)
           """)
    Optional<Refund> findActiveByPaymentId(@Param("paymentId") UUID paymentId);

    /** 결제 1건의 모든 환불 이력 (재신청 포함, 시간순). */
    List<Refund> findAllByPayment_IdOrderByCreatedAtAsc(UUID paymentId);

    /** 작가 환불 이력 — 결제 이력 화면에서 함께 표시. */
    @Query("""
           select r from Refund r
            join r.payment p
            where p.writer.id = :writerId
            order by r.createdAt desc
           """)
    List<Refund> findAllByWriterIdOrderByCreatedAtDesc(@Param("writerId") UUID writerId);

    /** 거절 후 재신청 횟수 — 1회 제한 강제용. */
    long countByPayment_IdAndStatus(UUID paymentId, RefundStatus status);

    /** 운영자 화면용 — REQUESTED 신청 목록. */
    List<Refund> findAllByStatusOrderByRequestedAtAsc(RefundStatus status);
}
