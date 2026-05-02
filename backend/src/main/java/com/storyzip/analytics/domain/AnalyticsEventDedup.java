package com.storyzip.analytics.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@Entity
@Table(name = "analytics_event_dedup")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class AnalyticsEventDedup {

    @Id
    @Column(name = "event_id", nullable = false, columnDefinition = "UUID")
    private UUID eventId;

    @Column(name = "writer_id", columnDefinition = "UUID")
    private UUID writerId;

    @Column(name = "client_id", length = 120)
    private String clientId;

    @Column(name = "event_name", nullable = false, length = 80)
    private String eventName;

    @CreatedDate
    @Column(name = "received_at", nullable = false, updatable = false)
    private LocalDateTime receivedAt;

    @Builder
    private AnalyticsEventDedup(UUID eventId, UUID writerId, String clientId, String eventName) {
        this.eventId = eventId;
        this.writerId = writerId;
        this.clientId = clientId;
        this.eventName = eventName;
    }
}
