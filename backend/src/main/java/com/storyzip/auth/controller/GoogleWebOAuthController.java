package com.storyzip.auth.controller;

import com.storyzip.auth.dto.AccessTokenResponse;
import com.storyzip.auth.dto.LoginResponse;
import com.storyzip.auth.dto.WebAccessTokenResponse;
import com.storyzip.auth.oauth.GoogleOAuthProperties;
import com.storyzip.auth.service.AuthService;
import com.storyzip.common.exception.AuthException;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.config.AppWebProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

/**
 * 웹(브라우저) Google OAuth 흐름.
 *
 * <p>흐름:
 * <ol>
 *   <li>{@code GET /start?returnTo=...} — state 발급, returnTo 검증, Google authorize URL로 302</li>
 *   <li>Google → {@code GET /callback?code,state} — state 검증, 토큰 교환, RT 쿠키 설정,
 *       에디터 URL로 302</li>
 *   <li>{@code POST /refresh-cookie} — 쿠키 RT로 AT 재발급 (RT 회전 + 쿠키 갱신)</li>
 *   <li>{@code POST /logout} — RT 무효화 + 쿠키 삭제</li>
 * </ol>
 *
 * <p>Electron 흐름({@link AuthController})과 독립적으로 운영된다.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class GoogleWebOAuthController {

    private static final String GOOGLE_AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String OAUTH_SCOPE = "openid email profile";

    private final AuthService authService;
    private final AppWebProperties webProperties;
    private final GoogleOAuthProperties googleProperties;
    private final WebAuthCookies cookies;

    /**
     * OAuth 시작 — Google authorize URL로 302.
     * state는 짧은 TTL의 httpOnly 쿠키에 저장하고, returnTo는 별도 쿠키에 저장하여
     * 콜백에서 회복한다 (CSRF 방지를 위해 쿼리스트링 대신 쿠키 사용).
     */
    @GetMapping("/google/web/start")
    public ResponseEntity<Void> start(@RequestParam(value = "returnTo", required = false) String returnTo) {
        String safeReturnTo = sanitizeReturnTo(returnTo);
        String state = UUID.randomUUID().toString();

        String authorizeUrl = UriComponentsBuilder.fromUriString(GOOGLE_AUTHORIZE_ENDPOINT)
                .queryParam("client_id", googleProperties.getClientId())
                .queryParam("redirect_uri", googleProperties.getWebRedirectUri())
                .queryParam("response_type", "code")
                .queryParam("scope", OAUTH_SCOPE)
                .queryParam("state", state)
                .queryParam("access_type", "online")
                .queryParam("prompt", "select_account")
                .build()
                .toUriString();

        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.SET_COOKIE, cookies.buildStateCookie(state).toString())
                .header(HttpHeaders.SET_COOKIE, cookies.buildReturnToCookie(safeReturnTo).toString())
                .location(URI.create(authorizeUrl))
                .build();
    }

    /**
     * OAuth 콜백 — Google에서 받은 code를 token으로 교환하고 사용자 upsert + RT 쿠키 발급.
     * 성공 시 에디터 URL로 302, 실패 시 랜딩 URL의 에러 파라미터로 302.
     */
    @GetMapping("/google/web/callback")
    public ResponseEntity<Void> callback(
            @RequestParam(value = "code", required = false) String code,
            @RequestParam(value = "state", required = false) String state,
            @RequestParam(value = "error", required = false) String error,
            @CookieValue(value = WebAuthCookies.COOKIE_STATE, required = false) String stateCookie,
            @CookieValue(value = WebAuthCookies.COOKIE_RETURN_TO, required = false) String returnToCookie,
            @CookieValue(value = WebAuthCookies.COOKIE_DID, required = false) String existingDeviceId) {

        // Google이 에러로 콜백한 경우 — 랜딩 페이지로 에러와 함께 redirect
        if (error != null) {
            log.info("Google OAuth callback error: {}", error);
            return redirectToLanding("oauth_error", clearOauthCookies());
        }

        if (code == null || state == null || stateCookie == null
                || !constantTimeEquals(state, stateCookie)) {
            log.warn("Google OAuth callback state mismatch (state={}, cookie={})", state, stateCookie);
            return redirectToLanding("invalid_state", clearOauthCookies());
        }

        String deviceId = (existingDeviceId != null && !existingDeviceId.isBlank())
                ? existingDeviceId
                : UUID.randomUUID().toString();

        LoginResponse login;
        try {
            login = authService.loginWithGoogleWeb(code, googleProperties.getWebRedirectUri(), deviceId);
        } catch (AuthException e) {
            log.warn("Google OAuth web login failed: {}", e.getMessage());
            return redirectToLanding("login_failed", clearOauthCookies());
        }

        String returnTo = sanitizeReturnTo(returnToCookie);
        URI editorUri = URI.create(stripTrailingSlash(webProperties.getEditorUrl()) + returnTo);

        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.SET_COOKIE, cookies.buildRefreshTokenCookie(login.refreshToken()).toString())
                .header(HttpHeaders.SET_COOKIE, cookies.buildDeviceIdCookie(deviceId).toString())
                .header(HttpHeaders.SET_COOKIE, cookies.buildClearStateCookie().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.buildClearReturnToCookie().toString())
                .location(editorUri)
                .build();
    }

    /**
     * 쿠키 RT로 새 AT 발급. RT는 회전되어 쿠키도 갱신된다.
     */
    @PostMapping("/refresh-cookie")
    public ResponseEntity<WebAccessTokenResponse> refreshCookie(
            @CookieValue(value = WebAuthCookies.COOKIE_RT, required = false) String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new AuthException(ErrorCode.UNAUTHORIZED);
        }
        AccessTokenResponse rotated = authService.refreshFromCookie(refreshToken);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookies.buildRefreshTokenCookie(rotated.refreshToken()).toString())
                .body(new WebAccessTokenResponse(rotated.accessToken()));
    }

    /**
     * 웹 로그아웃 — RT 무효화 + 쿠키 삭제. deviceId 쿠키는 유지(다음 로그인 시 재사용).
     */
    @PostMapping("/web/logout")
    public ResponseEntity<Void> logout(
            @CookieValue(value = WebAuthCookies.COOKIE_RT, required = false) String refreshToken) {
        if (refreshToken != null && !refreshToken.isBlank()) {
            authService.logoutByRefreshToken(refreshToken);
        }
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.buildClearRefreshTokenCookie().toString())
                .build();
    }

    /** 외부 도메인 redirect 차단을 위해 returnTo는 path만 허용하고 정규화한다. */
    private String sanitizeReturnTo(String raw) {
        if (raw == null || raw.isBlank()) return "/";
        String trimmed = raw.trim();
        // 절대 URL / scheme-relative / protocol-relative 차단
        if (trimmed.startsWith("//") || trimmed.contains("://")) return "/";
        // path만 허용 — '/'로 시작
        if (!trimmed.startsWith("/")) return "/";
        return trimmed;
    }

    private String stripTrailingSlash(String url) {
        if (url == null || url.isEmpty()) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    private ResponseEntity<Void> redirectToLanding(String errorCode, ResponseCookie[] cookiesToSet) {
        URI landingUri = UriComponentsBuilder
                .fromUriString(stripTrailingSlash(webProperties.getLandingUrl()))
                .queryParam("auth_error", errorCode)
                .build()
                .toUri();
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(HttpStatus.FOUND).location(landingUri);
        for (ResponseCookie c : cookiesToSet) {
            builder.header(HttpHeaders.SET_COOKIE, c.toString());
        }
        return builder.build();
    }

    private ResponseCookie[] clearOauthCookies() {
        return new ResponseCookie[]{
                cookies.buildClearStateCookie(),
                cookies.buildClearReturnToCookie()
        };
    }

    /** state 비교는 타이밍 공격 방지를 위해 constant-time. */
    private boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;
        return MessageDigest.isEqual(
                a.getBytes(StandardCharsets.UTF_8),
                b.getBytes(StandardCharsets.UTF_8)
        );
    }
}
