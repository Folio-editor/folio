package com.storyzip.config;

import com.storyzip.auth.jwt.JwtAuthenticationFilter;
import com.storyzip.common.observability.TraceContextFilter;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Slf4j
@Configuration
@RequiredArgsConstructor
public class SecurityConfig {

    private static final String[] PUBLIC_ENDPOINTS = {
            "/actuator/health",
            "/actuator/info",
            // Prometheus scrape 용 — 외부에는 nginx 가 /actuator/ 를 라우팅하지 않으므로
            // folio-net 내부 컨테이너(folio-prometheus)에서만 접근 가능
            "/actuator/prometheus",
            "/swagger-ui.html",
            "/swagger-ui/**",
            "/v3/api-docs/**",
            "/favicon.ico",
            "/api/v1/auth/login/**",
            "/api/v1/auth/refresh",
            // 탈퇴 계정 복구 — 인증 토큰이 폐기된 상태에서 새 PKCE 흐름으로 호출되므로 permitAll.
            "/api/v1/auth/restore",
            // 웹(브라우저) OAuth 흐름 — 인증 전 호출되는 엔드포인트
            "/api/v1/auth/google/web/**",
            "/api/v1/auth/web/exchange",
            "/api/v1/auth/web/refresh",
            "/api/v1/auth/web/logout",
            "/api/v1/auth/dev/**",
            "/api/v1/payments/webhook/**",
            "/api/v1/analytics/events",
            "/test-payment.html",
            "/test-subscription.html",
            "/payment-result.html",
            "/api/v1/payments/dev/**",
            "/api/v1/_dev/ai/**",
            // AI 서버가 X-Internal-Api-Key 헤더로 호출하는 내부 디크립트 API.
            // JWT 인증을 우회하고 InternalDecryptController 의 자체 헤더 검증으로만 통과.
            // (Spring Security 가 먼저 401 차단하면 controller 의 헤더 검증 도달 못 함)
            "/internal/**",
            // 관리자 API — JWT 우회 후 AdminAuthInterceptor 의 X-Admin-Token 헤더 검증.
            "/api/v1/admin/**",
            // AI Agent SSE 스트리밍 — Spring Security 의 ASYNC dispatch 처리가 committed
            // 응답에서 깨지는 구조적 이슈(ERR_HTTP2_PROTOCOL_ERROR) 우회.
            // JwtAuthenticationFilter 는 permitAll 과 무관하게 동작하므로 SecurityContext 는
            // 정상 채워지고, 컨트롤러의 Authentication auth 파라미터로 사용자 검증을 직접 수행.
            // emitter.complete() 후 발생하는 내부 dispatch 도 AuthorizationFilter 를 거치지
            // 않아 거부되지 않으며 응답이 깔끔하게 종료된다.
            // (docs/issues/ai-agent-sse-authorization-denied.md)
            "/api/v1/agent/threads/*/messages/stream",
            // Spring Boot 의 에러 페이지 forward 경로. SSE 비동기 응답이 끝난 직후
            // emitter.complete() 가 발생시키는 내부 dispatch 는 새 servlet 요청처럼
            // JWT 헤더 없이 필터 체인을 다시 돈다. /error 가 인증 필요로 설정되면
            // dispatch 가 AuthorizationFilter 에 막혀 응답 마무리가 깨지고 클라이언트엔
            // "network error" 로 보이므로, Spring Boot 공식 권장대로 permitAll.
            // 실제 데이터 접근 가드는 각 컨트롤러 진입 전 필터 단계에서 이미 작동하므로
            // /error 자체를 열어도 비밀 데이터 노출 위험 없음.
            // (docs/issues/ai-agent-sse-authorization-denied.md)
            "/error"
    };

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final TraceContextFilter requestContextFilter;

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
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((req, res, ex) ->
                                res.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Unauthorized"))
                        // SSE 비동기 응답 마무리 단계의 권한 거부 처리.
                        // emitter.complete() 후 Spring MVC 가 발생시키는 내부 dispatch 는
                        // 새 SecurityFilterChain 을 다시 실행하며, JWT 헤더가 없어 anonymous 로
                        // 거부됨 → AuthorizationDeniedException. 이 시점 SSE 응답은 이미
                        // committed 상태인데 기본 핸들러가 표준 에러 응답을 쓰려다 깨지면서
                        // connection 강제 종료 → 클라이언트 ERR_HTTP2_PROTOCOL_ERROR.
                        //
                        // committed 면 추가 응답 시도 없이 조용히 종료하여 SSE 본문이
                        // 정상 도달한 상태 그대로 마무리되게 한다.
                        // @RestControllerAdvice 는 필터 단계 예외를 못 잡으므로 여기서 처리.
                        // (docs/issues/ai-agent-sse-authorization-denied.md)
                        .accessDeniedHandler((req, res, ex) -> {
                            if (res.isCommitted()) {
                                log.info("[ASYNC_DISPATCH_DENIED_AFTER_COMMIT] path={} (응답이 이미 송신됨, 추가 처리 없음)",
                                        req.getRequestURI());
                                return;
                            }
                            res.sendError(HttpServletResponse.SC_FORBIDDEN, "Forbidden");
                        }))
                // TraceContextFilter는 인증 실패 로그에도 traceId가 찍히도록 가장 먼저 실행
                .addFilterBefore(requestContextFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(jwtAuthenticationFilter, TraceContextFilter.class);

        return http.build();
    }
}
