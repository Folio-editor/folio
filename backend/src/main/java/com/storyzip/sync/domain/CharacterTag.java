package com.storyzip.sync.domain;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "character_tag")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CharacterTag {
    @Id
    @Column(columnDefinition = "UUID")
    private UUID id;

    @Column(name = "character_id", nullable = false, columnDefinition = "UUID")
    private UUID characterId;

    @Column(name = "world_note_id", nullable = false, columnDefinition = "UUID")
    private UUID worldNoteId;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
