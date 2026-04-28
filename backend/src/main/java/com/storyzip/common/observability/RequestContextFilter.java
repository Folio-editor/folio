package com.storyzip.common.observability;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * 모든 HTTP 요청에 대해 다음을 수행한다.
 * <ul>
 *   <li>{@code traceId}를 생성/추출해 MDC에 주입 — logback의 JSON 인코더가 모든 로그에 자동 포함</li>
 *   <li>응답 헤더 {@code X-Trace-Id}로 노출 — 클라이언트가 에러 신고 시 동일 ID로 추적 가능</li>
 *   <li>요청 종료 시 처리 시간 측정 후 5초 초과 시 WARN (SLA 위반 감지)</li>
 * </ul>
 *
 * <p>JwtAuthenticationFilter보다 먼저 실행되어야 인증 실패 로그에도 traceId가 찍힌다.
 */
@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestContextFilter extends OncePerRequestFilter {

    public static final String MDC_TRACE_ID = "traceId";
    public static final String MDC_USER_ID = "userId";
    public static final String MDC_ROLE = "role";
    public static final String MDC_METHOD = "httpMethod";
    public static final String MDC_PATH = "httpPath";
    public static final String HEADER_TRACE_ID = "X-Trace-Id";

    private static final long SLA_WARN_THRESHOLD_MS = 5_000L;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String traceId = resolveTraceId(request);
        long startNanos = System.nanoTime();

        MDC.put(MDC_TRACE_ID, traceId);
        MDC.put(MDC_METHOD, request.getMethod());
        MDC.put(MDC_PATH, request.getRequestURI());
        response.setHeader(HEADER_TRACE_ID, traceId);

        try {
            filterChain.doFilter(request, response);
        } finally {
            long elapsedMs = (System.nanoTime() - startNanos) / 1_000_000L;
            if (elapsedMs >= SLA_WARN_THRESHOLD_MS) {
                log.warn("[SLA_VIOLATION] method={} path={} status={} elapsedMs={} threshold={}",
                        request.getMethod(), request.getRequestURI(),
                        response.getStatus(), elapsedMs, SLA_WARN_THRESHOLD_MS);
            }
            MDC.clear();
        }
    }

    private String resolveTraceId(HttpServletRequest request) {
        String inbound = request.getHeader(HEADER_TRACE_ID);
        if (inbound != null && !inbound.isBlank() && inbound.length() <= 64) {
            return inbound;
        }
        return UUID.randomUUID().toString().replace("-", "").substring(0, 16);
    }
}
