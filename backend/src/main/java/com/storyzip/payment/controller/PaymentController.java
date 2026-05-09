package com.storyzip.payment.controller;

import com.storyzip.common.dto.PageResponse;
import com.storyzip.common.exception.AuthException;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.payment.dto.ConfirmPaymentRequest;
import com.storyzip.payment.dto.CreatePaymentRequest;
import com.storyzip.payment.dto.CreatePaymentResponse;
import com.storyzip.payment.dto.PaymentResponse;
import com.storyzip.payment.dto.RefundRequest;
import com.storyzip.payment.dto.RefundResponse;
import com.storyzip.payment.dto.TokenWalletResponse;
import com.storyzip.payment.service.PaymentService;
import com.storyzip.payment.service.RefundService;
import com.storyzip.payment.service.TokenWalletService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;
    private final RefundService refundService;
    private final TokenWalletService tokenWalletService;

    /** 결제 요청 생성 — 프론트가 이 응답의 paymentId/amount로 PortOne SDK 결제창을 연다. */
    @PostMapping
    public ResponseEntity<CreatePaymentResponse> createPayment(
            Authentication authentication,
            @Valid @RequestBody CreatePaymentRequest request) {
        UUID writerId = requireWriterId(authentication);
        return ResponseEntity.ok(paymentService.createPayment(writerId, request));
    }

    /** 결제 검증 — 프론트가 PortOne SDK 결제 완료 후 paymentId로 호출. */
    @PostMapping("/confirm")
    public ResponseEntity<PaymentResponse> confirm(
            Authentication authentication,
            @Valid @RequestBody ConfirmPaymentRequest request) {
        UUID writerId = requireWriterId(authentication);
        return ResponseEntity.ok(paymentService.confirmPayment(writerId, request));
    }

    @GetMapping("/{paymentId}")
    public ResponseEntity<PaymentResponse> getByPaymentId(
            Authentication authentication,
            @PathVariable String paymentId) {
        UUID writerId = requireWriterId(authentication);
        return ResponseEntity.ok(paymentService.getByOrderId(writerId, paymentId));
    }

    /**
     * 내 결제 이력 — 최근 순 페이지네이션. 환불 UI 에서 사용.
     *
     * <p>{@code page} 0-based, {@code size} 1~50 (기본 10). size 50 초과는 50 으로 클램프.
     * 정렬은 {@code createdAt} 내림차순 고정 — 환불 UI 특성상 최신 결제부터 노출이 자연스러움.
     */
    @GetMapping("/me")
    public ResponseEntity<PageResponse<PaymentResponse>> listMyPayments(
            Authentication authentication,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        UUID writerId = requireWriterId(authentication);
        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, Math.min(size, 50));
        Pageable pageable = PageRequest.of(safePage, safeSize, Sort.by(Sort.Direction.DESC, "createdAt"));
        return ResponseEntity.ok(paymentService.listMyPayments(writerId, pageable));
    }

    /**
     * 환불 신청 — 약관 제5조. 즉시 환불되지 않고 운영자 검토 후 승인된다.
     *
     * <p>신청 시 이메일이 운영자({@code 2square.f203@gmail.com})에게 발송된다.
     * 거절 후 1회까지 재신청 가능. active(REQUESTED/APPROVED) 환불이 있으면 신규 신청 차단.
     */
    @PostMapping("/{paymentId}/refund")
    public ResponseEntity<RefundResponse> requestRefund(
            Authentication authentication,
            @PathVariable String paymentId,
            @Valid @RequestBody RefundRequest request) {
        UUID writerId = requireWriterId(authentication);
        return ResponseEntity.ok(refundService.requestRefund(writerId, paymentId, request));
    }

    /** 환불 신청 취소 — 사용자가 신청 후 본인 취소 (REQUESTED 상태에서만). */
    @PostMapping("/refunds/{refundId}/cancel")
    public ResponseEntity<RefundResponse> cancelRefundRequest(
            Authentication authentication,
            @PathVariable UUID refundId) {
        UUID writerId = requireWriterId(authentication);
        return ResponseEntity.ok(refundService.cancelRequest(writerId, refundId));
    }

    @GetMapping("/wallet")
    public ResponseEntity<TokenWalletResponse> getWallet(Authentication authentication) {
        UUID writerId = requireWriterId(authentication);
        return ResponseEntity.ok(tokenWalletService.getWallet(writerId));
    }

    private UUID requireWriterId(Authentication authentication) {
        if (authentication == null || authentication.getPrincipal() == null) {
            throw new AuthException(ErrorCode.UNAUTHORIZED);
        }
        return UUID.fromString(authentication.getName());
    }
}
