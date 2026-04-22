/**
 * 결제/구독/토큰 지갑 도메인.
 *
 * <p>토스페이먼츠 연동으로 1회성 토큰 충전과 월 구독을 처리한다.
 * <p>웹훅은 {@code payment_event.event_id} UNIQUE 제약으로 멱등성을 보장한다.
 * <p>토큰 잔액은 {@code TokenWallet} 스냅샷에 보관하되, {@code TokenTransaction}
 * 원장이 진실의 소스. 동시 차감/충전 경합은 행 단위 비관적 잠금으로 해결.
 */
package com.storyzip.payment;
