package com.storyzip.ai.client;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.storyzip.ai.client.dto.EpisodePipelineRequest;
import com.storyzip.ai.client.dto.EpisodePipelineResponse;
import com.storyzip.common.exception.AiException;
import com.storyzip.payment.domain.SubscriptionStatus;
import com.storyzip.payment.repository.SubscriptionRepository;
import com.storyzip.sync.repository.WorkRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.util.UUID;

/**
 * Episode 인덱싱 + 요약 파이프라인 afterCommit 트리거 공유 컴포넌트.
 *
 * <p>호출처:
 * <ul>
 *   <li>{@code SyncService.processEpisode} — PowerSync 동기화 (작가 클라이언트 편집)</li>
 *   <li>{@code SuggestionApplier.insertEpisodeDraft / applyEpisodeUpdate} — AI 제안 승인</li>
 * </ul>
 *
 * <p>가드:
 * <ul>
 *   <li>workId null skip</li>
 *   <li>AiClient 빈 미존재 skip (test profile 대응)</li>
 *   <li>server_encrypted_dek 미발급 skip</li>
 *   <li>동일 episode 5초 디바운스 (indexing) — PUT+PATCH 연속 도착 흡수</li>
 *   <li>summary 는 status '완성' 신규 진입 + ACTIVE 구독자만</li>
 * </ul>
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class EpisodeIndexingTrigger {

    private final ObjectProvider<AiClient> aiClientProvider;
    private final ObjectProvider<SubscriptionRepository> subscriptionRepoProvider;
    private final WorkRepository workRepo;

    private Cache<UUID, Long> debounce;

    @PostConstruct
    void initDebounce() {
        debounce = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(5))
                .maximumSize(10_000)
                .build();
    }

    /**
     * Episode 본문 변경 → chunk_and_embed 파이프라인 트리거.
     * 트랜잭션 활성 시 afterCommit 등록, 아니면 즉시 호출.
     */
    public void fireIndexing(UUID episodeId, UUID workId, UUID writerId) {
        if (workId == null) {
            log.info("[AI-TRACE] pipeline=indexing skip episode={} reason=workId_null", episodeId);
            return;
        }
        AiClient aiClient = aiClientProvider.getIfAvailable();
        if (aiClient == null) {
            log.info("[AI-TRACE] pipeline=indexing skip episode={} reason=AiClient_bean_missing", episodeId);
            return;
        }
        Long last = debounce.getIfPresent(episodeId);
        long now = System.currentTimeMillis();
        if (last != null && (now - last) < 5_000) {
            log.info("[AI-TRACE] pipeline=indexing skip episode={} reason=debounce_5s", episodeId);
            return;
        }
        debounce.put(episodeId, now);

        Boolean ready = workRepo.findById(workId)
                .map(w -> w.getServerEncryptedDek() != null)
                .orElse(false);
        if (!Boolean.TRUE.equals(ready)) {
            log.info("[AI-TRACE] pipeline=indexing skip episode={} reason=server_encrypted_dek_null work={}",
                    episodeId, workId);
            return;
        }
        log.info("[AI-TRACE] pipeline=indexing trigger episode={} workId={}", episodeId, workId);

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { invokeIndexing(aiClient, episodeId, workId, writerId); }
            });
        } else {
            invokeIndexing(aiClient, episodeId, workId, writerId);
        }
    }

    /**
     * Episode status 가 '완성' 으로 신규 진입한 경우 episode_summary 트리거.
     * prevStatus='완성' 이면 skip (재진입), 비활성 구독자도 skip (R-9).
     */
    public void fireSummary(UUID episodeId, UUID workId, UUID writerId,
                            String prevStatus, String newStatus) {
        if (workId == null) {
            log.info("[AI-TRACE] pipeline=summary skip episode={} reason=workId_null", episodeId);
            return;
        }
        if (!"완성".equals(newStatus)) {
            log.info("[AI-TRACE] pipeline=summary skip episode={} reason=newStatus_not_완성 actual={}",
                    episodeId, newStatus);
            return;
        }
        if ("완성".equals(prevStatus)) {
            log.info("[AI-TRACE] pipeline=summary skip episode={} reason=already_완성", episodeId);
            return;
        }
        AiClient aiClient = aiClientProvider.getIfAvailable();
        if (aiClient == null) {
            log.info("[AI-TRACE] pipeline=summary skip episode={} reason=AiClient_bean_missing", episodeId);
            return;
        }
        SubscriptionRepository subRepo = subscriptionRepoProvider.getIfAvailable();
        if (subRepo == null) {
            log.info("[AI-TRACE] pipeline=summary skip episode={} reason=SubscriptionRepo_missing", episodeId);
            return;
        }
        boolean active = subRepo.findByWriter_IdAndStatus(writerId, SubscriptionStatus.ACTIVE).isPresent();
        if (!active) {
            log.info("[AI-TRACE] pipeline=summary skip episode={} reason=subscription_inactive writer={}",
                    episodeId, writerId);
            return;
        }
        Boolean ready = workRepo.findById(workId)
                .map(w -> w.getServerEncryptedDek() != null)
                .orElse(false);
        if (!Boolean.TRUE.equals(ready)) {
            log.info("[AI-TRACE] pipeline=summary skip episode={} reason=server_encrypted_dek_null work={}",
                    episodeId, workId);
            return;
        }
        log.info("[AI-TRACE] pipeline=summary trigger episode={} workId={}", episodeId, workId);

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { invokeSummary(aiClient, episodeId, workId, writerId); }
            });
        } else {
            invokeSummary(aiClient, episodeId, workId, writerId);
        }
    }

    private void invokeIndexing(AiClient aiClient, UUID episodeId, UUID workId, UUID writerId) {
        try {
            EpisodePipelineResponse resp = aiClient.triggerEpisodePipeline(new EpisodePipelineRequest(
                    episodeId.toString(), workId.toString(), writerId.toString(), null));
            log.info("[AI-TRACE] pipeline=indexing {} episode={} taskId={} reason={}",
                    "skipped".equals(resp.status()) ? "skipped" : "success",
                    episodeId, resp.taskId(), resp.reason());
        } catch (AiException e) {
            log.warn("[AI-TRACE] pipeline=indexing fail episode={} errType=AiException errMsg={}",
                    episodeId, e.getMessage());
        } catch (Exception e) {
            log.warn("[AI-TRACE] pipeline=indexing fail episode={} errType={} errMsg={}",
                    episodeId, e.getClass().getSimpleName(), e.getMessage());
        }
    }

    private void invokeSummary(AiClient aiClient, UUID episodeId, UUID workId, UUID writerId) {
        try {
            EpisodePipelineResponse resp = aiClient.triggerEpisodeSummary(new EpisodePipelineRequest(
                    episodeId.toString(), workId.toString(), writerId.toString(), null));
            log.info("[AI-TRACE] pipeline=summary {} episode={} taskId={} reason={}",
                    "skipped".equals(resp.status()) ? "skipped" : "success",
                    episodeId, resp.taskId(), resp.reason());
        } catch (AiException e) {
            log.warn("[AI-TRACE] pipeline=summary fail episode={} errType=AiException errMsg={}",
                    episodeId, e.getMessage());
        } catch (Exception e) {
            log.warn("[AI-TRACE] pipeline=summary fail episode={} errType={} errMsg={}",
                    episodeId, e.getClass().getSimpleName(), e.getMessage());
        }
    }
}
