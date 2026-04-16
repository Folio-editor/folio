package com.storyzip.common.exception;

/** AI 서버 중계 관련 예외. */
public class AiException extends StoryZipException {

    public AiException(ErrorCode errorCode) {
        super(errorCode);
    }

    public AiException(ErrorCode errorCode, String detailMessage) {
        super(errorCode, detailMessage);
    }

    public AiException(ErrorCode errorCode, Throwable cause) {
        super(errorCode, cause);
    }
}
