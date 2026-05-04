package com.storyzip.analytics.repository;

import com.storyzip.analytics.domain.AnalyticsEventDedup;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AnalyticsEventDedupRepository extends JpaRepository<AnalyticsEventDedup, UUID> {
}
