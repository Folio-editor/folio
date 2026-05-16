package com.storyzip.common.exception;

import java.time.LocalDateTime;

/**
 * 탈퇴 처리된 계정으로 로그인 시도 시 발생.
 *
 * <p>일반 {@link AuthException} 과 달리 메타데이터(탈퇴 시각, 복구 마감일)를 함께 실어,
 * 컨트롤러가 클라이언트의 복구 다이얼로그용 응답으로 변환할 수 있게 한다.
 */
public class WithdrawnAccountException extends AuthException {

    private final LocalDateTime deletedAt;
    private final LocalDateTime restorableUntil;

    public WithdrawnAccountException(LocalDateTime deletedAt, LocalDateTime restorableUntil) {
        super(ErrorCode.ACCOUNT_WITHDRAWN);
        this.deletedAt = deletedAt;
        this.restorableUntil = restorableUntil;
    }

    public LocalDateTime getDeletedAt() {
        return deletedAt;
    }

    public LocalDateTime getRestorableUntil() {
        return restorableUntil;
    }
}
