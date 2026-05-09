package com.storyzip.payment.repository;

import com.storyzip.payment.domain.Refund;
import com.storyzip.payment.domain.RefundStatus;
import jakarta.persistence.Tuple;
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

    /**
     * 운영자 검토 화면용 — Refund + Payment + Writer 를 fetch join 으로 한 쿼리에 가져오고,
     * 같은 payment 의 REJECTED 환불 횟수를 서브쿼리로 함께 반환.
     *
     * <p>N+1 회피: 기존엔 환불 1건 당 {@code countByPayment_IdAndStatus} 1쿼리 추가 + Writer
     * lazy fetch 잠재 N쿼리. 이 쿼리 1회로 모두 해소.
     *
     * <p>반환: {@link Tuple} 리스트 — alias 키로 안전하게 추출:
     * <ul>
     *   <li>{@code "refund"} → {@link Refund} (payment/writer fetch 됨)</li>
     *   <li>{@code "rejectedCount"} → {@link Long} previousRejectedCount</li>
     * </ul>
     * 인덱스 기반 {@code Object[]} 보다 타입 안전하고 select 절 순서 바뀌어도 영향 없음.
     */
    @Query("""
           select r as refund,
                  (select count(r2) from Refund r2
                    where r2.payment.id = r.payment.id
                      and r2.status = com.storyzip.payment.domain.RefundStatus.REJECTED) as rejectedCount
             from Refund r
             join fetch r.payment p
             join fetch p.writer w
            where r.status = :status
            order by r.requestedAt asc
           """)
    List<Tuple> findDetailByStatusWithRejectedCount(@Param("status") RefundStatus status);

    /**
     * 불일치 감지 스케줄러용 — 최근 N시간 내 APPROVED 처리된 환불 중 현금 환불 케이스만.
     * COMPANY_FAULT_CREDIT 은 PortOne 호출 안 하므로 제외.
     */
    @Query("""
           select r from Refund r
            where r.status = com.storyzip.payment.domain.RefundStatus.APPROVED
              and r.processedAt >= :since
              and r.refundType <> com.storyzip.payment.domain.RefundType.COMPANY_FAULT_CREDIT
           """)
    List<Refund> findRecentApprovedCashRefunds(@Param("since") java.time.LocalDateTime since);
}
