package com.storyzip.sync.repository;

import com.storyzip.sync.domain.PlotEpisodeLink;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PlotEpisodeLinkRepository extends JpaRepository<PlotEpisodeLink, UUID> {
    Optional<PlotEpisodeLink> findByPlotId(UUID plotId);
    Optional<PlotEpisodeLink> findByEpisodeId(UUID episodeId);
}
