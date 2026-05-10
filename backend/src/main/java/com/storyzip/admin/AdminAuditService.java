package com.storyzip.admin;

import com.storyzip.admin.domain.AdminAuditLog;
import com.storyzip.admin.domain.AdminAuditLogRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * 관리자 API 호출 감사 로그 기록.
 *
 * <p>{@link Propagation#REQUIRES_NEW} 로 별도 트랜잭션에서 INSERT — 호출자 트랜잭션이
 * 롤백되어도 감사 로그는 보존된다 (실패한 시도도 추적 대상).
 *
 * <p>Phase B 미완: AOP 로 자동화. 현재는 컨트롤러에서 명시적 호출.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdminAuditService {

    private final AdminAuditLogRepository repository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordSuccess(HttpServletRequest request, String action,
                              String resourceType, UUID resourceId, String adminNote) {
        try {
            repository.save(AdminAuditLog.builder()
                    .action(action)
                    .result("SUCCESS")
                    .resourceType(resourceType)
                    .resourceId(resourceId)
                    .adminNote(truncate(adminNote, 500))
                    .requestIp(clientIp(request))
                    .userAgent(truncate(request.getHeader("User-Agent"), 500))
                    .requestPath(request.getMethod() + " " + request.getRequestURI())
                    .build());
        } catch (Exception e) {
            // 감사 로그 실패가 주 작업을 막지 않도록 swallow + 별도 로그.
            log.error("[ADMIN_AUDIT_SAVE_FAILED] action={} resourceId={} reason={}",
                    action, resourceId, e.getMessage(), e);
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordError(HttpServletRequest request, String action,
                            String resourceType, UUID resourceId, String errorMessage) {
        try {
            repository.save(AdminAuditLog.builder()
                    .action(action)
                    .result("ERROR")
                    .resourceType(resourceType)
                    .resourceId(resourceId)
                    .errorMessage(truncate(errorMessage, 500))
                    .requestIp(clientIp(request))
                    .userAgent(truncate(request.getHeader("User-Agent"), 500))
                    .requestPath(request.getMethod() + " " + request.getRequestURI())
                    .build());
        } catch (Exception e) {
            log.error("[ADMIN_AUDIT_SAVE_FAILED] action={} resourceId={} reason={}",
                    action, resourceId, e.getMessage(), e);
        }
    }

    private static String clientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            int comma = xff.indexOf(',');
            return (comma > 0 ? xff.substring(0, comma) : xff).trim();
        }
        return request.getRemoteAddr();
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
