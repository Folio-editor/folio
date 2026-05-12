package com.storyzip.sync.repository;

import com.storyzip.sync.domain.Episode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface EpisodeRepository extends JpaRepository<Episode, UUID> {

    @Modifying
    @Query("DELETE FROM Episode e WHERE e.status = 'trashed' AND e.updatedAt < :cutoff")
    int deleteOldTrashed(@Param("cutoff") LocalDateTime cutoff);

    // server_encrypted_dek 발급 직후 work 의 episode 전부 백필 트리거용.
    List<Episode> findAllByWorkId(UUID workId);
}
