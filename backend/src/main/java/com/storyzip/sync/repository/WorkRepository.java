package com.storyzip.sync.repository;

import com.storyzip.sync.domain.Work;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.UUID;

public interface WorkRepository extends JpaRepository<Work, UUID> {

    @Modifying
    @Query("DELETE FROM Work w WHERE w.status = 'trashed' AND w.updatedAt < :cutoff")
    int deleteOldTrashed(@Param("cutoff") LocalDateTime cutoff);
}
