package com.storyzip.payment.controller;

import com.storyzip.common.exception.AuthException;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.payment.dto.ConfirmPaymentRequest;
import com.storyzip.payment.dto.CreatePaymentRequest;
import com.storyzip.payment.dto.CreatePaymentResponse;
import com.storyzip.payment.dto.PaymentResponse;
import com.storyzip.payment.dto.RefundResponse;
import com.storyzip.payment.dto.TokenWalletResponse;
import com.storyzip.payment.service.PaymentService;
import com.storyzip.payment.service.RefundService;
import com.storyzip.payment.service.TokenWalletService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
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

    /** 환불 — 24시간 이내 전액, 이후 잔여 일수 비례 부분 환불. */
    @PostMapping("/{paymentId}/refund")
    public ResponseEntity<RefundResponse> refund(
            Authentication authentication,
            @PathVariable String paymentId) {
        UUID writerId = requireWriterId(authentication);
        return ResponseEntity.ok(refundService.refund(writerId, paymentId));
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
