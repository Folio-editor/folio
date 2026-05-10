package com.storyzip.admin;

import com.storyzip.admin.dto.AdminRefundDecisionRequest;
import com.storyzip.admin.dto.AdminRefundDetail;
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
 * <p>모든 호출은 {@link AdminAudited} 어노테이션 + {@link AdminAuditAspect} 로 자동 감사 로그 기록.
 *
 * <p>Phase B 미완: Writer.role 기반 인증으로 강화.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/admin/refunds")
@RequiredArgsConstructor
public class AdminRefundController {

    private final RefundService refundService;

    /** 검토 대기 환불 목록 — status 미지정 시 REQUESTED 기본. (간략 응답, 호환용) */
    @AdminAudited(action = "REFUND_LIST", resourceType = "refund")
    @GetMapping
    public ResponseEntity<List<RefundResponse>> list(
            @RequestParam(name = "status", defaultValue = "REQUESTED") RefundStatus status) {
        return ResponseEntity.ok(refundService.listByStatus(status));
    }

    /**
     * 운영자 검토용 상세 목록 — Refund + Payment + Writer 조인 + 경과 일수 + 이전 거절 횟수.
     * 운영자 페이지가 합리적 결정을 내릴 수 있도록 모든 컨텍스트를 한 번에 반환.
     */
    @AdminAudited(action = "REFUND_LIST_DETAIL", resourceType = "refund")
    @GetMapping("/detail")
    public ResponseEntity<List<AdminRefundDetail>> listDetail(
            @RequestParam(name = "status", defaultValue = "REQUESTED") RefundStatus status) {
        return ResponseEntity.ok(refundService.listDetailByStatus(status));
    }

    /** 환불 승인 — PortOne 취소 + 토큰 회수/보상 + Payment 상태 변경. */
    @AdminAudited(action = "REFUND_APPROVE", resourceType = "refund", resourceIdParam = "refundId")
    @PostMapping("/{refundId}/approve")
    public ResponseEntity<RefundResponse> approve(
            @PathVariable UUID refundId,
            @Valid @RequestBody(required = false) AdminRefundDecisionRequest body) {
        String note = body == null ? null : body.adminNote();
        log.info("[ADMIN_REFUND_APPROVE] refundId={} note={}", refundId, note);
        return ResponseEntity.ok(refundService.approveRefund(refundId, note));
    }

    /** 환불 거절 — 사유 기록만, 결제 상태는 그대로. */
    @AdminAudited(action = "REFUND_REJECT", resourceType = "refund", resourceIdParam = "refundId")
    @PostMapping("/{refundId}/reject")
    public ResponseEntity<RefundResponse> reject(
            @PathVariable UUID refundId,
            @Valid @RequestBody(required = false) AdminRefundDecisionRequest body) {
        String note = body == null ? null : body.adminNote();
        log.info("[ADMIN_REFUND_REJECT] refundId={} note={}", refundId, note);
        return ResponseEntity.ok(refundService.rejectRefund(refundId, note));
    }
}
