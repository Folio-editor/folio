package com.storyzip.auth.controller;

import com.storyzip.auth.jwt.JwtProvider;
import com.storyzip.config.AppWebProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * 웹(브라우저) OAuth 흐름에서 사용하는 httpOnly 쿠키 빌더 모음.
 *
 * <p>Electron 흐름은 안 쓴다 (Authorization 헤더 + safeStorage 기반).
 * <p>모든 쿠키는 {@code SameSite=Lax} (top-level navigation에 첨부, cross-site POST엔 미첨부 → CSRF 1차 방어)
 * + {@code HttpOnly} (XSS로부터 RT 보호) + {@code Secure} (prod) 속성을 가진다.
 */
@Component
@RequiredArgsConstructor
public class WebAuthCookies {

    /** Refresh Token. /api/v1/auth 경로에만 첨부. */
    public static final String COOKIE_RT = "folio_rt";

    /** Device ID. 영구 유지 (10년). 로그아웃해도 삭제하지 않아 다음 로그인 시 같은 deviceId 재사용. */
    public static final String COOKIE_DID = "folio_did";

    /** OAuth state (CSRF). 모든 경로에 첨부 (5분 TTL이라 보안 영향 작음). */
    public static final String COOKIE_STATE = "folio_oauth_state";

    /** OAuth returnTo (redirect 대상 path). state와 함께 단명. */
    public static final String COOKIE_RETURN_TO = "folio_oauth_return";

    private static final String AUTH_PATH = "/api/v1/auth";
    // OAuth state/returnTo 쿠키는 Path="/"로 두어 callback 요청에 확실히 첨부되게 한다
    // (Path="/api/v1/auth/google/web"으로 좁히면 일부 브라우저에서 callback에 매칭 안 되는 사례 있음).
    // 5분 TTL이라 다른 경로 노출 위험 낮음.
    private static final String OAUTH_PATH = "/";
    private static final Duration STATE_TTL = Duration.ofMinutes(5);
    private static final Duration DEVICE_TTL = Duration.ofDays(3650); // 10년

    private final AppWebProperties webProperties;
    private final JwtProvider jwtProvider;

    public ResponseCookie buildRefreshTokenCookie(String token) {
        return base(COOKIE_RT, token, AUTH_PATH)
                .maxAge(Duration.ofSeconds(jwtProvider.getRefreshExpirySeconds()))
                .build();
    }

    public ResponseCookie buildClearRefreshTokenCookie() {
        return base(COOKIE_RT, "", AUTH_PATH).maxAge(0).build();
    }

    public ResponseCookie buildDeviceIdCookie(String deviceId) {
        // deviceId는 모든 경로에서 읽혀야 한다 (callback에서 set, refresh-cookie에서 read).
        return base(COOKIE_DID, deviceId, "/").maxAge(DEVICE_TTL).build();
    }

    public ResponseCookie buildStateCookie(String state) {
        return base(COOKIE_STATE, state, OAUTH_PATH).maxAge(STATE_TTL).build();
    }

    public ResponseCookie buildClearStateCookie() {
        return base(COOKIE_STATE, "", OAUTH_PATH).maxAge(0).build();
    }

    public ResponseCookie buildReturnToCookie(String returnTo) {
        return base(COOKIE_RETURN_TO, returnTo, OAUTH_PATH).maxAge(STATE_TTL).build();
    }

    public ResponseCookie buildClearReturnToCookie() {
        return base(COOKIE_RETURN_TO, "", OAUTH_PATH).maxAge(0).build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String name, String value, String path) {
        ResponseCookie.ResponseCookieBuilder builder = ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(webProperties.isCookieSecure())
                .sameSite("Lax")
                .path(path);
        // dev에서는 cookieDomain이 빈 값 → Domain 속성 미설정 (host-only 쿠키)
        String domain = webProperties.getCookieDomain();
        if (domain != null && !domain.isBlank()) {
            builder.domain(domain);
        }
        return builder;
    }
}
