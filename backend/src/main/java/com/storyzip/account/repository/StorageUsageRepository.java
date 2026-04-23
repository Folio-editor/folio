package com.storyzip.account.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.util.UUID;

/**
 * 작가별 클라우드 저장 용량 집계 레포지토리.
 *
 * <p>동기화 대상 테이블(episode, world_note, character_note, plan_note, plot)의
 * content 컬럼 바이트 합산으로 용량을 측정한다.
 */
@Repository
public class StorageUsageRepository {

    @PersistenceContext
    private EntityManager em;

    /**
     * 해당 작가의 클라우드 저장 용량(bytes)을 계산한다.
     */
    public long getStorageUsedBytes(UUID writerId) {
        String sql = """
                SELECT COALESCE(SUM(octet_length(content)), 0)
                FROM (
                    SELECT content FROM episode WHERE writer_id = :writerId
                    UNION ALL
                    SELECT content FROM world_note WHERE writer_id = :writerId
                    UNION ALL
                    SELECT content FROM character_note WHERE writer_id = :writerId
                    UNION ALL
                    SELECT content FROM plan_note WHERE writer_id = :writerId
                    UNION ALL
                    SELECT content FROM plot WHERE writer_id = :writerId
                ) AS all_content
                """;

        Object result = em.createNativeQuery(sql)
                .setParameter("writerId", writerId)
                .getSingleResult();

        return ((Number) result).longValue();
    }

}
