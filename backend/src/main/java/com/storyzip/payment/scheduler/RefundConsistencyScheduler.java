package com.storyzip.payment.scheduler;

import com.storyzip.common.notification.EmailNotifier;
import com.storyzip.payment.client.PortOneClient;
import com.storyzip.payment.client.PortOnePaymentResponse;
import com.storyzip.payment.domain.Refund;
import com.storyzip.payment.repository.RefundRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;

/**
 * 환불 DB ↔ PortOne 불일치 감지 스케줄러.
 *
 * <p>5분 주기로 최근 24시간 내 {@link com.storyzip.payment.domain.RefundStatus#APPROVED} 처리된
 * 현금 환불을 PortOne 결제 단건조회와 비교한다. PortOne 측이 {@code CANCELLED} 또는
 * {@code PARTIAL_CANCELLED} 가 아니면 불일치로 판단해 운영자에게 이메일 통보.
 *
 * <p>발생 가능한 시나리오:
 * <ul>
 *   <li>{@code RefundService.approveRefund} 트랜잭션 commit 직전 사고 → DB는 APPROVED, PortOne 미취소</li>
 *   <li>PortOne 측 일시 장애로 cancel 호출은 성공했지만 실제 처리 미반영</li>
 *   <li>운영자가 DB 직접 수정으로 status 만 바꾼 경우</li>
 * </ul>
 *
 * <p>Phase B: outbox 패턴 + 자동 재시도로 완전 일관성 확보 예정. 현재는 사후 감지만.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RefundConsistencyScheduler {

    private static final Duration WINDOW = Duration.ofHours(24);
    private static final Set<String> CANCELLED_STATUSES = Set.of("CANCELLED", "PARTIAL_CANCELLED");

    private final RefundRepository refundRepository;
    private final PortOneClient portOneClient;
    private final EmailNotifier emailNotifier;

    /** 5분 주기. cron 대신 fixedDelay 사용 — 실행 종료 후 5분 뒤 재시작. */
    @Scheduled(fixedDelayString = "PT5M", initialDelayString = "PT2M")
    public void detectInconsistency() {
        LocalDateTime since = LocalDateTime.now(ZoneOffset.UTC).minus(WINDOW);
        List<Refund> recent = findRecent(since);
        if (recent.isEmpty()) return;

        int checked = 0, mismatched = 0;
        for (Refund refund : recent) {
            try {
                String orderId = refund.getPayment().getOrderId();
                PortOnePaymentResponse resp = portOneClient.getPayment(orderId);
                checked++;
                if (resp == null || resp.status() == null || !CANCELLED_STATUSES.contains(resp.status())) {
                    mismatched++;
                    handleMismatch(refund, resp);
                }
            } catch (Exception e) {
                // PortOne 호출 자체 실패는 다음 라운드에서 재검증되므로 swallow.
                log.warn("[REFUND_CONSISTENCY_PROBE_FAILED] refundId={} reason={}",
                        refund.getId(), e.getMessage());
            }
        }
        if (checked > 0) {
            log.info("[REFUND_CONSISTENCY_CHECKED] window=24h checked={} mismatched={}",
                    checked, mismatched);
        }
    }

    @Transactional(readOnly = true)
    protected List<Refund> findRecent(LocalDateTime since) {
        return refundRepository.findRecentApprovedCashRefunds(since);
    }

    private void handleMismatch(Refund refund, PortOnePaymentResponse resp) {
        String orderId = refund.getPayment().getOrderId();
        String portOneStatus = resp == null ? "(null)" : (resp.status() == null ? "(null status)" : resp.status());
        log.error("[REFUND_INCONSISTENCY] refundId={} paymentId={} dbStatus=APPROVED portOneStatus={} processedAt={}",
                refund.getId(), orderId, portOneStatus, refund.getProcessedAt());

        emailNotifier.notifyOperator(
                "[Folio 환불 불일치] " + orderId,
                """
                DB 와 PortOne 결제 상태가 일치하지 않습니다. 수동 확인이 필요합니다.

                환불 ID:        %s
                결제 ID:        %s
                DB 상태:        APPROVED (%s 처리)
                PortOne 상태:   %s
                환불 분류:      %s
                예상 환불액:    %,d원
                관리자 메모:    %s

                조치:
                1. PortOne 콘솔(https://admin.portone.io)에서 결제 상태 직접 확인.
                2. PortOne 미취소면 운영자 콘솔에서 수동 취소 + 사유 기록.
                3. PortOne 은 취소됐는데 응답이 늦은 거면 다음 5분 라운드에서 자동 해소.
                """.formatted(
                        refund.getId(),
                        orderId,
                        refund.getProcessedAt(),
                        portOneStatus,
                        refund.getRefundType(),
                        refund.getRefundAmount(),
                        refund.getAdminNote() == null ? "(없음)" : refund.getAdminNote()
                ));
    }
}
