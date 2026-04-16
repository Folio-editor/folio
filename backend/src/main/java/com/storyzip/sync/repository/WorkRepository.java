package com.storyzip.sync.repository;

import com.storyzip.sync.domain.Work;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface WorkRepository extends JpaRepository<Work, UUID> {}
