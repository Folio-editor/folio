package com.storyzip.common.exception;

import lombok.Getter;

/**
 * 서비스 전역 커스텀 예외의 최상위 부모.
 *
 * <p>모든 비즈니스 예외는 이 클래스를 상속해 도메인별 예외로 분기한다.
 * {@link ErrorCode}를 필수로 보유하여 {@code GlobalExceptionHandler}에서 일관된 응답으로 매핑된다.
 *
 * <p>사용 규칙:
 * <ul>
 *   <li>비즈니스 로직 실패는 반드시 이 예외 계열을 던진다 ({@code RuntimeException} 직접 사용 금지)</li>
 *   <li>기본 메시지는 {@link ErrorCode#getMessage()}를 따르며, 상세 상황을 덧붙일 때만 커스텀 메시지 사용</li>
 *   <li>사용자 노출 메시지에는 내부 구현/스택/PII 포함 금지</li>
 * </ul>
 */
@Getter
public abstract class StoryZipException extends RuntimeException {

    private final ErrorCode errorCode;

    protected StoryZipException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }

    protected StoryZipException(ErrorCode errorCode, String detailMessage) {
        super(detailMessage);
        this.errorCode = errorCode;
    }

    protected StoryZipException(ErrorCode errorCode, Throwable cause) {
        super(errorCode.getMessage(), cause);
        this.errorCode = errorCode;
    }

    protected StoryZipException(ErrorCode errorCode, String detailMessage, Throwable cause) {
        super(detailMessage, cause);
        this.errorCode = errorCode;
    }
}
