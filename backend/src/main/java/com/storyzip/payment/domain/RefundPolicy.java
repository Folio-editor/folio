package com.storyzip.payment.domain;

/**
 * 환불 규정의 현재 버전. 약관(docs/policies/refund-policy.md) 변경 시 이 상수도 함께 업데이트한다.
 *
 * <p>결제 시 사용자가 동의한 버전을 {@code Payment.refundPolicyVersion}에 기록해 어떤 약관에
 * 동의한 결제인지 추적한다.
 */
public final class RefundPolicy {

    /** 현재 약관 버전 — 약관 변경 시 v2, v3로 올린다. */
    public static final String CURRENT_VERSION = "v1";

    private RefundPolicy() {}
}
