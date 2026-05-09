package com.storyzip.admin.dto;

import com.storyzip.admin.AdminNoteCarrier;
import jakarta.validation.constraints.Size;

/**
 * 관리자 환불 승인/거절 요청.
 *
 * <p>{@link AdminNoteCarrier} 를 구현해 {@link com.storyzip.admin.AdminAuditAspect} 가
 * 메서드 인자에서 자동으로 adminNote 를 추출하도록 한다. Aspect 가 특정 DTO 타입에
 * 결합되지 않도록 인터페이스로 분리.
 *
 * <p>{@code adminNote}는 운영자가 입력하는 메모 — refund.admin_note + admin_audit_log.admin_note
 * 양쪽에 영구 보관. CS 응대 / 분쟁 시 증거.
 */
public record AdminRefundDecisionRequest(
        @Size(max = 500) String adminNote
) implements AdminNoteCarrier {
}
