package com.storyzip.admin.dto;

import jakarta.validation.constraints.Size;

/**
 * 관리자 환불 승인/거절 요청.
 *
 * <p>{@code adminNote}는 운영자가 입력하는 메모 — refund.admin_note 컬럼에 영구 보관.
 * CS 응대 / 분쟁 시 증거.
 */
public record AdminRefundDecisionRequest(
        @Size(max = 500) String adminNote
) {
}
