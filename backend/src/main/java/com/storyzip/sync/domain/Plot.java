package com.storyzip.sync.domain;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "plot")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Plot {
    @Id
    @Column(columnDefinition = "UUID")
    private UUID id;

    @Column(name = "work_id", nullable = false, columnDefinition = "UUID")
    private UUID workId;

    @Column(name = "writer_id", nullable = false, columnDefinition = "UUID")
    private UUID writerId;

    @Column(name = "parent_id", columnDefinition = "UUID")
    private UUID parentId;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 20)
    private String status;

    @Column(columnDefinition = "TEXT")
    private String content;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
