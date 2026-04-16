package com.storyzip.sync.repository;

import com.storyzip.sync.domain.WorldNote;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface WorldNoteRepository extends JpaRepository<WorldNote, UUID> {}
