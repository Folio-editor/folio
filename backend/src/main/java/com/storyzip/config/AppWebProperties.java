package com.storyzip.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * 웹 버전 (브라우저) 호스팅 설정 (application.yml의 app.web.* 매핑).
 *
 * <p>랜딩(folio.com) → 백엔드(api.folio.com) → 에디터(app.folio.com) 3-도메인 OAuth 흐름과
 * Refresh Token httpOnly 쿠키 운영에 필요한 환경별 값.
 * Electron 흐름에는 영향 없다.
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "app.web")
public class AppWebProperties {

    /** 랜딩 URL — logout 후 redirect 대상. dev: http://localhost:5174 */
    private String landingUrl;

    /** 에디터 URL — OAuth callback 후 redirect 대상. dev: http://localhost:5173 */
    private String editorUrl;

    /** 백엔드 자기 자신 base URL (callback redirect_uri 빌드용). dev: http://localhost:8080/api/v1 */
    private String apiBaseUrl;

    /** RT 쿠키 Domain. prod: ".folio.com", dev: 빈 값 (호스트 단일) */
    private String cookieDomain;

    /** RT 쿠키 Secure 속성. prod: true, dev: false */
    private boolean cookieSecure;

    /**
     * CORS 허용 origin 목록.
     * dev: ["http://localhost:5173", "http://localhost:5174"]
     * prod: ["https://app.folio.com", "https://folio.com"]
     */
    private List<String> allowedOrigins = List.of();
}
