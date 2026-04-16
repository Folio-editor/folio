package com.storyzip.payment.domain;

/**
 * 결제 상태.
 *
 * <p>READY → IN_PROGRESS → DONE 이 정상 흐름. 실패 시 FAILED, 취소 시 CANCELED.
 * 토스페이먼츠의 상태값과 매핑된다.
 */
public enum PaymentStatus {
    READY,
    IN_PROGRESS,
    DONE,
    CANCELED,
    FAILED
}
