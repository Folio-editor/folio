package com.storyzip.sync.domain;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "character_note")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CharacterNote {
    @Id
    @Column(columnDefinition = "UUID")
    private UUID id;

    @Column(name = "character_id", nullable = false, columnDefinition = "UUID")
    private UUID characterId;

    @Column(name = "writer_id", nullable = false, columnDefinition = "UUID")
    private UUID writerId;

    @Column(nullable = false, length = 20)
    private String kind;

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
