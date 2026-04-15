package com.storyzip.sync.repository;

import com.storyzip.sync.domain.Plan;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface PlanRepository extends JpaRepository<Plan, UUID> {}
