package com.storyzip.sync.repository;

import com.storyzip.sync.domain.CharacterCustomField;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface CharacterCustomFieldRepository extends JpaRepository<CharacterCustomField, UUID> {}
