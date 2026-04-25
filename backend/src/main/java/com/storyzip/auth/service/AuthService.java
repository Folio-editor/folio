package com.storyzip.auth.service;

import com.storyzip.auth.domain.Role;
import com.storyzip.auth.domain.Writer;
import com.storyzip.auth.dto.AccessTokenResponse;
import com.storyzip.auth.dto.LoginResponse;
import com.storyzip.auth.dto.WriterDto;
import com.storyzip.auth.jwt.JwtProvider;
import com.storyzip.auth.oauth.GoogleOAuthClient;
import com.storyzip.auth.oauth.GoogleUserInfo;
import com.storyzip.auth.repository.WriterRepository;
import com.storyzip.common.exception.AuthException;
import com.storyzip.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

/**
 * 인증 비즈니스 로직.
 *
 * <p>Refresh Token은 Redis에 기기별로 저장된다. 다중 기기 동시 로그인 지원.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private static final String PROVIDER_GOOGLE = "google";

    private final GoogleOAuthClient googleOAuthClient;
    private final WriterRepository writerRepository;
    private final RefreshTokenRedisService refreshTokenRedisService;
    private final JwtProvider jwtProvider;

    /**
     * Electron PKCE 로그인 — Google 인증 완료 후 code/code_verifier 수신 → JWT 발급.
     *
     * @param deviceId 기기 식별자 (클라이언트가 발급한 고유 ID)
     */
    @Transactional
    public LoginResponse loginWithGoogleDesktop(String code, String codeVerifier,
                                                String redirectUri, String deviceId) {
        GoogleUserInfo userInfo = googleOAuthClient.exchangeDesktopCode(code, codeVerifier, redirectUri);
        return upsertWriterAndIssueTokens(userInfo, deviceId);
    }

    /**
     * Web OAuth 로그인 — 백엔드 redirect 콜백에서 받은 code를 client_secret으로 교환.
     * deviceId는 백엔드에서 발급/재사용 (httpOnly 쿠키로 영속).
     */
    @Transactional
    public LoginResponse loginWithGoogleWeb(String code, String redirectUri, String deviceId) {
        GoogleUserInfo userInfo = googleOAuthClient.exchangeWebCode(code, redirectUri);
        return upsertWriterAndIssueTokens(userInfo, deviceId);
    }

    /**
     * Refresh Token으로 Access Token 재발급. Refresh Token Rotation 적용.
     *
     * <p>Redis에 저장된 토큰과 일치해야 하며, 불일치 시 탈취 의심으로 간주하여 거부한다.
     */
    @Transactional(readOnly = true)
    public AccessTokenResponse refresh(String refreshToken, String deviceId, UUID writerId) {
        String stored = refreshTokenRedisService.find(writerId, deviceId);
        if (stored == null || !stored.equals(refreshToken)) {
            // 탈취 의심 — 해당 기기 토큰 강제 삭제
            refreshTokenRedisService.delete(writerId, deviceId);
            throw new AuthException(ErrorCode.INVALID_TOKEN);
        }
        return rotateAndIssue(writerId, deviceId);
    }

    /**
     * 웹 쿠키 기반 refresh — RT만으로 (writerId, deviceId)를 역조회하여 새 AT/RT 발급.
     *
     * <p>웹 클라이언트는 httpOnly 쿠키로만 RT를 보유하고 만료된 AT를 보내지 않으므로
     * Authorization 헤더에서 writerId를 추출할 수 없다. 따라서 Redis의 역방향 인덱스를 사용한다.
     *
     * @return 새 AT + 새 RT (호출자가 RT 쿠키를 갱신해야 함)
     */
    @Transactional(readOnly = true)
    public AccessTokenResponse refreshFromCookie(String refreshToken) {
        RefreshTokenRedisService.Owner owner = refreshTokenRedisService.findOwner(refreshToken);
        if (owner == null) {
            throw new AuthException(ErrorCode.INVALID_TOKEN);
        }
        return rotateAndIssue(owner.writerId(), owner.deviceId());
    }

    /**
     * 단일 기기 로그아웃 — 해당 기기의 Refresh Token만 삭제.
     */
    public void logout(UUID writerId, String deviceId) {
        refreshTokenRedisService.delete(writerId, deviceId);
    }

    /**
     * 웹 쿠키 로그아웃 — RT만으로 소유자 역조회 후 삭제.
     * 토큰이 이미 무효해도 조용히 통과 (idempotent).
     */
    public void logoutByRefreshToken(String refreshToken) {
        RefreshTokenRedisService.Owner owner = refreshTokenRedisService.findOwner(refreshToken);
        if (owner != null) {
            refreshTokenRedisService.delete(owner.writerId(), owner.deviceId());
        }
    }

    /**
     * 전체 기기 로그아웃 — 해당 사용자의 모든 Refresh Token 삭제.
     */
    public void logoutAllDevices(UUID writerId) {
        refreshTokenRedisService.deleteAllDevices(writerId);
    }

    @Transactional(readOnly = true)
    public WriterDto me(UUID writerId) {
        Writer writer = writerRepository.findById(writerId)
                .orElseThrow(() -> new AuthException(ErrorCode.WRITER_NOT_FOUND));
        return WriterDto.from(writer);
    }

    private LoginResponse issueTokens(Writer writer, String deviceId, boolean isNewUser) {
        String access = jwtProvider.createAccessToken(writer.getId(), writer.getEmail(), writer.getRole().name());
        String refresh = jwtProvider.createRefreshToken();
        refreshTokenRedisService.save(writer.getId(), deviceId, refresh, jwtProvider.getRefreshExpirySeconds());
        return new LoginResponse(access, refresh, WriterDto.from(writer), isNewUser);
    }

    /**
     * Google 사용자 정보를 받아 신규/기존 Writer를 결정하고 토큰을 발급한다.
     * Desktop(PKCE)과 Web(client_secret) 두 흐름 모두 동일한 후처리를 거치도록 추출.
     */
    private LoginResponse upsertWriterAndIssueTokens(GoogleUserInfo userInfo, String deviceId) {
        Optional<Writer> existing = writerRepository.findByOauthProviderAndOauthId(PROVIDER_GOOGLE, userInfo.sub());

        Writer writer;
        boolean isNewUser;
        if (existing.isPresent()) {
            writer = existing.get();
            writer.updateProfile(userInfo.name(), userInfo.picture());
            isNewUser = false;
        } else {
            writer = writerRepository.save(
                    Writer.builder()
                            .email(userInfo.email())
                            .nickname(userInfo.name())
                            .profileImageUrl(userInfo.picture())
                            .role(Role.USER)
                            .oauthProvider(PROVIDER_GOOGLE)
                            .oauthId(userInfo.sub())
                            .build()
            );
            isNewUser = true;
        }

        return issueTokens(writer, deviceId, isNewUser);
    }

    /**
     * 검증된 (writerId, deviceId)에 대해 새 AT/RT를 발급하고 Redis에 저장(회전)한다.
     * {@link #refresh}와 {@link #refreshFromCookie}의 공통 로직.
     */
    private AccessTokenResponse rotateAndIssue(UUID writerId, String deviceId) {
        Writer writer = writerRepository.findById(writerId)
                .orElseThrow(() -> new AuthException(ErrorCode.WRITER_NOT_FOUND));

        String newAccess = jwtProvider.createAccessToken(writer.getId(), writer.getEmail(), writer.getRole().name());
        String newRefresh = jwtProvider.createRefreshToken();
        refreshTokenRedisService.save(writer.getId(), deviceId, newRefresh, jwtProvider.getRefreshExpirySeconds());

        return new AccessTokenResponse(newAccess, newRefresh);
    }
}
