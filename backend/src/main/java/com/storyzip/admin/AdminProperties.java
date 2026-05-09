package com.storyzip.admin;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 관리자 API 인증 토큰 — Doppler {@code ADMIN_API_TOKEN} 환경변수로 주입.
 *
 * <p>Phase B 미완: 정식 출시 전 Writer 테이블의 role 기반 인증으로 강화 예정.
 * 알파/베타 단계엔 단일 토큰을 헤더(X-Admin-Token)로 검증한다.
 *
 * <p>토큰 미설정 시 모든 admin API 호출이 401로 차단된다 (보안 fail-safe).
 */
@Component
public class AdminProperties {

    private final String token;

    public AdminProperties(@Value("${storyzip.admin.api-token:}") String token) {
        this.token = token == null ? "" : token.trim();
    }

    public String getToken() {
        return token;
    }

    /** 토큰 미설정 시 모든 요청 거부 (보안 fail-safe). */
    public boolean isEnabled() {
        return !token.isBlank();
    }

    public boolean matches(String headerValue) {
        if (!isEnabled()) return false;
        if (headerValue == null) return false;
        return token.equals(headerValue.trim());
    }
}
