package com.storyzip.sync.repository;

import com.storyzip.sync.domain.CharacterNote;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface CharacterNoteRepository extends JpaRepository<CharacterNote, UUID> {}
