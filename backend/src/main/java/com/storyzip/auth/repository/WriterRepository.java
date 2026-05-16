package com.storyzip.auth.repository;

import com.storyzip.auth.domain.Writer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

public interface WriterRepository extends JpaRepository<Writer, UUID> {

    Optional<Writer> findByOauthProviderAndOauthId(String oauthProvider, String oauthId);

    Optional<Writer> findByEmail(String email);

    /**
     * 탈퇴 처리(soft-delete)된 지 {@code cutoff} 시점 이전인 writer 를 영구 삭제한다.
     * 종속 데이터는 DB FK CASCADE 로 자동 정리된다 (work, episode, agent_session 등).
     *
     * @return 삭제된 row 수
     */
    @Modifying
    @Query("DELETE FROM Writer w WHERE w.deletedAt IS NOT NULL AND w.deletedAt < :cutoff")
    int deleteOldWithdrawn(@Param("cutoff") LocalDateTime cutoff);
}
