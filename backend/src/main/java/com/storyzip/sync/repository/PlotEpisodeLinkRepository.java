package com.storyzip.sync.repository;

import com.storyzip.sync.domain.PlotEpisodeLink;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface PlotEpisodeLinkRepository extends JpaRepository<PlotEpisodeLink, UUID> {}
