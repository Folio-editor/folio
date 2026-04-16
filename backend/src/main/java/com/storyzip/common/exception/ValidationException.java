package com.storyzip.common.exception;

/**
 * 수동 검증 실패 시 사용.
 *
 * <p>{@code @Valid} / {@code @Validated}에 의한 자동 검증 실패는
 * Spring이 {@code MethodArgumentNotValidException}을 던지므로
 * 이 예외를 직접 던질 필요 없이 {@code GlobalExceptionHandler}가 처리한다.
 */
public class ValidationException extends StoryZipException {

    public ValidationException(String detailMessage) {
        super(ErrorCode.VALIDATION_FAILED, detailMessage);
    }

    public ValidationException(ErrorCode errorCode, String detailMessage) {
        super(errorCode, detailMessage);
    }
}
