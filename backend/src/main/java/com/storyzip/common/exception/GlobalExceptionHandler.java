package com.storyzip.common.exception;

import com.storyzip.common.observability.TraceContextFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;

/**
 * 전역 예외 처리기.
 *
 * <p>모든 예외를 {@link ErrorResponse} 포맷으로 통일하고, 로깅 레벨을 HTTP status에 따라 분리한다.
 *
 * <ul>
 *   <li>4xx (클라이언트 오류) → {@code WARN}, 스택트레이스 생략</li>
 *   <li>5xx (서버 오류) → {@code ERROR}, 전체 스택트레이스</li>
 * </ul>
 *
 * <p>민감 정보(비밀번호/토큰/결제 수단 등)가 메시지에 포함될 수 있는 예외는
 * 내부 로그에만 상세 기록하고 사용자에게는 {@link ErrorCode}의 기본 메시지를 반환한다.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    // ============================================================
    // 1. 비즈니스 커스텀 예외
    // ============================================================

    @ExceptionHandler(StoryZipException.class)
    public ResponseEntity<ErrorResponse> handleStoryZipException(
            StoryZipException e, HttpServletRequest request) {
        ErrorCode errorCode = e.getErrorCode();
        HttpStatus status = errorCode.getStatus();
        String traceId = newTraceId();

        logByStatus(status, traceId, e, "[StoryZipException] {} - {}", errorCode.getCode(), e.getMessage());

        return ResponseEntity.status(status)
                .body(ErrorResponse.of(errorCode, e.getMessage(), request.getRequestURI(), traceId));
    }

    // ============================================================
    // 2. Bean Validation (@Valid / @Validated)
    // ============================================================

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleMethodArgumentNotValid(
            MethodArgumentNotValidException e, HttpServletRequest request) {
        List<ErrorResponse.FieldError> fieldErrors = e.getBindingResult().getFieldErrors().stream()
                .map(this::toFieldError)
                .toList();
        String traceId = newTraceId();

        log.warn("[Validation] traceId={} errors={}", traceId, summarizeForLog(fieldErrors));

        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(
                        ErrorCode.VALIDATION_FAILED, request.getRequestURI(), traceId, fieldErrors));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ErrorResponse> handleConstraintViolation(
            ConstraintViolationException e, HttpServletRequest request) {
        List<ErrorResponse.FieldError> fieldErrors = e.getConstraintViolations().stream()
                .map(this::toFieldError)
                .toList();
        String traceId = newTraceId();

        log.warn("[ConstraintViolation] traceId={} errors={}", traceId, summarizeForLog(fieldErrors));

        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(
                        ErrorCode.VALIDATION_FAILED, request.getRequestURI(), traceId, fieldErrors));
    }

    // ============================================================
    // 3. Spring Security (인증/인가)
    // ============================================================

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ErrorResponse> handleAuthentication(
            AuthenticationException e, HttpServletRequest request) {
        return buildCommonErrorResponse(ErrorCode.UNAUTHORIZED, request, e);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDenied(
            AccessDeniedException e, HttpServletRequest request) {
        return buildCommonErrorResponse(ErrorCode.FORBIDDEN, request, e);
    }

    // ============================================================
    // 4. Spring MVC 내장 예외 (4xx)
    // ============================================================

    @ExceptionHandler(NoHandlerFoundException.class)
    public ResponseEntity<ErrorResponse> handleNoHandlerFound(
            NoHandlerFoundException e, HttpServletRequest request) {
        return buildCommonErrorResponse(ErrorCode.RESOURCE_NOT_FOUND, request, e);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleMethodNotSupported(
            HttpRequestMethodNotSupportedException e, HttpServletRequest request) {
        return buildCommonErrorResponse(ErrorCode.METHOD_NOT_ALLOWED, request, e);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleMessageNotReadable(
            HttpMessageNotReadableException e, HttpServletRequest request) {
        return buildCommonErrorResponse(ErrorCode.REQUEST_BODY_MALFORMED, request, e);
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ErrorResponse> handleMissingParameter(
            MissingServletRequestParameterException e, HttpServletRequest request) {
        String detail = "필수 파라미터가 누락되었습니다: " + e.getParameterName();
        String traceId = newTraceId();

        log.warn("[MissingParameter] traceId={} param={}", traceId, e.getParameterName());

        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(
                        ErrorCode.MISSING_PARAMETER, detail, request.getRequestURI(), traceId));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatch(
            MethodArgumentTypeMismatchException e, HttpServletRequest request) {
        String required = e.getRequiredType() != null ? e.getRequiredType().getSimpleName() : "unknown";
        String detail = String.format(
                "파라미터 '%s'의 타입이 올바르지 않습니다. 기대 타입: %s", e.getName(), required);
        String traceId = newTraceId();

        log.warn("[TypeMismatch] traceId={} param={} required={}", traceId, e.getName(), required);

        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(ErrorCode.TYPE_MISMATCH, detail, request.getRequestURI(), traceId));
    }

    // ============================================================
    // 5. DB 제약 위반
    // ============================================================

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrityViolation(
            DataIntegrityViolationException e, HttpServletRequest request) {
        String traceId = newTraceId();
        // 원인 메시지는 DB 스키마가 노출될 수 있으므로 로그에만 기록
        log.error(
                "[DataIntegrity] traceId={} cause={}",
                traceId,
                e.getMostSpecificCause().getMessage(),
                e);

        return ResponseEntity.status(ErrorCode.DATA_INTEGRITY_VIOLATION.getStatus())
                .body(ErrorResponse.of(
                        ErrorCode.DATA_INTEGRITY_VIOLATION, request.getRequestURI(), traceId));
    }

    // ============================================================
    // 6. ResponseStatusException — Controller 가 명시한 status code 그대로 보존
    //    (이게 없으면 아래 Exception.class fallback 이 모두 500 으로 변환)
    // ============================================================

    @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(
            org.springframework.web.server.ResponseStatusException e, HttpServletRequest request) {
        HttpStatus status = HttpStatus.valueOf(e.getStatusCode().value());
        String traceId = newTraceId();
        // 4xx 는 INFO/WARN, 5xx 는 ERROR 로 logByStatus 위임
        logByStatus(status, traceId, e, "[ResponseStatusException] {} {}", status.value(), e.getReason());
        return ResponseEntity.status(status)
                .body(ErrorResponse.of(
                        ErrorCode.INTERNAL_SERVER_ERROR, e.getReason(),
                        request.getRequestURI(), traceId));
    }

    // ============================================================
    // 7. 최종 Fallback (500)
    // ============================================================

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception e, HttpServletRequest request) {
        String traceId = newTraceId();
        log.error("[Unhandled] traceId={} type={} msg={}", traceId, e.getClass().getName(), e.getMessage(), e);

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponse.of(
                        ErrorCode.INTERNAL_SERVER_ERROR, request.getRequestURI(), traceId));
    }

    // ============================================================
    // 내부 유틸
    // ============================================================

    private ResponseEntity<ErrorResponse> buildCommonErrorResponse(
            ErrorCode errorCode, HttpServletRequest request, Exception e) {
        HttpStatus status = errorCode.getStatus();
        String traceId = newTraceId();

        logByStatus(status, traceId, e, "[{}] {}", errorCode.getCode(), e.getMessage());

        return ResponseEntity.status(status)
                .body(ErrorResponse.of(errorCode, request.getRequestURI(), traceId));
    }

    private void logByStatus(
            HttpStatusCode status, String traceId, Throwable e, String format, Object... args) {
        String prefixed = "traceId=" + traceId + " " + format;
        if (status.is5xxServerError()) {
            Object[] withCause = new Object[args.length + 1];
            System.arraycopy(args, 0, withCause, 0, args.length);
            withCause[args.length] = e;
            log.error(prefixed, withCause);
        } else {
            log.warn(prefixed, args);
        }
    }

    private ErrorResponse.FieldError toFieldError(FieldError fe) {
        return ErrorResponse.FieldError.builder()
                .field(fe.getField())
                .reason(fe.getDefaultMessage())
                .rejectedValue(fe.getRejectedValue())
                .build();
    }

    /**
     * 로그 전용 요약. rejectedValue(사용자 원본 텍스트)는 길이만 기록하여 프롬프트/본문 유출을 차단한다.
     * 클라이언트 응답(ErrorResponse)에는 기존 fieldErrors가 그대로 포함되므로 API 계약은 변하지 않는다.
     */
    private List<String> summarizeForLog(List<ErrorResponse.FieldError> errors) {
        return errors.stream()
                .map(fe -> {
                    Object rv = fe.getRejectedValue();
                    int len = (rv == null) ? 0 : rv.toString().length();
                    return String.format("field=%s reason=%s rejectedLen=%d",
                            fe.getField(), fe.getReason(), len);
                })
                .toList();
    }

    private ErrorResponse.FieldError toFieldError(ConstraintViolation<?> v) {
        String path = v.getPropertyPath() != null ? v.getPropertyPath().toString() : null;
        String field = path != null && path.contains(".") ? path.substring(path.lastIndexOf('.') + 1) : path;
        return ErrorResponse.FieldError.builder()
                .field(field)
                .reason(v.getMessage())
                .rejectedValue(v.getInvalidValue())
                .build();
    }

    /**
     * TraceContextFilter가 요청 시작 시 MDC에 주입한 traceId를 우선 사용한다.
     * 필터 체인 밖(예: 비동기 콜백, 부팅 시점 예외)에서 호출되는 경우에만 새로 생성.
     * 이렇게 하면 응답 헤더 X-Trace-Id, 모든 로그 라인, 에러 응답 body의 traceId가 일치한다.
     */
    private String newTraceId() {
        String existing = MDC.get(TraceContextFilter.MDC_TRACE_ID);
        if (existing != null && !existing.isBlank()) {
            return existing;
        }
        return UUID.randomUUID().toString().replace("-", "").substring(0, 16);
    }
}
