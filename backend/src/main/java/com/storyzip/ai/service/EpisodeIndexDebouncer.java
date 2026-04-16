package com.storyzip.ai.service;

import com.storyzip.ai.client.AiClient;
import com.storyzip.ai.client.dto.EpisodePipelineRequest;
import com.storyzip.sync.domain.Episode;
import com.storyzip.sync.repository.EpisodeRepository;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.UUID;
import java.util.concurrent.*;

/**
 * 에피소드 저장 시 5초 디바운스 후 AI 인덱싱 파이프라인을 트리거한다.
 *
 * <p>같은 episode_id로 5초 안에 다시 호출되면 이전 타이머를 취소하고 재설정.
 * 마지막 저장 후 5초 경과 시에만 FastAPI를 호출한다.
 */
@Slf4j
@Service
public class EpisodeIndexDebouncer {

    private static final long DEBOUNCE_SECONDS = 5;

    private final AiClient aiClient;
    private final EpisodeRepository episodeRepo;
    private final ConcurrentHashMap<UUID, ScheduledFuture<?>> timers = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);

    public EpisodeIndexDebouncer(AiClient aiClient, EpisodeRepository episodeRepo) {
        this.aiClient = aiClient;
        this.episodeRepo = episodeRepo;
    }

    public void schedule(UUID episodeId, UUID workId, UUID writerId) {
        ScheduledFuture<?> prev = timers.put(episodeId, scheduler.schedule(
                () -> fire(episodeId, workId, writerId),
                DEBOUNCE_SECONDS, TimeUnit.SECONDS
        ));
        if (prev != null) {
            prev.cancel(false);
        }
    }

    private void fire(UUID episodeId, UUID workId, UUID writerId) {
        timers.remove(episodeId);
        try {
            Episode episode = episodeRepo.findById(episodeId).orElse(null);
            if (episode == null || episode.getContent() == null || episode.getContent().isBlank()) {
                log.debug("Episode {} has no content, skipping indexing", episodeId);
                return;
            }

            var request = new EpisodePipelineRequest(
                    episodeId.toString(),
                    workId.toString(),
                    writerId.toString(),
                    episode.getContent()
            );

            var response = aiClient.triggerEpisodePipeline(request);
            log.info("Episode {} indexing triggered, taskId={}", episodeId, response.taskId());
        } catch (Exception e) {
            log.warn("Failed to trigger indexing for episode {}", episodeId, e);
        }
    }

    @PreDestroy
    void shutdown() {
        scheduler.shutdownNow();
    }
}
