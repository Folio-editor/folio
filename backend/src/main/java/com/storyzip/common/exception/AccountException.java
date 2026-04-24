package com.storyzip.common.exception;

public class AccountException extends StoryZipException {

    public AccountException(ErrorCode errorCode) {
        super(errorCode);
    }

    public AccountException(ErrorCode errorCode, String detailMessage) {
        super(errorCode, detailMessage);
    }
}
