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
 * <p>관리자 메모(adminNote)는 자동 추출 — 우선순위:
 * <ol>
 *   <li>{@link #adminNoteExpression()} 가 비어있지 않으면 SpEL 평가 결과 사용</li>
 *   <li>메서드 인자 중 {@link AdminNoteCarrier} 구현체를 찾아 {@code adminNote()} 호출</li>
 *   <li>없으면 NULL</li>
 * </ol>
 *
 * <p>새 admin API 의 RequestBody DTO 가 audit 메모를 보내려면 {@code AdminNoteCarrier}
 * 인터페이스만 구현하면 된다. Aspect 코드 변경 불필요.
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

    /**
     * 인자에서 adminNote 추출할 SpEL 식 (선택).
     *
     * <p>비워두면 {@link AdminNoteCarrier} 인터페이스 자동 탐색.
     *
     * <p>예시 — 첫 번째 인자의 reason 필드를 메모로:
     * <pre>{@code adminNoteExpression = "#root.args[0].reason"}</pre>
     *
     * <p>인터페이스 구현이 어려운 외부 라이브러리 DTO 또는 String 직접 인자에 사용.
     */
    String adminNoteExpression() default "";
}
