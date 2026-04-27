package com.storyzip.payment.domain;

/**
 * 토큰 원장 거래 타입. 어느 버킷에서 일어났는지는 {@link TokenBucket}으로 별도 기록.
 *
 * <ul>
 *   <li>{@link #CHARGE} — 종량제 결제 충전 (PURCHASE 버킷)</li>
 *   <li>{@link #SUBSCRIPTION} — 프로 구독 월 갱신 충전 (SUBSCRIPTION 버킷)</li>
 *   <li>{@link #BONUS_GRANT} — 신규 가입 보너스 지급 (BONUS 버킷)</li>
 *   <li>{@link #USAGE} — AI 기능 사용 차감</li>
 *   <li>{@link #EXPIRE} — 구독 월말·보너스 90일 만료 차감</li>
 *   <li>{@link #REFUND} — 결제 환불로 인한 회수</li>
 * </ul>
 */
public enum TokenTransactionType {
    CHARGE,
    SUBSCRIPTION,
    BONUS_GRANT,
    USAGE,
    EXPIRE,
    REFUND
}
