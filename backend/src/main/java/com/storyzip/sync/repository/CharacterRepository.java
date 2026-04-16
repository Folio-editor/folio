package com.storyzip.sync.repository;

import com.storyzip.sync.domain.Character;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface CharacterRepository extends JpaRepository<Character, UUID> {}
