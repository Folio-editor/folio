package com.storyzip.common.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * 서비스 전역에서 사용하는 에러 코드 카탈로그.
 *
 * <p>코드 네이밍 규칙:
 * <ul>
 *   <li>C### : Common (공통)</li>
 *   <li>A### : Auth (인증/인가)</li>
 *   <li>P### : Payment (결제/구독/토큰)</li>
 *   <li>AI### : AI 중계</li>
 *   <li>N### : Notification (알림)</li>
 *   <li>E### : Export (내보내기)</li>
 * </ul>
 *
 * <p>새 에러를 추가할 때는:
 * <ol>
 *   <li>도메인 prefix + 3자리 숫자로 코드 부여</li>
 *   <li>적절한 HTTP status 지정 (4xx = 클라이언트 오류, 5xx = 서버 오류)</li>
 *   <li>사용자 노출용 메시지 작성 (내부 구현 노출 금지)</li>
 * </ol>
 */
@Getter
public enum ErrorCode {

    // ===== Common (C###) =====
    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "C001", "서버 내부 오류가 발생했습니다"),
    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "C002", "잘못된 요청입니다"),
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "C003", "요청 값 검증에 실패했습니다"),
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "C004", "요청한 리소스를 찾을 수 없습니다"),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "C005", "허용되지 않은 HTTP 메서드입니다"),
    UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "C006", "지원하지 않는 미디어 타입입니다"),
    REQUEST_BODY_MALFORMED(HttpStatus.BAD_REQUEST, "C007", "요청 본문 형식이 올바르지 않습니다"),
    MISSING_PARAMETER(HttpStatus.BAD_REQUEST, "C008", "필수 파라미터가 누락되었습니다"),
    TYPE_MISMATCH(HttpStatus.BAD_REQUEST, "C009", "파라미터 타입이 올바르지 않습니다"),
    DUPLICATE_RESOURCE(HttpStatus.CONFLICT, "C010", "이미 존재하는 리소스입니다"),
    DATA_INTEGRITY_VIOLATION(HttpStatus.CONFLICT, "C011", "데이터 무결성 제약을 위반했습니다"),

    // ===== Auth (A###) =====
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "A001", "인증이 필요합니다"),
    INVALID_TOKEN(HttpStatus.UNAUTHORIZED, "A002", "유효하지 않은 토큰입니다"),
    EXPIRED_TOKEN(HttpStatus.UNAUTHORIZED, "A003", "만료된 토큰입니다"),
    UNSUPPORTED_TOKEN(HttpStatus.UNAUTHORIZED, "A004", "지원하지 않는 토큰 형식입니다"),
    REFRESH_TOKEN_NOT_FOUND(HttpStatus.UNAUTHORIZED, "A005", "리프레시 토큰을 찾을 수 없습니다"),
    FORBIDDEN(HttpStatus.FORBIDDEN, "A006", "접근 권한이 없습니다"),
    OAUTH_PROVIDER_ERROR(HttpStatus.BAD_GATEWAY, "A007", "OAuth 공급자 호출에 실패했습니다"),
    WRITER_NOT_FOUND(HttpStatus.NOT_FOUND, "A008", "작가를 찾을 수 없습니다"),
    ACCOUNT_WITHDRAWN(HttpStatus.CONFLICT, "A009", "탈퇴 처리된 계정입니다"),
    ACCOUNT_WITHDRAWAL_EXPIRED(HttpStatus.GONE, "A010", "복구 가능 기간이 만료되었습니다"),

    // ===== Payment (P###) =====
    PAYMENT_FAILED(HttpStatus.BAD_REQUEST, "P001", "결제에 실패했습니다"),
    PAYMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "P002", "결제 내역을 찾을 수 없습니다"),
    PAYMENT_ALREADY_PROCESSED(HttpStatus.CONFLICT, "P003", "이미 처리된 결제입니다"),
    PAYMENT_AMOUNT_MISMATCH(HttpStatus.BAD_REQUEST, "P004",
            "결제 금액이 일치하지 않습니다. 결제 화면을 새로고침한 뒤 다시 시도해주세요. 금액이 이미 결제됐다면 자동 취소되며, 반복되면 고객센터로 문의해주세요."),
    REFUND_FAILED(HttpStatus.BAD_REQUEST, "P005", "환불에 실패했습니다"),
    REFUND_REQUEST_DENIED(HttpStatus.BAD_REQUEST, "P012", "환불 신청이 거부되었습니다"),
    REFUND_ALREADY_REQUESTED(HttpStatus.CONFLICT, "P013", "이미 환불 신청이 진행 중입니다"),
    REFUND_RETRY_LIMIT_EXCEEDED(HttpStatus.CONFLICT, "P014", "재신청 가능 횟수를 초과했습니다"),
    SUBSCRIPTION_NOT_FOUND(HttpStatus.NOT_FOUND, "P006", "구독 정보를 찾을 수 없습니다"),
    SUBSCRIPTION_ALREADY_ACTIVE(HttpStatus.CONFLICT, "P007", "이미 활성화된 구독이 있습니다"),
    INSUFFICIENT_TOKEN(HttpStatus.PAYMENT_REQUIRED, "P008", "토큰 잔량이 부족합니다"),
    PAYMENT_GATEWAY_ERROR(HttpStatus.BAD_GATEWAY, "P009", "결제 게이트웨이 통신에 실패했습니다"),
    WEBHOOK_SIGNATURE_INVALID(HttpStatus.UNAUTHORIZED, "P010", "웹훅 서명이 유효하지 않습니다"),
    RATE_LIMIT_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "P011", "결제 요청이 너무 많습니다. 잠시 후 다시 시도해주세요."),

    // ===== AI (AI###) =====
    AI_SERVER_UNAVAILABLE(HttpStatus.BAD_GATEWAY, "AI001", "AI 서버에 연결할 수 없습니다"),
    AI_REQUEST_TIMEOUT(HttpStatus.GATEWAY_TIMEOUT, "AI002", "AI 요청이 시간 초과되었습니다"),
    AI_RESPONSE_INVALID(HttpStatus.BAD_GATEWAY, "AI003", "AI 응답 형식이 올바르지 않습니다"),
    AI_RATE_LIMIT_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "AI004", "AI 호출 한도를 초과했습니다"),
    AI_CONTENT_TOO_LONG(HttpStatus.PAYLOAD_TOO_LARGE, "AI005", "AI 요청 내용이 허용 크기를 초과했습니다"),

    // ===== Notification (N###) =====
    NOTIFICATION_NOT_FOUND(HttpStatus.NOT_FOUND, "N001", "알림을 찾을 수 없습니다"),
    NOTIFICATION_SEND_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "N002", "알림 발송에 실패했습니다"),

    // ===== Account (AC###) =====
    STORAGE_LIMIT_EXCEEDED(HttpStatus.FORBIDDEN, "AC001", "클라우드 저장 공간이 가득 찼습니다"),

    // ===== Export (E###) =====
    EXPORT_JOB_NOT_FOUND(HttpStatus.NOT_FOUND, "E001", "내보내기 작업을 찾을 수 없습니다"),
    EXPORT_FORMAT_UNSUPPORTED(HttpStatus.BAD_REQUEST, "E002", "지원하지 않는 내보내기 포맷입니다"),
    EXPORT_GENERATION_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "E003", "내보내기 파일 생성에 실패했습니다");

    private final HttpStatus status;
    private final String code;
    private final String message;

    ErrorCode(HttpStatus status, String code, String message) {
        this.status = status;
        this.code = code;
        this.message = message;
    }
}
