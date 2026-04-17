package com.storyzip.common.exception;

/** 일반 리소스 조회 실패 공통 예외. 도메인별 NotFound는 도메인 예외+ErrorCode로 구분 권장. */
public class NotFoundException extends StoryZipException {

    public NotFoundException() {
        super(ErrorCode.RESOURCE_NOT_FOUND);
    }

    public NotFoundException(ErrorCode errorCode) {
        super(errorCode);
    }

    public NotFoundException(ErrorCode errorCode, String detailMessage) {
        super(errorCode, detailMessage);
    }
}
