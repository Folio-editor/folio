package com.storyzip.payment.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * 토스 빌링키 발급 응답 — {@code POST /v1/billing/authorizations/issue}.
 *
 * <p>여러 필드 중 서비스에서 쓰는 값만 추려낸다.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record TossBillingAuthResponse(
        String mId,
        String customerKey,
        String authenticatedAt,
        String method,
        String billingKey,
        String cardCompany,
        String cardNumber
) {}
