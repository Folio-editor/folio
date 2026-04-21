package com.storyzip.sync.scheduler;

import com.storyzip.sync.repository.EpisodeRepository;
import com.storyzip.sync.repository.WorkRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

/**
 * 휴지통 자동 정리 배치.
 *
 * <p>매일 새벽 5시(KST = UTC 20시)에 {@code status='trashed'}이면서
 * 30일 이상 경과한 Work와 Episode를 영구 삭제한다.
 *
 * <p>Work 삭제 시 FK ON DELETE CASCADE로 하위 엔티티
 * (plan, world_note, character, plot, episode, foreshadow, idea_archive 등)가
 * 자동 정리된다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TrashCleanupScheduler {

    private final WorkRepository workRepository;
    private final EpisodeRepository episodeRepository;

    @Scheduled(cron = "0 0 20 * * *", zone = "UTC")
    @Transactional
    public void cleanupTrashedItems() {
        LocalDateTime cutoff = LocalDateTime.now(ZoneOffset.UTC).minusDays(30);
        log.info("Trash cleanup started: cutoff={}", cutoff);

        int episodes = episodeRepository.deleteOldTrashed(cutoff);
        int works = workRepository.deleteOldTrashed(cutoff);

        log.info("Trash cleanup finished: works={}, episodes={}", works, episodes);
    }
}
