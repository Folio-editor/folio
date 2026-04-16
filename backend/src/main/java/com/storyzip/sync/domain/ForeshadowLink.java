package com.storyzip.sync.domain;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "foreshadow_link")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ForeshadowLink {
    @Id
    @Column(columnDefinition = "UUID")
    private UUID id;

    @Column(name = "foreshadow_id", nullable = false, columnDefinition = "UUID")
    private UUID foreshadowId;

    @Column(name = "link_type", nullable = false, length = 20)
    private String linkType;

    @Column(name = "episode_id", columnDefinition = "UUID")
    private UUID episodeId;

    @Column(name = "plot_id", columnDefinition = "UUID")
    private UUID plotId;

    @Column(name = "context_memo", columnDefinition = "TEXT")
    private String contextMemo;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
