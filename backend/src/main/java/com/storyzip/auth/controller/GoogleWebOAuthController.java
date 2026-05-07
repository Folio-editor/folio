package com.storyzip.auth.controller;

import com.storyzip.auth.dto.AccessTokenResponse;
import com.storyzip.auth.dto.LoginResponse;
import com.storyzip.auth.dto.OAuthAuthCodePayload;
import com.storyzip.auth.oauth.GoogleOAuthProperties;
import com.storyzip.auth.service.AuthService;
import com.storyzip.auth.service.OAuthAuthCodeRedisService;
import com.storyzip.auth.service.OAuthStateRedisService;
import com.storyzip.common.exception.AuthException;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.config.AppWebProperties;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
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
    private final OAuthStateRedisService oauthStateRedisService;
    private final OAuthAuthCodeRedisService oauthAuthCodeRedisService;

    /**
     * OAuth 시작 — Google authorize URL로 302.
     * state는 Redis에 5분 TTL로 저장하고 callback에서 1회 소비. 쿠키 의존 제거 →
     * cross-site navigation에서 브라우저가 Set-Cookie를 거부하는 환경에서도 안전 동작.
     */
    @GetMapping("/google/web/start")
    public void start(
            HttpServletResponse response,
            @RequestParam(value = "returnTo", required = false) String returnTo) {
        String safeReturnTo = sanitizeReturnTo(returnTo);
        String state = UUID.randomUUID().toString();

        // 도플러 값에 CRLF/공백이 섞일 수 있어 sanitize (Doppler CRLF 이슈 방어)
        String clientId = sanitizeOAuthValue(googleProperties.getClientId());
        String redirectUri = sanitizeOAuthValue(googleProperties.getWebRedirectUri());

        // state + returnTo를 Redis에 저장 (5분 TTL, 1회 소비)
        oauthStateRedisService.saveState(state, safeReturnTo);
        log.info("[OAuth start] state={} returnTo={} (Redis 저장)", state, safeReturnTo);

        // .encode()로 query param의 공백 등 자동 percent-encoding
        URI authorizeUri = UriComponentsBuilder.fromUriString(GOOGLE_AUTHORIZE_ENDPOINT)
                .queryParam("client_id", clientId)
                .queryParam("redirect_uri", redirectUri)
                .queryParam("response_type", "code")
                .queryParam("scope", OAUTH_SCOPE)
                .queryParam("state", state)
                .queryParam("access_type", "online")
                .queryParam("prompt", "select_account")
                .encode()
                .build()
                .toUri();

        response.setHeader(HttpHeaders.LOCATION, authorizeUri.toString());
        response.setStatus(HttpStatus.FOUND.value());
    }

    /**
     * OAuth client_id/redirect_uri의 잠재적 CRLF·공백·중복 sanitize.
     * Doppler가 Git Bash 환경에서 값에 \r\n을 섞어 저장하는 알려진 이슈에 대한 방어선.
     * 첫 줄만 사용하고 trim으로 양 끝 공백 제거.
     */
    private String sanitizeOAuthValue(String raw) {
        if (raw == null) return "";
        // \r\n, \n, 또는 공백으로 잘라 첫 토큰만 사용
        int splitAt = -1;
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c == '\r' || c == '\n' || c == ' ' || c == '\t') {
                splitAt = i;
                break;
            }
        }
        return (splitAt >= 0 ? raw.substring(0, splitAt) : raw).trim();
    }

    /**
     * OAuth 콜백 — Google에서 받은 code를 token으로 교환하고 사용자 upsert + RT 쿠키 발급.
     * 성공 시 에디터 URL로 302, 실패 시 랜딩 URL의 에러 파라미터로 302.
     */
    @GetMapping("/google/web/callback")
    public void callback(
            HttpServletResponse response,
            @RequestParam(value = "code", required = false) String code,
            @RequestParam(value = "state", required = false) String state,
            @RequestParam(value = "error", required = false) String error) {

        // Google이 에러로 콜백한 경우
        if (error != null) {
            log.info("Google OAuth callback error: {}", error);
            redirectToLanding(response, "oauth_error");
            return;
        }

        if (code == null || state == null) {
            log.warn("[OAuth callback] code 또는 state 파라미터 누락");
            redirectToLanding(response, "invalid_state");
            return;
        }

        // Redis에서 state 1회 소비
        String storedReturnTo = oauthStateRedisService.consumeState(state);
        if (storedReturnTo == null) {
            log.warn("[OAuth callback] state 검증 실패 — Redis에 없음 (만료/위조/재사용) state={}", state);
            redirectToLanding(response, "invalid_state");
            return;
        }

        // deviceId는 새로 생성 (web은 localStorage로 영속하므로 callback 시점엔 알 수 없음)
        String deviceId = UUID.randomUUID().toString();

        LoginResponse login;
        try {
            login = authService.loginWithGoogleWeb(code, googleProperties.getWebRedirectUri(), deviceId);
        } catch (AuthException e) {
            log.warn("Google OAuth web login failed: {}", e.getMessage());
            redirectToLanding(response, "login_failed");
            return;
        }

        // RT/AT/writer/deviceId를 short-lived auth_code로 Redis에 저장 (2분 TTL, 1회 소비).
        // 쿠키 의존 제거 — frontend가 query param으로 받아 즉시 exchange 호출.
        String authCode = UUID.randomUUID().toString();
        OAuthAuthCodePayload payload = new OAuthAuthCodePayload(
                login.accessToken(),
                login.refreshToken(),
                deviceId,
                login.writer(),
                login.isNewUser(),
                login.encryption()
        );
        oauthAuthCodeRedisService.saveCode(authCode, payload);

        // 에디터로 ?auth_code=xxx로 redirect
        URI editorUri = UriComponentsBuilder
                .fromUriString(stripTrailingSlash(webProperties.getEditorUrl()) + storedReturnTo)
                .queryParam("auth_code", authCode)
                .build()
                .toUri();
        log.info("[OAuth callback] 로그인 성공 → {} (writer={})", editorUri, login.writer().id());

        response.setHeader(HttpHeaders.LOCATION, editorUri.toString());
        response.setStatus(HttpStatus.FOUND.value());
    }

    /**
     * Frontend가 callback redirect로 받은 auth_code를 토큰으로 교환.
     * 1회 소비 — 같은 code로 두 번 호출하면 두 번째는 invalid.
     */
    @PostMapping("/web/exchange")
    public ResponseEntity<OAuthAuthCodePayload> exchange(@RequestParam("code") String code) {
        OAuthAuthCodePayload payload = oauthAuthCodeRedisService.consumeCode(code);
        if (payload == null) {
            throw new AuthException(ErrorCode.INVALID_TOKEN);
        }
        return ResponseEntity.ok(payload);
    }

    /**
     * Web 전용 RT 갱신 — body에 RT만 받고 reverse-lookup으로 writerId/deviceId 추출.
     * Electron의 /auth/refresh와 달리 Authorization 헤더(만료 AT) 불필요 → 새로고침 후에도 동작.
     */
    @PostMapping("/web/refresh")
    public ResponseEntity<AccessTokenResponse> webRefresh(@RequestBody WebRefreshRequest request) {
        if (request == null || request.refreshToken() == null || request.refreshToken().isBlank()) {
            throw new AuthException(ErrorCode.UNAUTHORIZED);
        }
        AccessTokenResponse rotated = authService.refreshFromCookie(request.refreshToken());
        return ResponseEntity.ok(rotated);
    }

    /**
     * Web 로그아웃 — body에 RT만 받고 reverse-lookup으로 무효화.
     */
    @PostMapping("/web/logout")
    public ResponseEntity<Void> logout(@RequestBody(required = false) WebRefreshRequest request) {
        if (request != null && request.refreshToken() != null && !request.refreshToken().isBlank()) {
            authService.logoutByRefreshToken(request.refreshToken());
        }
        return ResponseEntity.noContent().build();
    }

    public record WebRefreshRequest(String refreshToken) {
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

    private void redirectToLanding(HttpServletResponse response, String errorCode) {
        URI landingUri = UriComponentsBuilder
                .fromUriString(stripTrailingSlash(webProperties.getLandingUrl()))
                .queryParam("auth_error", errorCode)
                .build()
                .toUri();
        response.setHeader(HttpHeaders.LOCATION, landingUri.toString());
        response.setStatus(HttpStatus.FOUND.value());
    }
}
