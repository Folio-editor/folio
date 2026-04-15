package com.storyzip.auth.controller;

import com.storyzip.auth.dto.AccessTokenResponse;
import com.storyzip.auth.dto.GoogleLoginRequest;
import com.storyzip.auth.dto.LoginResponse;
import com.storyzip.auth.dto.RefreshRequest;
import com.storyzip.auth.dto.WriterDto;
import com.storyzip.auth.jwt.JwtProvider;
import com.storyzip.auth.service.AuthService;
import com.storyzip.common.exception.AuthException;
import com.storyzip.common.exception.ErrorCode;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
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
     */
    @PostMapping("/login/google")
    public ResponseEntity<LoginResponse> loginGoogleDesktop(@Valid @RequestBody GoogleLoginRequest request) {
        LoginResponse response = authService.loginWithGoogleDesktop(
                request.code(), request.codeVerifier(), request.redirectUri(), request.deviceId()
        );
        return ResponseEntity.ok(response);
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
