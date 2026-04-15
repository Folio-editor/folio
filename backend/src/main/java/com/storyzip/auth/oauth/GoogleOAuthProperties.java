package com.storyzip.auth.oauth;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Google OAuth 설정 (application.yml의 google.oauth.* 매핑).
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "google.oauth")
public class GoogleOAuthProperties {

    /** Web용 클라이언트 ID (백엔드 검증). */
    private String clientId;

    /** Web용 클라이언트 시크릿. */
    private String clientSecret;

    /** Electron Desktop용 클라이언트 ID (PKCE 방식). */
    private String desktopClientId;
}
