package com.storyzip.common.exception;

/** 결제/구독/토큰 지갑 관련 예외. */
public class PaymentException extends StoryZipException {

    public PaymentException(ErrorCode errorCode) {
        super(errorCode);
    }

    public PaymentException(ErrorCode errorCode, String detailMessage) {
        super(errorCode, detailMessage);
    }

    public PaymentException(ErrorCode errorCode, Throwable cause) {
        super(errorCode, cause);
    }
}
