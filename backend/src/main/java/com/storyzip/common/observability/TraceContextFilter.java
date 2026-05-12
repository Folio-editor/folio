package com.storyzip.common.observability;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
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
public class TraceContextFilter extends OncePerRequestFilter {

    public static final String MDC_TRACE_ID = "traceId";
    public static final String MDC_USER_ID = "userId";
    public static final String MDC_ROLE = "role";
    public static final String MDC_METHOD = "httpMethod";
    public static final String MDC_PATH = "httpPath";
    public static final String HEADER_TRACE_ID = "X-Trace-Id";

    private static final long SLA_WARN_THRESHOLD_MS = 5_000L;

    @Override
    protected boolean shouldNotFilterAsyncDispatch() {
        // JwtAuthenticationFilter 도 async dispatch 에 재실행되도록 했음 (SseEmitter
        // 완료 시 SecurityContext 복원 필요). 그 짝으로 trace MDC 도 async dispatch 에서
        // 동일하게 세팅/정리되도록 — 안 그러면 JWT 필터가 MDC.put(USER_ID) 한 뒤 정리
        // 책임자가 없어 thread-pool 의 다른 요청으로 컨텍스트가 새어 나갈 수 있다.
        return false;
    }

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

    /**
     * 가상 스레드/Executor 등 부모 컨텍스트가 자동 상속되지 않는 곳에서 MDC를 그대로 잇기 위한 헬퍼.
     *
     * <p>현재 MDC 전체 스냅샷(traceId/userId/role/httpMethod/httpPath …)을 캡처해
     * 자식 작업 진입 시 복원하고, 종료 시 정리하는 Runnable로 감싼다.
     *
     * <p>사용 예: {@code Thread.startVirtualThread(TraceContextFilter.wrapMdc(() -> ...));}
     */
    public static Runnable wrapMdc(Runnable task) {
        java.util.Map<String, String> snapshot = org.slf4j.MDC.getCopyOfContextMap();
        return () -> {
            java.util.Map<String, String> previous = org.slf4j.MDC.getCopyOfContextMap();
            if (snapshot != null) {
                org.slf4j.MDC.setContextMap(snapshot);
            } else {
                org.slf4j.MDC.clear();
            }
            try {
                task.run();
            } finally {
                if (previous != null) {
                    org.slf4j.MDC.setContextMap(previous);
                } else {
                    org.slf4j.MDC.clear();
                }
            }
        };
    }

    /**
     * {@link #wrapMdc} + Spring Security {@link SecurityContext} 전파.
     *
     * <p>SSE 비동기 처리에서 {@code emitter.complete()} 호출 후 Spring MVC 가 비동기 응답
     * 마무리를 위한 내부 dispatch 를 발생시키는데, 이 dispatch 는 새 Tomcat 워커에서 처리되며
     * 원래 JWT 헤더는 함께 전달되지 않는다. SecurityContext 가 비어있으면 anonymous 로
     * 인지되어 {@code AuthorizationFilter} 가 {@code anyRequest().authenticated()} 룰에
     * 의해 거부 → {@code AuthorizationDeniedException} → "/error" forward 도 막혀 connection 강제 종료.
     *
     * <p>이를 막기 위해 부모 스레드의 SecurityContext 를 캡처해 가상 스레드에서 복원한다.
     * MDC 와 동일한 캡처/복원/정리 패턴.
     *
     * <p>사용 예: {@code Thread.startVirtualThread(TraceContextFilter.wrapMdcAndSecurity(() -> ...));}
     */
    public static Runnable wrapMdcAndSecurity(Runnable task) {
        java.util.Map<String, String> mdcSnapshot = org.slf4j.MDC.getCopyOfContextMap();
        SecurityContext securitySnapshot = SecurityContextHolder.getContext();
        return () -> {
            java.util.Map<String, String> previousMdc = org.slf4j.MDC.getCopyOfContextMap();
            SecurityContext previousSecurity = SecurityContextHolder.getContext();
            if (mdcSnapshot != null) {
                org.slf4j.MDC.setContextMap(mdcSnapshot);
            } else {
                org.slf4j.MDC.clear();
            }
            SecurityContextHolder.setContext(securitySnapshot);
            try {
                task.run();
            } finally {
                if (previousMdc != null) {
                    org.slf4j.MDC.setContextMap(previousMdc);
                } else {
                    org.slf4j.MDC.clear();
                }
                SecurityContextHolder.setContext(previousSecurity);
            }
        };
    }
}
