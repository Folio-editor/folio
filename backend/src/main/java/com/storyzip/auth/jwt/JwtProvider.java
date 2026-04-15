package com.storyzip.auth.jwt;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Date;
import java.util.UUID;

/**
 * JWT 토큰 생성/검증 제공자.
 *
 * <p>Access Token: writerId(sub), email, role 포함. 짧은 수명.
 * <p>Refresh Token: 별도 opaque 랜덤 문자열. DB에 저장하여 관리.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtProvider {

    private static final String CLAIM_EMAIL = "email";
    private static final String CLAIM_ROLE = "role";

    private final JwtProperties properties;

    private SecretKey signingKey;

    private SecretKey key() {
        if (signingKey == null) {
            byte[] bytes = properties.getSecret().getBytes(StandardCharsets.UTF_8);
            signingKey = Keys.hmacShaKeyFor(bytes);
        }
        return signingKey;
    }

    public String createAccessToken(UUID writerId, String email, String role) {
        long now = System.currentTimeMillis();
        long expiry = now + properties.getAccessExpiry() * 1000L;

        // header.kid 먼저 설정 후 이어지는 claim 체이닝
        JwtBuilder builder = Jwts.builder();
        String keyId = properties.getKeyId();
        if (keyId != null && !keyId.isBlank()) {
            builder.header().keyId(keyId);
        }
        builder
                .subject(writerId.toString())
                .claim(CLAIM_EMAIL, email)
                .claim(CLAIM_ROLE, role)
                .issuedAt(new Date(now))
                .expiration(new Date(expiry));

        String audience = properties.getAudience();
        if (audience != null && !audience.isBlank()) {
            builder.audience().add(audience);
        }
        // HS256 명시 — Keys.hmacShaKeyFor는 바이트 길이에 따라 HS256/384/512를 자동 선택하므로
        // 검증 측(PowerSync)과 알고리즘이 항상 일치하도록 고정한다.
        return builder.signWith(key(), Jwts.SIG.HS256).compact();
    }

    /**
     * Refresh Token은 JWT가 아닌 랜덤 문자열(opaque)로 발급한다.
     * DB 조회로 유효성을 확인하기 때문에 서명 검증이 불필요.
     */
    public String createRefreshToken() {
        byte[] bytes = new byte[48];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(key())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public UUID extractWriterId(String token) {
        return UUID.fromString(parse(token).getSubject());
    }

    /**
     * 만료된 Access Token에서도 subject(writerId)를 추출한다.
     * Refresh 요청 시 만료된 Access Token에서 사용자 식별 용도로 사용.
     */
    public UUID extractWriterIdAllowExpired(String token) {
        try {
            return UUID.fromString(parse(token).getSubject());
        } catch (ExpiredJwtException e) {
            return UUID.fromString(e.getClaims().getSubject());
        }
    }

    public long getRefreshExpirySeconds() {
        return properties.getRefreshExpiry();
    }
}
