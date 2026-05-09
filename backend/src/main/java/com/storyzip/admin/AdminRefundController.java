package com.storyzip.admin;

import com.storyzip.admin.dto.AdminRefundDecisionRequest;
import com.storyzip.payment.domain.RefundStatus;
import com.storyzip.payment.dto.RefundResponse;
import com.storyzip.payment.service.RefundService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * 관리자 환불 처리 API — 약관 5조 운영자 검토 흐름.
 *
 * <p>인증: {@code X-Admin-Token} 헤더 (값은 Doppler {@code ADMIN_API_TOKEN}).
 * {@link AdminAuthInterceptor} 가 모든 요청 전에 검증.
 *
 * <p>Phase B 미완: Writer.role 기반 인증으로 강화 예정. 현재는 단일 토큰.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/admin/refunds")
@RequiredArgsConstructor
public class AdminRefundController {

    private final RefundService refundService;

    /** 검토 대기 환불 목록 — status 미지정 시 REQUESTED 기본. */
    @GetMapping
    public ResponseEntity<List<RefundResponse>> list(
            @RequestParam(name = "status", defaultValue = "REQUESTED") RefundStatus status) {
        return ResponseEntity.ok(refundService.listByStatus(status));
    }

    /** 환불 승인 — PortOne 취소 + 토큰 회수/보상 + Payment 상태 변경. */
    @PostMapping("/{refundId}/approve")
    public ResponseEntity<RefundResponse> approve(
            @PathVariable UUID refundId,
            @Valid @RequestBody(required = false) AdminRefundDecisionRequest request) {
        String note = request == null ? null : request.adminNote();
        log.info("[ADMIN_REFUND_APPROVE] refundId={} note={}", refundId, note);
        return ResponseEntity.ok(refundService.approveRefund(refundId, note));
    }

    /** 환불 거절 — 사유 기록만, 결제 상태는 그대로. */
    @PostMapping("/{refundId}/reject")
    public ResponseEntity<RefundResponse> reject(
            @PathVariable UUID refundId,
            @Valid @RequestBody(required = false) AdminRefundDecisionRequest request) {
        String note = request == null ? null : request.adminNote();
        log.info("[ADMIN_REFUND_REJECT] refundId={} note={}", refundId, note);
        return ResponseEntity.ok(refundService.rejectRefund(refundId, note));
    }
}
