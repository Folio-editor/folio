package com.storyzip.common.ratelimit;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.servlet.HandlerInterceptor;

import java.nio.charset.StandardCharsets;

/**
 * 결제 API 레이트 리밋 인터셉터.
 *
 * <p>변경 액션(POST/PUT/PATCH/DELETE)만 유저당 분당 10회 제한.
 * 단순 조회(GET/HEAD)는 페이지 로딩 시 자연스럽게 누적되므로 제외 — 보호 대상은
 * 결제·해지·환불처럼 돈이 움직이는 변경 호출에 한정한다.
 */
public class PaymentRateLimitInterceptor implements HandlerInterceptor {

    private static final int MAX_REQUESTS = 10;
    private static final long WINDOW_MILLIS = 60_000;

    private final RateLimiter rateLimiter = new RateLimiter(MAX_REQUESTS, WINDOW_MILLIS);

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if (isReadOnly(request.getMethod())) {
            return true;
        }
        String key = resolveKey(request);
        if (!rateLimiter.tryConsume(key)) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getOutputStream().write(
                    "{\"code\":\"P011\",\"message\":\"결제 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.\"}".getBytes(StandardCharsets.UTF_8));
            return false;
        }
        return true;
    }

    private boolean isReadOnly(String method) {
        return "GET".equalsIgnoreCase(method) || "HEAD".equalsIgnoreCase(method);
    }

    private String resolveKey(HttpServletRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null && !"anonymousUser".equals(auth.getName())) {
            return "user:" + auth.getName();
        }
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return "ip:" + forwarded.split(",")[0].trim();
        }
        return "ip:" + request.getRemoteAddr();
    }
}
