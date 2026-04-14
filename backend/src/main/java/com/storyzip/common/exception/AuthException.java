package com.storyzip.common.exception;

/** 인증/인가 관련 예외. */
public class AuthException extends StoryZipException {

    public AuthException(ErrorCode errorCode) {
        super(errorCode);
    }

    public AuthException(ErrorCode errorCode, String detailMessage) {
        super(errorCode, detailMessage);
    }

    public AuthException(ErrorCode errorCode, Throwable cause) {
        super(errorCode, cause);
    }
}
