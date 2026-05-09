package com.storyzip.admin;

import com.storyzip.admin.dto.AdminRefundDecisionRequest;
import com.storyzip.payment.domain.RefundStatus;
import com.storyzip.payment.dto.RefundResponse;
import com.storyzip.payment.service.RefundService;
import jakarta.servlet.http.HttpServletRequest;
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
 * <p>모든 호출은 {@link AdminAuditService} 로 별도 트랜잭션에 감사 로그 기록.
 *
 * <p>Phase B 미완: Writer.role 기반 인증으로 강화 + AOP 자동 audit 기록.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/admin/refunds")
@RequiredArgsConstructor
public class AdminRefundController {

    private static final String RESOURCE_TYPE = "refund";

    private final RefundService refundService;
    private final AdminAuditService auditService;

    /** 검토 대기 환불 목록 — status 미지정 시 REQUESTED 기본. */
    @GetMapping
    public ResponseEntity<List<RefundResponse>> list(
            HttpServletRequest request,
            @RequestParam(name = "status", defaultValue = "REQUESTED") RefundStatus status) {
        try {
            List<RefundResponse> results = refundService.listByStatus(status);
            auditService.recordSuccess(request, "REFUND_LIST_" + status, RESOURCE_TYPE, null,
                    "count=" + results.size());
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            auditService.recordError(request, "REFUND_LIST_" + status, RESOURCE_TYPE, null, e.getMessage());
            throw e;
        }
    }

    /** 환불 승인 — PortOne 취소 + 토큰 회수/보상 + Payment 상태 변경. */
    @PostMapping("/{refundId}/approve")
    public ResponseEntity<RefundResponse> approve(
            HttpServletRequest request,
            @PathVariable UUID refundId,
            @Valid @RequestBody(required = false) AdminRefundDecisionRequest body) {
        String note = body == null ? null : body.adminNote();
        log.info("[ADMIN_REFUND_APPROVE] refundId={} note={}", refundId, note);
        try {
            RefundResponse result = refundService.approveRefund(refundId, note);
            auditService.recordSuccess(request, "REFUND_APPROVE", RESOURCE_TYPE, refundId, note);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            auditService.recordError(request, "REFUND_APPROVE", RESOURCE_TYPE, refundId, e.getMessage());
            throw e;
        }
    }

    /** 환불 거절 — 사유 기록만, 결제 상태는 그대로. */
    @PostMapping("/{refundId}/reject")
    public ResponseEntity<RefundResponse> reject(
            HttpServletRequest request,
            @PathVariable UUID refundId,
            @Valid @RequestBody(required = false) AdminRefundDecisionRequest body) {
        String note = body == null ? null : body.adminNote();
        log.info("[ADMIN_REFUND_REJECT] refundId={} note={}", refundId, note);
        try {
            RefundResponse result = refundService.rejectRefund(refundId, note);
            auditService.recordSuccess(request, "REFUND_REJECT", RESOURCE_TYPE, refundId, note);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            auditService.recordError(request, "REFUND_REJECT", RESOURCE_TYPE, refundId, e.getMessage());
            throw e;
        }
    }
}
