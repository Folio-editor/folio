package com.storyzip.payment.domain;

/**
 * 크레딧 출처 버킷. 만료·이월 정책이 달라 분리 관리한다.
 *
 * <p>차감 우선순위: {@link #SUBSCRIPTION} → {@link #BONUS} → {@link #PURCHASE}
 * (빨리 소멸하는 순).
 */
public enum TokenBucket {
    /** 프로 구독 월 갱신 시 지급. 다음 갱신에 잔여분 전부 소멸. */
    SUBSCRIPTION,
    /** 신규 가입 보너스. 지급일 기준 90일 만료. */
    BONUS,
    /** 종량제 구매분. 영구 유지. */
    PURCHASE
}
