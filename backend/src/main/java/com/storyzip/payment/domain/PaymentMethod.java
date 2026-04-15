package com.storyzip.payment.domain;

/**
 * 결제 수단.
 *
 * <p>토스페이먼츠가 승인 응답에서 내려주는 값으로 결정된다. 수단별 후처리 로직 분기 기준.
 */
public enum PaymentMethod {
    CARD,
    VIRTUAL_ACCOUNT,
    EASY_PAY,
    TRANSFER,
    MOBILE_PHONE,
    CULTURE_GIFT_CERTIFICATE
}
