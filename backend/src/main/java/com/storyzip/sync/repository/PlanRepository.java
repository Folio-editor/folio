package com.storyzip.sync.repository;

import com.storyzip.sync.domain.Plan;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface PlanRepository extends JpaRepository<Plan, UUID> {
    /**
     * Plan은 work와 1:1 관계(work_id UNIQUE)이므로 upsert 시 id가 아닌
     * work_id 기준으로 기존 행을 찾아 업데이트해야 UNIQUE 충돌을 피할 수 있다.
     */
    Optional<Plan> findByWorkId(UUID workId);
}
