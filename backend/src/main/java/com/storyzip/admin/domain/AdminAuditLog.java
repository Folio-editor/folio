package com.storyzip.admin.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 관리자 API 호출 감사 로그.
 *
 * <p>모든 admin API 호출에 대해 IP / User-Agent / action / resource / result 를 기록.
 * 침해 의심 시 즉시 추적 가능.
 *
 * <p>Phase B 의 풀 audit log (resource snapshot before/after, AOP 자동 기록) 전 단계.
 * 현재는 컨트롤러에서 명시적으로 INSERT.
 *
 * <p>보존: 전자상거래법 거래 기록 5년. DB 1년 + S3 archive 4년 (Phase B).
 */
@Entity
@Table(name = "admin_audit_log", indexes = {
        @Index(name = "idx_admin_audit_action", columnList = "action"),
        @Index(name = "idx_admin_audit_resource", columnList = "resource_type, resource_id"),
        @Index(name = "idx_admin_audit_created_at", columnList = "created_at"),
        @Index(name = "idx_admin_audit_request_ip", columnList = "request_ip")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class AdminAuditLog {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "UUID")
    private UUID id;

    /** 작업 종류 — REFUND_LIST / REFUND_APPROVE / REFUND_REJECT 등. */
    @Column(nullable = false, length = 50)
    private String action;

    /** 결과 — SUCCESS / DENIED / ERROR. */
    @Column(nullable = false, length = 20)
    private String result;

    /** 대상 리소스 종류 — refund / payment / writer 등. NULL 가능 (목록 조회 등). */
    @Column(name = "resource_type", length = 30)
    private String resourceType;

    /** 대상 리소스 ID. NULL 가능. */
    @Column(name = "resource_id", columnDefinition = "UUID")
    private UUID resourceId;

    /** 운영자 메모 / 거절 사유. NULL 가능. */
    @Column(name = "admin_note", length = 500)
    private String adminNote;

    /** 요청 IP — X-Forwarded-For 우선. */
    @Column(name = "request_ip", length = 45)
    private String requestIp;

    /** User-Agent. 운영자 환경 추적용. */
    @Column(name = "user_agent", length = 500)
    private String userAgent;

    /** HTTP method + path — 디버깅용. */
    @Column(name = "request_path", length = 200)
    private String requestPath;

    /** 실패 사유 — result=ERROR/DENIED 일 때만 채움. */
    @Column(name = "error_message", length = 500)
    private String errorMessage;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private AdminAuditLog(String action, String result, String resourceType, UUID resourceId,
                          String adminNote, String requestIp, String userAgent,
                          String requestPath, String errorMessage) {
        this.action = action;
        this.result = result;
        this.resourceType = resourceType;
        this.resourceId = resourceId;
        this.adminNote = adminNote;
        this.requestIp = requestIp;
        this.userAgent = userAgent;
        this.requestPath = requestPath;
        this.errorMessage = errorMessage;
    }
}
