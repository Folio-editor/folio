package com.storyzip.sync.repository;

import com.storyzip.sync.domain.Episode;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface EpisodeRepository extends JpaRepository<Episode, UUID> {}
