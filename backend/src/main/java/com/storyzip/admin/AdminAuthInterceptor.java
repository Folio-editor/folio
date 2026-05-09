package com.storyzip.admin;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 관리자 API 헤더 인증 인터셉터.
 *
 * <p>{@code X-Admin-Token} 헤더가 {@link AdminProperties#getToken()}과 일치해야 통과.
 * 일치 안 하면 401 반환. 토큰 미설정 시 모든 요청 차단 (fail-safe).
 *
 * <p>Spring Security 의 PUBLIC_ENDPOINTS 에 {@code /api/v1/admin/**} 가 등록되어 있어
 * JWT 검증을 우회하므로, 이 인터셉터가 유일한 인증 게이트가 된다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AdminAuthInterceptor implements HandlerInterceptor {

    private static final String HEADER = "X-Admin-Token";

    private final AdminProperties adminProperties;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if (!adminProperties.isEnabled()) {
            log.warn("[ADMIN_AUTH] token disabled — all admin API requests rejected. uri={}", request.getRequestURI());
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Admin API disabled");
            return false;
        }
        String token = request.getHeader(HEADER);
        if (!adminProperties.matches(token)) {
            log.warn("[ADMIN_AUTH] invalid token. uri={} ip={} hasHeader={}",
                    request.getRequestURI(), request.getRemoteAddr(), token != null);
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid admin token");
            return false;
        }
        return true;
    }
}
