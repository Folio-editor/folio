package com.storyzip.payment.domain;

/**
 * 환불 신청의 처리 상태.
 *
 * <p>환불은 즉시 처리되지 않고 운영자 검토 후 수동 승인 — 약관 제5조 1항.
 * 사용자는 신청만 하고, 운영자가 이메일을 확인한 뒤 승인/거절을 결정한다.
 */
public enum RefundStatus {

    /** 사용자가 신청 — 운영자 검토 대기. */
    REQUESTED,

    /** 운영자 승인 — PortOne 취소 + 토큰 회수/보상 완료. */
    APPROVED,

    /** 운영자 거절 — 사용자에게 사유 안내. */
    REJECTED,

    /** 사용자가 신청 후 본인 취소. */
    CANCELED
}
