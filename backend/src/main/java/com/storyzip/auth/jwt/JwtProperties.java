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
}
