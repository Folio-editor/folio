package com.storyzip.auth.repository;

import com.storyzip.auth.domain.Writer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface WriterRepository extends JpaRepository<Writer, UUID> {

    Optional<Writer> findByOauthProviderAndOauthId(String oauthProvider, String oauthId);

    Optional<Writer> findByEmail(String email);
}
