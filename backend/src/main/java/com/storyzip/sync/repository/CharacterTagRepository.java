package com.storyzip.sync.repository;

import com.storyzip.sync.domain.CharacterTag;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface CharacterTagRepository extends JpaRepository<CharacterTag, UUID> {
    Optional<CharacterTag> findByCharacterIdAndWorldNoteId(UUID characterId, UUID worldNoteId);
}
