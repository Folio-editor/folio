package com.storyzip.config;

import com.storyzip.auth.jwt.JwtAuthenticationFilter;
import com.storyzip.common.observability.RequestContextFilter;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@RequiredArgsConstructor
public class SecurityConfig {

    private static final String[] PUBLIC_ENDPOINTS = {
            "/actuator/health",
            "/actuator/info",
            "/swagger-ui.html",
            "/swagger-ui/**",
            "/v3/api-docs/**",
            "/favicon.ico",
            "/api/v1/auth/login/**",
            "/api/v1/auth/refresh",
            // 웹(브라우저) OAuth 흐름 — 인증 전 호출되는 엔드포인트
            "/api/v1/auth/google/web/**",
            "/api/v1/auth/web/exchange",
            "/api/v1/auth/web/refresh",
            "/api/v1/auth/web/logout",
            "/api/v1/auth/dev/**",
            "/api/v1/payments/webhook/**",
            "/test-payment.html",
            "/test-subscription.html",
            "/payment-result.html",
            "/api/v1/payments/dev/**",
            "/api/v1/_dev/ai/**"
    };

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final RequestContextFilter requestContextFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .cors(Customizer.withDefaults())
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(PUBLIC_ENDPOINTS).permitAll()
                        .anyRequest().authenticated())
                // 인증 실패(토큰 없음/만료) 시 403이 아닌 401 반환 → 프론트 apiClient 자동 refresh 트리거
                .exceptionHandling(e -> e.authenticationEntryPoint((req, res, ex) ->
                        res.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Unauthorized")))
                // RequestContextFilter는 인증 실패 로그에도 traceId가 찍히도록 가장 먼저 실행
                .addFilterBefore(requestContextFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(jwtAuthenticationFilter, RequestContextFilter.class);

        return http.build();
    }
}
