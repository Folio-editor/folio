package com.storyzip.payment.domain;

/**
 * 구독 상태.
 *
 * <ul>
 *   <li>{@link #ACTIVE} — 정상 구독 중, 매월 {@code nextBillingAt}에 자동 결제</li>
 *   <li>{@link #PAYMENT_FAILED} — 3회 연속 결제 실패, 카드 갱신 필요</li>
 *   <li>{@link #CANCELLED} — 작가가 취소. 이번 결제 주기까지는 혜택 유지</li>
 *   <li>{@link #EXPIRED} — 방치되어 종료된 상태</li>
 * </ul>
 */
public enum SubscriptionStatus {
    ACTIVE,
    PAYMENT_FAILED,
    CANCELLED,
    EXPIRED
}
