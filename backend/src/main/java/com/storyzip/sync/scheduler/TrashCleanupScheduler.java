package com.storyzip.sync.scheduler;

import com.storyzip.auth.repository.WriterRepository;
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
 * <p>매일 새벽 5시(KST = UTC 20시)에 30일 이상 경과한 다음 항목을 영구 삭제한다.
 * <ul>
 *   <li>{@code status='trashed'} 인 Work / Episode</li>
 *   <li>{@code deleted_at IS NOT NULL} 인 Writer (회원 탈퇴 후 30일 경과)</li>
 * </ul>
 *
 * <p>Work / Writer 삭제 시 FK ON DELETE CASCADE 로 모든 하위 엔티티가 자동 정리된다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TrashCleanupScheduler {

    private final WorkRepository workRepository;
    private final EpisodeRepository episodeRepository;
    private final WriterRepository writerRepository;

    @Scheduled(cron = "0 0 20 * * *", zone = "UTC")
    @Transactional
    public void cleanupTrashedItems() {
        LocalDateTime cutoff = LocalDateTime.now(ZoneOffset.UTC).minusDays(30);
        log.info("Trash cleanup started: cutoff={}", cutoff);

        int episodes = episodeRepository.deleteOldTrashed(cutoff);
        int works = workRepository.deleteOldTrashed(cutoff);
        int writers = writerRepository.deleteOldWithdrawn(cutoff);

        log.info("Trash cleanup finished: works={}, episodes={}, writers={}", works, episodes, writers);
    }
}
