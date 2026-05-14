package com.storyzip.auth.controller;

import com.storyzip.auth.dto.AccessTokenResponse;
import com.storyzip.auth.dto.GoogleLoginRequest;
import com.storyzip.auth.dto.LoginResponse;
import com.storyzip.auth.dto.RefreshRequest;
import com.storyzip.auth.dto.WithdrawnAccountResponse;
import com.storyzip.auth.dto.WriterDto;
import com.storyzip.auth.jwt.JwtProvider;
import com.storyzip.auth.service.AuthService;
import com.storyzip.common.exception.AuthException;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.WithdrawnAccountException;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private static final String AUTH_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private final AuthService authService;
    private final JwtProvider jwtProvider;

    /**
     * Electron PKCE Google 로그인.
     * 클라이언트가 생성한 deviceId로 다중 기기 로그인 지원.
     *
     * <p>탈퇴 처리된 계정이면 토큰 발급 대신 HTTP 409 + {@link WithdrawnAccountResponse} 응답.
     * 클라이언트는 이 응답을 받으면 복구 다이얼로그를 띄우고 {@code POST /restore} 로 진입한다.
     */
    @PostMapping("/login/google")
    public ResponseEntity<?> loginGoogleDesktop(@Valid @RequestBody GoogleLoginRequest request) {
        try {
            LoginResponse response = authService.loginWithGoogleDesktop(
                    request.code(), request.codeVerifier(), request.redirectUri(), request.deviceId()
            );
            return ResponseEntity.ok(response);
        } catch (WithdrawnAccountException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(
                    WithdrawnAccountResponse.of(e.getDeletedAt(), e.getRestorableUntil())
            );
        }
    }

    /**
     * Refresh Token으로 Access Token 재발급.
     * Authorization 헤더에 만료된 Access Token을 함께 전달하여 사용자 식별.
     */
    @PostMapping("/refresh")
    public ResponseEntity<AccessTokenResponse> refresh(
            @RequestHeader(value = AUTH_HEADER, required = false) String authHeader,
            @Valid @RequestBody RefreshRequest request) {
        UUID writerId = extractWriterIdFromExpiredToken(authHeader);
        return ResponseEntity.ok(authService.refresh(request.refreshToken(), request.deviceId(), writerId));
    }

    /**
     * 단일 기기 로그아웃 — 해당 기기의 Refresh Token만 삭제.
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            Authentication authentication,
            @RequestHeader("X-Device-Id") String deviceId) {
        UUID writerId = requireWriterId(authentication);
        authService.logout(writerId, deviceId);
        return ResponseEntity.noContent().build();
    }

    /**
     * 전체 기기 로그아웃 — 해당 사용자의 모든 Refresh Token 삭제.
     */
    @PostMapping("/logout/all")
    public ResponseEntity<Void> logoutAllDevices(Authentication authentication) {
        UUID writerId = requireWriterId(authentication);
        authService.logoutAllDevices(writerId);
        return ResponseEntity.noContent().build();
    }

    /**
     * 현재 로그인 사용자 정보 조회.
     */
    @GetMapping("/me")
    public ResponseEntity<WriterDto> me(Authentication authentication) {
        UUID writerId = requireWriterId(authentication);
        return ResponseEntity.ok(authService.me(writerId));
    }

    /**
     * 회원 탈퇴 — soft delete + 모든 기기 refresh token 폐기.
     * 30일 내 같은 Google 계정으로 다시 로그인하면 복구 가능.
     */
    @PostMapping("/withdraw")
    public ResponseEntity<Void> withdraw(Authentication authentication) {
        UUID writerId = requireWriterId(authentication);
        authService.withdraw(writerId);
        return ResponseEntity.noContent().build();
    }

    /**
     * 탈퇴 처리된 계정 복구 + 로그인 — 클라이언트가 새 Google code 를 받아 전달.
     * deleted_at = NULL 로 되돌리고 일반 로그인 응답을 발급한다.
     * 복구 가능 기간({@code 30일}) 초과 시 거부.
     */
    @PostMapping("/restore")
    public ResponseEntity<LoginResponse> restore(@Valid @RequestBody GoogleLoginRequest request) {
        LoginResponse response = authService.restoreAndLogin(
                request.code(), request.codeVerifier(), request.redirectUri(), request.deviceId()
        );
        return ResponseEntity.ok(response);
    }

    private UUID requireWriterId(Authentication authentication) {
        if (authentication == null || authentication.getPrincipal() == null) {
            throw new AuthException(ErrorCode.UNAUTHORIZED);
        }
        return UUID.fromString(authentication.getName());
    }

    private UUID extractWriterIdFromExpiredToken(String authHeader) {
        if (authHeader == null || !authHeader.startsWith(BEARER_PREFIX)) {
            throw new AuthException(ErrorCode.UNAUTHORIZED);
        }
        String token = authHeader.substring(BEARER_PREFIX.length());
        try {
            return jwtProvider.extractWriterIdAllowExpired(token);
        } catch (Exception e) {
            throw new AuthException(ErrorCode.INVALID_TOKEN);
        }
    }
}
