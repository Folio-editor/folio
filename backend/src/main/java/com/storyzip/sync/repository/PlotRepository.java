package com.storyzip.sync.repository;

import com.storyzip.sync.domain.Plot;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface PlotRepository extends JpaRepository<Plot, UUID> {}
