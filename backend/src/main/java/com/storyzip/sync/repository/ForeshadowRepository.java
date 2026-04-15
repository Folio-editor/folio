package com.storyzip.sync.repository;

import com.storyzip.sync.domain.Foreshadow;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface ForeshadowRepository extends JpaRepository<Foreshadow, UUID> {}
