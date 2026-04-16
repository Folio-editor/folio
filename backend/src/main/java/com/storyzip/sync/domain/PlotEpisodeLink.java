package com.storyzip.sync.domain;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "plot_episode_link")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlotEpisodeLink {
    @Id
    @Column(columnDefinition = "UUID")
    private UUID id;

    @Column(name = "plot_id", nullable = false, columnDefinition = "UUID")
    private UUID plotId;

    @Column(name = "episode_id", nullable = false, columnDefinition = "UUID")
    private UUID episodeId;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
