package com.storyzip.payment.controller;

import com.storyzip.common.exception.AuthException;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.payment.dto.BillingAuthPrepareResponse;
import com.storyzip.payment.dto.CreateSubscriptionRequest;
import com.storyzip.payment.dto.SubscriptionResponse;
import com.storyzip.payment.service.SubscriptionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * 프로 구독(정기결제) REST API.
 *
 * <p>빌링 인증 준비 → 구독 생성(첫 결제 포함) → 조회 → 해지 예약/재개.
 */
@RestController
@RequestMapping("/api/v1/subscriptions")
@RequiredArgsConstructor
public class SubscriptionController {

    private final SubscriptionService subscriptionService;

    /** 빌링 인증 준비 — 프론트가 토스 SDK {@code requestBillingAuth}에 넘길 값을 내려준다. */
    @PostMapping("/billing-auth")
    public ResponseEntity<BillingAuthPrepareResponse> prepareBillingAuth(Authentication authentication) {
        UUID writerId = requireWriterId(authentication);
        return ResponseEntity.ok(subscriptionService.prepareBillingAuth(writerId));
    }

    /** 구독 신청 — authKey → billingKey 교환 + 첫 달 즉시 결제. */
    @PostMapping
    public ResponseEntity<SubscriptionResponse> create(
            Authentication authentication,
            @Valid @RequestBody CreateSubscriptionRequest request) {
        UUID writerId = requireWriterId(authentication);
        return ResponseEntity.ok(subscriptionService.create(writerId, request));
    }

    @GetMapping("/me")
    public ResponseEntity<SubscriptionResponse> getMine(Authentication authentication) {
        UUID writerId = requireWriterId(authentication);
        return ResponseEntity.ok(subscriptionService.getMine(writerId));
    }

    /** 해지 예약 — 현재 주기 종료까지는 혜택 유지, 자동 갱신만 중단. */
    @PostMapping("/cancel")
    public ResponseEntity<SubscriptionResponse> cancel(Authentication authentication) {
        UUID writerId = requireWriterId(authentication);
        return ResponseEntity.ok(subscriptionService.cancel(writerId));
    }

    /** 해지 예약 철회 — cancelledAt 제거. */
    @PostMapping("/resume")
    public ResponseEntity<SubscriptionResponse> resume(Authentication authentication) {
        UUID writerId = requireWriterId(authentication);
        return ResponseEntity.ok(subscriptionService.resume(writerId));
    }

    private UUID requireWriterId(Authentication authentication) {
        if (authentication == null || authentication.getPrincipal() == null) {
            throw new AuthException(ErrorCode.UNAUTHORIZED);
        }
        return UUID.fromString(authentication.getName());
    }
}
