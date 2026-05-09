package com.storyzip.admin;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 관리자 API 메서드에 붙이면 {@link AdminAuditAspect} 가 자동으로 audit 로그를 기록한다.
 *
 * <p>성공 시 SUCCESS, 예외 시 ERROR 로 기록되며, 호출자 트랜잭션과 무관하게
 * {@link AdminAuditService} 의 REQUIRES_NEW 트랜잭션으로 보존된다.
 *
 * <p>사용 예:
 * <pre>{@code
 * @AdminAudited(action = "REFUND_APPROVE", resourceType = "refund", resourceIdParam = "refundId")
 * @PostMapping("/{refundId}/approve")
 * public ResponseEntity<RefundResponse> approve(@PathVariable UUID refundId, ...) { ... }
 * }</pre>
 *
 * <p>{@code resourceIdParam} 은 메서드 파라미터 이름과 일치해야 한다 (UUID 타입). 없거나
 * 추출 실패 시 audit 로그의 resource_id 는 NULL.
 *
 * <p>관리자 메모(adminNote)는 자동 추출:
 * <ul>
 *   <li>RequestBody 가 {@link com.storyzip.admin.dto.AdminRefundDecisionRequest} 면 그 안의 adminNote 사용</li>
 *   <li>없거나 추출 실패 시 NULL</li>
 * </ul>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface AdminAudited {

    /** Audit log 의 action 컬럼. 예: REFUND_APPROVE, REFUND_REJECT, REFUND_LIST. */
    String action();

    /** 대상 리소스 종류. 예: refund. 빈 문자열이면 NULL 로 기록. */
    String resourceType() default "";

    /** 대상 리소스 ID 가 담긴 메서드 파라미터 이름 (UUID 타입). 빈 문자열이면 NULL. */
    String resourceIdParam() default "";
}
