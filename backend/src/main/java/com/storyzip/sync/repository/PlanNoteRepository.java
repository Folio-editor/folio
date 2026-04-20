package com.storyzip.sync.repository;

import com.storyzip.sync.domain.PlanNote;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface PlanNoteRepository extends JpaRepository<PlanNote, UUID> {}
