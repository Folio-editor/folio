package com.storyzip.sync.repository;

import com.storyzip.sync.domain.ForeshadowLink;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface ForeshadowLinkRepository extends JpaRepository<ForeshadowLink, UUID> {}
