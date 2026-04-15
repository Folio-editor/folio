package com.storyzip.sync.repository;

import com.storyzip.sync.domain.IdeaArchive;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface IdeaArchiveRepository extends JpaRepository<IdeaArchive, UUID> {}
