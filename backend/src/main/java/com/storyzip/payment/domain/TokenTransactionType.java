package com.storyzip.payment.domain;

/**
 * 토큰 원장 거래 타입.
 *
 * <ul>
 *   <li>{@link #CHARGE} — 유료 결제로 충전 (amount 양수)</li>
 *   <li>{@link #SUBSCRIPTION} — 프로 구독 월별 자동 충전 (amount 양수)</li>
 *   <li>{@link #USAGE} — AI 기능 사용 차감 (amount 음수)</li>
 *   <li>{@link #EXPIRE} — 1년 경과 토큰 만료 차감 (amount 음수)</li>
 *   <li>{@link #REFUND} — 결제 환불로 인한 회수 (amount 음수)</li>
 *   <li>{@link #GRANT} — 무료 티어 월별 지급 등 운영 지급 (amount 양수)</li>
 * </ul>
 */
public enum TokenTransactionType {
    CHARGE,
    SUBSCRIPTION,
    USAGE,
    EXPIRE,
    REFUND,
    GRANT
}
