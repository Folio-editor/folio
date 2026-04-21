package com.storyzip.sync.domain;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 기획서 하위 문서 (1:N).
 *
 * <p>{@code plan} 은 work 당 1개(메타 전용) 인 반면, PlanNote 는 work 당 여러 개의
 * 자유 제목·본문 문서를 담는다. 구조는 {@link WorldNote} 와 동일하지만 트리(parent_id) 는 없고
 * 필드명은 {@code title} 이다.
 */
@Entity
@Table(name = "plan_note")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlanNote {
    @Id
    @Column(columnDefinition = "UUID")
    private UUID id;

    @Column(name = "work_id", nullable = false, columnDefinition = "UUID")
    private UUID workId;

    @Column(name = "writer_id", nullable = false, columnDefinition = "UUID")
    private UUID writerId;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String content;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
