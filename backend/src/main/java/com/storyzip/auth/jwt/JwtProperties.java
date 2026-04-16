package com.storyzip.auth.jwt;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * JWT 설정 (application.yml의 jwt.* 매핑).
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "jwt")
public class JwtProperties {

    /** HS256 서명 키 (최소 32바이트 권장). */
    private String secret;

    /** Access Token 유효기간 (초). */
    private long accessExpiry;

    /** Refresh Token 유효기간 (초). */
    private long refreshExpiry;

    /** Access Token의 aud 클레임 (PowerSync 검증용). 비워두면 aud 미포함. */
    private String audience;

    /**
     * JWT header의 kid. PowerSync powersync.yaml의 keystore `kid`와 정확히 일치해야 한다.
     * 불일치 시 PSYNC_S2101 (no key matched the token KID) 발생.
     */
    private String keyId;
}
