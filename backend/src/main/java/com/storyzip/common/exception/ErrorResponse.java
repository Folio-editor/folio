package com.storyzip.common.exception;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.OffsetDateTime;
import java.util.List;
import lombok.Builder;
import lombok.Getter;

/**
 * 전역 에러 응답 포맷.
 *
 * <p>프론트엔드와의 계약을 단일화하기 위해 모든 에러는 이 구조로 반환된다.
 *
 * <pre>
 * {
 *   "timestamp": "2026-04-14T10:15:30+09:00",
 *   "status": 400,
 *   "code": "C003",
 *   "message": "요청 값 검증에 실패했습니다",
 *   "path": "/api/v1/writers",
 *   "traceId": "a1b2c3...",
 *   "errors": [ { "field": "email", "reason": "형식이 올바르지 않습니다", "rejectedValue": "abc" } ]
 * }
 * </pre>
 */
@Getter
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ErrorResponse {

    private final OffsetDateTime timestamp;
    private final int status;
    private final String code;
    private final String message;
    private final String path;
    private final String traceId;
    private final List<FieldError> errors;

    public static ErrorResponse of(ErrorCode errorCode, String path, String traceId) {
        return ErrorResponse.builder()
                .timestamp(OffsetDateTime.now())
                .status(errorCode.getStatus().value())
                .code(errorCode.getCode())
                .message(errorCode.getMessage())
                .path(path)
                .traceId(traceId)
                .build();
    }

    public static ErrorResponse of(
            ErrorCode errorCode, String overrideMessage, String path, String traceId) {
        return ErrorResponse.builder()
                .timestamp(OffsetDateTime.now())
                .status(errorCode.getStatus().value())
                .code(errorCode.getCode())
                .message(overrideMessage != null ? overrideMessage : errorCode.getMessage())
                .path(path)
                .traceId(traceId)
                .build();
    }

    public static ErrorResponse of(
            ErrorCode errorCode, String path, String traceId, List<FieldError> errors) {
        return ErrorResponse.builder()
                .timestamp(OffsetDateTime.now())
                .status(errorCode.getStatus().value())
                .code(errorCode.getCode())
                .message(errorCode.getMessage())
                .path(path)
                .traceId(traceId)
                .errors(errors)
                .build();
    }

    /** 필드 단위 검증 실패 상세. */
    @Getter
    @Builder
    public static class FieldError {
        private final String field;
        private final String reason;
        private final Object rejectedValue;
    }
}
