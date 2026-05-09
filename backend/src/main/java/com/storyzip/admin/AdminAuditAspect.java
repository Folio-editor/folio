package com.storyzip.admin;

import com.storyzip.admin.dto.AdminRefundDecisionRequest;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.lang.reflect.Method;
import java.util.UUID;

/**
 * {@link AdminAudited} 어노테이션이 붙은 메서드 호출을 가로채 audit 로그를 자동 기록.
 *
 * <p>성공 시 {@link AdminAuditService#recordSuccess}, 예외 시
 * {@link AdminAuditService#recordError}. 호출자 트랜잭션과 별개로 보존되므로 비즈니스 로직 실패도
 * 추적된다.
 *
 * <p>{@code resourceIdParam} 으로 지정한 메서드 파라미터에서 UUID 를 추출. {@code adminNote} 는
 * RequestBody {@link AdminRefundDecisionRequest} 에서 자동 추출.
 */
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class AdminAuditAspect {

    private final AdminAuditService auditService;

    @Around("@annotation(com.storyzip.admin.AdminAudited)")
    public Object audit(ProceedingJoinPoint pjp) throws Throwable {
        Method method = ((MethodSignature) pjp.getSignature()).getMethod();
        AdminAudited annotation = method.getAnnotation(AdminAudited.class);
        HttpServletRequest request = currentRequest();

        UUID resourceId = extractResourceId(pjp, method, annotation.resourceIdParam());
        String resourceType = annotation.resourceType().isBlank() ? null : annotation.resourceType();
        String adminNote = extractAdminNote(pjp.getArgs());

        try {
            Object result = pjp.proceed();
            if (request != null) {
                auditService.recordSuccess(request, annotation.action(), resourceType, resourceId, adminNote);
            }
            return result;
        } catch (Throwable t) {
            if (request != null) {
                auditService.recordError(request, annotation.action(), resourceType, resourceId, t.getMessage());
            }
            throw t;
        }
    }

    /** 메서드 파라미터 이름 매칭으로 UUID 추출. 일치 없으면 null. */
    private static UUID extractResourceId(ProceedingJoinPoint pjp, Method method, String paramName) {
        if (paramName == null || paramName.isBlank()) return null;
        String[] names = ((MethodSignature) pjp.getSignature()).getParameterNames();
        Object[] args = pjp.getArgs();
        if (names == null) return null;
        for (int i = 0; i < names.length; i++) {
            if (paramName.equals(names[i]) && args[i] instanceof UUID id) {
                return id;
            }
        }
        return null;
    }

    /** 메서드 인자 중 AdminRefundDecisionRequest 가 있으면 adminNote 추출. */
    private static String extractAdminNote(Object[] args) {
        for (Object arg : args) {
            if (arg instanceof AdminRefundDecisionRequest req) {
                return req.adminNote();
            }
        }
        return null;
    }

    private static HttpServletRequest currentRequest() {
        var attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes sra) {
            return sra.getRequest();
        }
        return null;
    }
}
