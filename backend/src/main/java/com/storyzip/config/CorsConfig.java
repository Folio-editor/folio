package com.storyzip.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.ArrayList;
import java.util.List;

/**
 * CORS 설정.
 *
 * <p>기본 허용 origin:
 * <ul>
 *   <li>Vite dev servers: http://localhost:*, http://127.0.0.1:*</li>
 *   <li>Electron 렌더러: file://, app:// (패키징 앱 기본 스킴)</li>
 * </ul>
 *
 * <p>운영 웹 도메인은 {@link AppWebProperties#getAllowedOrigins()}로 외부 주입한다.
 * Credentials(쿠키·Authorization 헤더)를 허용하므로 wildcard `*` 대신
 * {@code allowedOriginPatterns}을 사용한다 — 정확한 origin 매칭만 통과.
 */
@Configuration
@RequiredArgsConstructor
public class CorsConfig {

    private final AppWebProperties webProperties;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowCredentials(true);
        List<String> patterns = new ArrayList<>(List.of(
                "http://localhost:*",
                "http://127.0.0.1:*",
                "app://*",
                "file://*"
        ));
        // prod 웹 도메인 등 환경별 origin을 추가 (예: https://app.folio.com)
        List<String> additional = webProperties.getAllowedOrigins();
        if (additional != null && !additional.isEmpty()) {
            patterns.addAll(additional);
        }
        config.setAllowedOriginPatterns(patterns);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("Authorization"));
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
