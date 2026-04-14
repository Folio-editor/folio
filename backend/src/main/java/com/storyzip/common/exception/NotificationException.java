package com.storyzip.common.exception;

/** 알림 도메인 예외. */
public class NotificationException extends StoryZipException {

    public NotificationException(ErrorCode errorCode) {
        super(errorCode);
    }

    public NotificationException(ErrorCode errorCode, String detailMessage) {
        super(errorCode, detailMessage);
    }

    public NotificationException(ErrorCode errorCode, Throwable cause) {
        super(errorCode, cause);
    }
}
