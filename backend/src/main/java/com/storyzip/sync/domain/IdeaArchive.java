package com.storyzip.sync.domain;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "idea_archive")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IdeaArchive {
    @Id
    @Column(columnDefinition = "UUID")
    private UUID id;

    @Column(name = "work_id", nullable = false, columnDefinition = "UUID")
    private UUID workId;

    @Column(name = "writer_id", nullable = false, columnDefinition = "UUID")
    private UUID writerId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(length = 20)
    private String tag;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
