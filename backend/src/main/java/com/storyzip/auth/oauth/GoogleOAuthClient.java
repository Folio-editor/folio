package com.storyzip.auth.oauth;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.storyzip.common.exception.AuthException;
import com.storyzip.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.security.GeneralSecurityException;
import java.util.List;

/**
 * Google OAuth 2.0 연동 클라이언트.
 *
 * <p>Electron(PKCE) 방식:
 * <ol>
 *   <li>프론트에서 code_verifier 생성 → code_challenge로 Google 인증 요청</li>
 *   <li>Google에서 authorization code 수신</li>
 *   <li>이 클라이언트가 code + code_verifier → Google 토큰 엔드포인트에 exchange</li>
 *   <li>id_token 서명 검증 → 사용자 정보 추출</li>
 * </ol>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GoogleOAuthClient {

    private static final String GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

    private final GoogleOAuthProperties properties;
    private final RestClient restClient = RestClient.create();

    /**
     * Electron PKCE 방식 — code + code_verifier를 사용해 토큰 교환.
     * Desktop 클라이언트는 client_secret 없이 동작.
     */
    public GoogleUserInfo exchangeDesktopCode(String code, String codeVerifier, String redirectUri) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_id", properties.getDesktopClientId());
        form.add("code", code);
        form.add("code_verifier", codeVerifier);
        form.add("grant_type", "authorization_code");
        form.add("redirect_uri", redirectUri);

        // "웹 애플리케이션" 타입 Desktop 클라이언트는 client_secret 필요.
        String secret = properties.getDesktopClientSecret();
        if (secret != null && !secret.isBlank()) {
            form.add("client_secret", secret);
        }

        TokenResponse response = callTokenEndpoint(form);
        return verifyIdToken(response.idToken(), properties.getDesktopClientId());
    }

    /**
     * Web 방식 — authorization code를 사용해 토큰 교환. client_secret 필수.
     */
    public GoogleUserInfo exchangeWebCode(String code, String redirectUri) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_id", properties.getClientId());
        form.add("client_secret", properties.getClientSecret());
        form.add("code", code);
        form.add("grant_type", "authorization_code");
        form.add("redirect_uri", redirectUri);

        TokenResponse response = callTokenEndpoint(form);
        return verifyIdToken(response.idToken(), properties.getClientId());
    }

    private TokenResponse callTokenEndpoint(MultiValueMap<String, String> form) {
        try {
            TokenResponse response = restClient.post()
                    .uri(GOOGLE_TOKEN_ENDPOINT)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(TokenResponse.class);
            if (response == null || response.idToken() == null) {
                throw new AuthException(ErrorCode.OAUTH_PROVIDER_ERROR);
            }
            return response;
        } catch (Exception e) {
            log.warn("Google token exchange failed", e);
            throw new AuthException(ErrorCode.OAUTH_PROVIDER_ERROR);
        }
    }

    private GoogleUserInfo verifyIdToken(String idTokenString, String audience) {
        try {
            GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(
                    new NetHttpTransport(), GsonFactory.getDefaultInstance())
                    .setAudience(List.of(audience))
                    .build();

            GoogleIdToken idToken = verifier.verify(idTokenString);
            if (idToken == null) {
                throw new AuthException(ErrorCode.INVALID_TOKEN);
            }
            GoogleIdToken.Payload payload = idToken.getPayload();
            return new GoogleUserInfo(
                    payload.getSubject(),
                    payload.getEmail(),
                    (String) payload.get("name"),
                    (String) payload.get("picture")
            );
        } catch (GeneralSecurityException | java.io.IOException e) {
            log.warn("Google id_token verify failed", e);
            throw new AuthException(ErrorCode.INVALID_TOKEN);
        }
    }

    private record TokenResponse(
            @JsonProperty("id_token") String idToken,
            @JsonProperty("access_token") String accessToken,
            @JsonProperty("token_type") String tokenType,
            @JsonProperty("expires_in") Long expiresIn
    ) {
    }
}
