package com.storyzip.payment.domain;

/**
 * 환불 사유 분류 — CS 분석/통계용 코드.
 *
 * <p>환불 정책 제5조에 따라 환불 요청 시 사용자가 선택/입력한다.
 * 자유 입력 사유는 별도 텍스트 필드로 보관한다.
 */
public enum RefundReason {

    /** 단순 변심 — 청약철회 7일 이내. */
    CUSTOMER_CHANGE_OF_MIND,

    /** 서비스 불만 / 기능 미흡. */
    SERVICE_ISSUE,

    /** 결제 오류 / 중복 결제 등. */
    PAYMENT_ERROR,

    /** 회사 귀책 — 서비스 장애 / 시스템 오류. 정책 제4조 4항. */
    COMPANY_FAULT,

    /** 기타. */
    OTHER
}
