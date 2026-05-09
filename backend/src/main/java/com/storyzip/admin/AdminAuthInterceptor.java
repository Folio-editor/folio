package com.storyzip.admin;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.storyzip.common.notification.EmailNotifier;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 관리자 API 헤더 인증 인터셉터.
 *
 * <p>{@code X-Admin-Token} 헤더가 {@link AdminProperties#getToken()}과 일치해야 통과.
 * 일치 안 하면 401 반환. 토큰 미설정 시 모든 요청 차단 (fail-safe).
 *
 * <p>방어 계층:
 * <ol>
 *   <li>토큰 미설정 시 전체 401 (fail-safe)</li>
 *   <li>IP 단위 rate limit — 15분 내 인증 실패 5회 초과 시 429 차단</li>
 *   <li>인증 실패 시 운영자 이메일 알림 — 침해 의심 즉시 인지</li>
 * </ol>
 *
 * <p>Phase B 미완: Writer.role=ADMIN 기반 인증으로 강화 + 실패 알림 채널 다양화 (Discord 등).
 */
@Slf4j
@Component
public class AdminAuthInterceptor implements HandlerInterceptor {

    private static final String HEADER = "X-Admin-Token";
    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final Duration WINDOW = Duration.ofMinutes(15);
    private static final Duration ALERT_COOLDOWN = Duration.ofMinutes(5);

    private final AdminProperties adminProperties;
    private final EmailNotifier emailNotifier;

    /** IP 별 인증 실패 횟수 — 15분 sliding window. */
    private final Cache<String, AtomicInteger> failedAttempts = Caffeine.newBuilder()
            .expireAfterWrite(WINDOW)
            .maximumSize(10_000)
            .build();

    /** 알림 스팸 방지 — IP 별 최근 알림 시각 (5분 쿨다운). */
    private final Cache<String, LocalDateTime> recentAlerts = Caffeine.newBuilder()
            .expireAfterWrite(ALERT_COOLDOWN)
            .maximumSize(10_000)
            .build();

    public AdminAuthInterceptor(AdminProperties adminProperties, EmailNotifier emailNotifier) {
        this.adminProperties = adminProperties;
        this.emailNotifier = emailNotifier;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String ip = clientIp(request);
        String uri = request.getRequestURI();

        if (!adminProperties.isEnabled()) {
            log.warn("[ADMIN_AUTH] token disabled — all admin API requests rejected. uri={} ip={}", uri, ip);
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Admin API disabled");
            return false;
        }

        // Rate limit: 같은 IP 가 15분 내 5회 초과 실패하면 즉시 429.
        AtomicInteger counter = failedAttempts.get(ip, k -> new AtomicInteger(0));
        if (counter.get() > MAX_FAILED_ATTEMPTS) {
            log.warn("[ADMIN_AUTH_RATE_LIMITED] ip={} attempts={} uri={}", ip, counter.get(), uri);
            response.sendError(429, "Too many failed attempts");
            return false;
        }

        String token = request.getHeader(HEADER);
        if (!adminProperties.matches(token)) {
            int attempts = counter.incrementAndGet();
            log.warn("[ADMIN_AUTH_FAILED] uri={} ip={} hasHeader={} attempts={}",
                    uri, ip, token != null, attempts);

            // 알림: 첫 실패 + cooldown 안 걸린 경우만 발송 (스팸 방지).
            if (recentAlerts.getIfPresent(ip) == null) {
                recentAlerts.put(ip, LocalDateTime.now(ZoneOffset.UTC));
                emailNotifier.notifyOperator(
                        "[Folio 보안 경고] 관리자 API 인증 실패 — IP " + ip,
                        buildAlertBody(ip, uri, attempts, request));
            }

            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid admin token");
            return false;
        }

        // 성공 시 카운터 초기화 — 정상 운영자가 한 번 실패한 뒤 성공해도 차단 안 되도록.
        failedAttempts.invalidate(ip);
        return true;
    }

    private static String clientIp(HttpServletRequest request) {
        // nginx 가 X-Forwarded-For 를 세팅하므로 우선 사용.
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            // "client, proxy1, proxy2" — 가장 왼쪽이 원래 클라이언트.
            int comma = xff.indexOf(',');
            return (comma > 0 ? xff.substring(0, comma) : xff).trim();
        }
        return request.getRemoteAddr();
    }

    private static String buildAlertBody(String ip, String uri, int attempts, HttpServletRequest request) {
        String userAgent = request.getHeader("User-Agent");
        return """
               관리자 API 에 인증 실패 요청이 들어왔습니다. 토큰 유출 또는 침해 시도일 수 있습니다.

               IP:           %s
               URI:          %s
               누적 실패:    %d / %d (15분 window)
               User-Agent:   %s
               시각(UTC):    %s

               조치:
               - 정상 운영자라면 무시.
               - 의심스러우면 ADMIN_API_TOKEN 즉시 회전 (Doppler) + EC2 backend 재기동.
               - 같은 IP 가 5회 초과 실패하면 자동으로 429 차단됩니다.
               """.formatted(
                ip, uri, attempts, MAX_FAILED_ATTEMPTS,
                userAgent == null ? "(없음)" : userAgent,
                LocalDateTime.now(ZoneOffset.UTC));
    }
}
