package com.storyzip.admin;

import com.storyzip.common.notification.EmailNotifier;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.context.expression.MethodBasedEvaluationContext;
import org.springframework.core.DefaultParameterNameDiscoverer;
import org.springframework.core.ParameterNameDiscoverer;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.expression.Expression;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
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
 * <p><b>resourceId 추출</b>: {@link AdminAudited#resourceIdParam()} 으로 지정한 메서드 파라미터에서
 * UUID 추출. 일치 없으면 NULL.
 *
 * <p><b>adminNote 추출 우선순위</b>:
 * <ol>
 *   <li>{@link AdminAudited#adminNoteExpression()} SpEL 평가 (비어있지 않을 때)</li>
 *   <li>메서드 인자 중 {@link AdminNoteCarrier} 구현체의 {@code adminNote()}</li>
 *   <li>NULL</li>
 * </ol>
 *
 * <p><b>request null 안전망</b>: 일반 컨트롤러 호출 흐름에선 {@link RequestContextHolder} 가 항상
 * 세팅되지만, 비-MVC 호출 (스케줄러/async/직접 호출) 로 진입하면 null 발생 가능. 이 경우 audit
 * 누락이 조용히 일어나면 분쟁 시 입증 실패 → ERROR 로그 + prod 환경에선 운영자 이메일 알림.
 */
@Slf4j
@Aspect
@Component
public class AdminAuditAspect {

    private static final ExpressionParser SPEL_PARSER = new SpelExpressionParser();
    private static final ParameterNameDiscoverer PARAM_NAME_DISCOVERER = new DefaultParameterNameDiscoverer();

    private final AdminAuditService auditService;
    private final EmailNotifier emailNotifier;
    private final Environment environment;

    public AdminAuditAspect(AdminAuditService auditService,
                            EmailNotifier emailNotifier,
                            Environment environment) {
        this.auditService = auditService;
        this.emailNotifier = emailNotifier;
        this.environment = environment;
    }

    @Around("@annotation(com.storyzip.admin.AdminAudited)")
    public Object audit(ProceedingJoinPoint pjp) throws Throwable {
        Method method = ((MethodSignature) pjp.getSignature()).getMethod();
        AdminAudited annotation = method.getAnnotation(AdminAudited.class);
        HttpServletRequest request = currentRequest();

        UUID resourceId = extractResourceId(pjp, method, annotation.resourceIdParam());
        String resourceType = annotation.resourceType().isBlank() ? null : annotation.resourceType();
        String adminNote = extractAdminNote(pjp, method, annotation.adminNoteExpression());

        if (request == null) {
            // 일반 컨트롤러 흐름에선 발생 불가. 발생했다면 비-MVC 호출 경로가 생긴 것
            // (스케줄러/async/테스트 직접 호출 등) — 즉시 인지 필요.
            handleMissingRequest(annotation, method, resourceId);
        }

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

    /**
     * adminNote 추출 — 우선순위:
     * 1) SpEL 식
     * 2) AdminNoteCarrier 인터페이스
     * 3) null
     */
    private static String extractAdminNote(ProceedingJoinPoint pjp, Method method, String spel) {
        // 1) SpEL 명시
        if (spel != null && !spel.isBlank()) {
            try {
                Expression expression = SPEL_PARSER.parseExpression(spel);
                MethodBasedEvaluationContext ctx = new MethodBasedEvaluationContext(
                        null, method, pjp.getArgs(), PARAM_NAME_DISCOVERER);
                Object value = expression.getValue(ctx);
                return value == null ? null : value.toString();
            } catch (Exception e) {
                log.warn("[ADMIN_AUDIT_SPEL_FAILED] expression={} method={} reason={}",
                        spel, method.getName(), e.getMessage());
                // SpEL 실패 시 인터페이스 fallback 으로 진행
            }
        }
        // 2) 인터페이스 자동 탐색
        for (Object arg : pjp.getArgs()) {
            if (arg instanceof AdminNoteCarrier carrier) {
                return carrier.adminNote();
            }
        }
        // 3) null
        return null;
    }

    private static HttpServletRequest currentRequest() {
        var attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes sra) {
            return sra.getRequest();
        }
        return null;
    }

    /** request null 발생 시 — 조용히 누락되지 않도록 ERROR 로그 + (prod 한정) 운영자 알림. */
    private void handleMissingRequest(AdminAudited annotation, Method method, UUID resourceId) {
        log.error("[ADMIN_AUDIT_NO_REQUEST] action={} method={}.{} resourceId={} — audit 기록 누락. " +
                        "비-MVC 호출 경로 (스케줄러/async/직접 호출) 가 생긴 것일 수 있음.",
                annotation.action(),
                method.getDeclaringClass().getSimpleName(),
                method.getName(),
                resourceId);

        // prod 에선 즉시 인지하도록 운영자 이메일.
        if (environment.acceptsProfiles(Profiles.of("prod"))) {
            emailNotifier.notifyOperator(
                    "[Folio 보안 경고] 관리자 audit 누락 발생",
                    """
                    관리자 API 가 비-MVC 경로로 호출되어 audit 로그가 기록되지 않았습니다.
                    스케줄러/async/직접 호출 등이 admin 메서드를 호출하지 않는지 즉시 확인 필요.

                    Action:       %s
                    Method:       %s.%s
                    Resource ID:  %s

                    조치:
                    - 호출 스택 추적 (백엔드 로그 grep "[ADMIN_AUDIT_NO_REQUEST]")
                    - 비즈니스 로직은 정상 진행되었으나 감사 기록만 누락됨
                    - 분쟁 시 백엔드 로그 / 도메인 로그로 보완 추적 필요
                    """.formatted(
                            annotation.action(),
                            method.getDeclaringClass().getSimpleName(),
                            method.getName(),
                            resourceId == null ? "(없음)" : resourceId));
        }
    }
}
