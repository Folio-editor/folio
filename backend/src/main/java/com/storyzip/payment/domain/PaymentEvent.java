package com.storyzip.payment.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 토스 웹훅 원본 로그 — payment_event 테이블.
 *
 * <p>웹훅 재전송으로 인한 중복 처리를 막기 위해 {@code eventId}에 UNIQUE 제약.
 * 수신 시 INSERT 시도 → 성공이면 후속 처리, UNIQUE 위반이면 이미 처리한 이벤트로 간주해 무시.
 * {@code payload}에 원본을 보존해 추적·재처리에 사용.
 */
@Entity
@Table(name = "payment_event")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class PaymentEvent {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "UUID")
    private UUID id;

    @Column(name = "event_id", nullable = false, unique = true, length = 100)
    private String eventId;

    @Column(name = "event_type", nullable = false, length = 50)
    private String eventType;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private String payload;

    @CreatedDate
    @Column(name = "processed_at", nullable = false, updatable = false)
    private LocalDateTime processedAt;

    @Builder
    private PaymentEvent(String eventId, String eventType, String payload) {
        this.eventId = eventId;
        this.eventType = eventType;
        this.payload = payload;
    }
}
