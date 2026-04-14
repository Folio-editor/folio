package com.storyzip.common.exception;

/** 내보내기 도메인 예외. */
public class ExportException extends StoryZipException {

    public ExportException(ErrorCode errorCode) {
        super(errorCode);
    }

    public ExportException(ErrorCode errorCode, String detailMessage) {
        super(errorCode, detailMessage);
    }

    public ExportException(ErrorCode errorCode, Throwable cause) {
        super(errorCode, cause);
    }
}
