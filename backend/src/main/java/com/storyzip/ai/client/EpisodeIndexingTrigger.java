package com.storyzip.ai.client;

import com.storyzip.ai.client.dto.EpisodePipelineRequest;
import com.storyzip.ai.client.dto.EpisodePipelineResponse;
import com.storyzip.common.exception.AiException;
import com.storyzip.payment.domain.SubscriptionStatus;
import com.storyzip.payment.repository.SubscriptionRepository;
import com.storyzip.sync.repository.WorkRepository;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * Episode 인덱싱 + 요약 파이프라인 trailing-edge 디바운스 트리거.
 *
 * <p>디바운스 동작 (이전 leading-edge 5초에서 변경):
 * <ul>
 *   <li>fireIndexing 호출 시 즉시 발사 X — DEBOUNCE_INDEXING 만큼 뒤로 예약</li>
 *   <li>예약 대기 중 같은 episode 에 또 호출이 들어오면 기존 예약 cancel + 재예약</li>
 *   <li>마지막 호출 이후 DEBOUNCE_INDEXING 동안 추가 호출이 없으면 그 시점에 발사</li>
 * </ul>
 *
 * <p>이렇게 하면 사용자가 30초 안에 계속 타이핑·저장해도 매번 임베딩이 안 돌고,
 * 입력이 멈춘 뒤 한 번만 임베딩이 돈다. 직전 leading-edge 방식은 첫 sync 이후
 * 5초간 후속 변경을 전부 버려서 "맨 처음 저장만 인덱싱되고 이후 수정은 영영 반영 X"
 * 결함이 있었음.
 *
 * <p>DEK 가드는 fire 시점에만 평가 — 호출 시점에 DEK 미발급이라도 30초 뒤에
 * 발급돼 있으면 정상 발사. WorkServerDekController 의 백필 trigger 도
 * 동일하게 이 큐에 들어와 30초 뒤 발사된다.
 *
 * <p>호출처:
 * <ul>
 *   <li>{@code SyncService.processEpisode} — PowerSync 동기화</li>
 *   <li>{@code SuggestionApplier.insertEpisodeDraft / applyEpisodeUpdate} — AI 제안 승인</li>
 *   <li>{@code WorkServerDekController.issue} — server_encrypted_dek 발급 직후 백필</li>
 * </ul>
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class EpisodeIndexingTrigger {

    private static final Duration DEBOUNCE_INDEXING = Duration.ofSeconds(30);
    private static final Duration DEBOUNCE_SUMMARY = Duration.ofSeconds(30);

    private final ObjectProvider<AiClient> aiClientProvider;
    private final ObjectProvider<SubscriptionRepository> subscriptionRepoProvider;
    private final WorkRepository workRepo;

    private ScheduledExecutorService scheduler;
    private final ConcurrentHashMap<UUID, ScheduledFuture<?>> pendingIndexing = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, ScheduledFuture<?>> pendingSummary = new ConcurrentHashMap<>();

    @PostConstruct
    void initScheduler() {
        // 동시 다수 episode 발사 허용 — invokeIndexing 이 AI 서버로 HTTP 호출(블로킹)
        // 후 응답까지 기다리므로 thread pool 필요. 4개로 시작 (운영 부하 보면서 조정).
        scheduler = Executors.newScheduledThreadPool(4, r -> {
            Thread t = new Thread(r, "episode-trigger-debounce");
            t.setDaemon(true);
            return t;
        });
    }

    @PreDestroy
    void shutdownScheduler() {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
    }

    /**
     * Episode 본문 변경 → chunk_and_embed 파이프라인 trailing-edge 디바운스 예약.
     * 트랜잭션 활성 시 afterCommit 에 예약, 아니면 즉시 예약.
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

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() {
                    scheduleIndexing(aiClient, episodeId, workId, writerId);
                }
            });
        } else {
            scheduleIndexing(aiClient, episodeId, workId, writerId);
        }
    }

    private void scheduleIndexing(AiClient aiClient, UUID episodeId, UUID workId, UUID writerId) {
        pendingIndexing.compute(episodeId, (k, existing) -> {
            if (existing != null) {
                existing.cancel(false);   // 실행 중이면 false 반환 — 그 fire 는 그대로 완료
            }
            return scheduler.schedule(
                    () -> runIndexing(aiClient, episodeId, workId, writerId),
                    DEBOUNCE_INDEXING.toMillis(),
                    TimeUnit.MILLISECONDS
            );
        });
        log.info("[AI-TRACE] pipeline=indexing scheduled episode={} workId={} debounce={}s",
                episodeId, workId, DEBOUNCE_INDEXING.getSeconds());
    }

    private void runIndexing(AiClient aiClient, UUID episodeId, UUID workId, UUID writerId) {
        pendingIndexing.remove(episodeId);

        Boolean ready = workRepo.findById(workId)
                .map(w -> w.getServerEncryptedDek() != null)
                .orElse(false);
        if (!Boolean.TRUE.equals(ready)) {
            // 30초 뒤에도 DEK 미발급이면 skip. WorkServerDekController 의 발급 후 백필이
            // 새 trigger 를 큐에 넣어줄 것이므로 여기선 자체 reschedule 하지 않는다.
            log.info("[AI-TRACE] pipeline=indexing skip episode={} reason=server_encrypted_dek_null work={}",
                    episodeId, workId);
            return;
        }
        log.info("[AI-TRACE] pipeline=indexing fire episode={} workId={}", episodeId, workId);
        invokeIndexing(aiClient, episodeId, workId, writerId);
    }

    /**
     * Episode status='완성' 일 때 episode_summary trailing-edge 디바운스 예약.
     *
     * <p>발사 조건:
     * <ul>
     *   <li>newStatus == '완성' 필수</li>
     *   <li>그리고 (prevStatus != '완성' [신규 진입]) OR (contentChanged [완성 상태 polishing])</li>
     * </ul>
     *
     * <p>AI 측 {@code _should_skip_summary} 에 content_hash 비교 + 30분 cooldown + 일 3회 limit
     * 가드가 있으므로 폭주는 거기서 2차 차단. 백엔드는 1차로 명백한 no-op (status 미진입,
     * 또는 완성 유지 + 본문 미변경) 만 거른다.
     */
    public void fireSummary(UUID episodeId, UUID workId, UUID writerId,
                            String prevStatus, String newStatus, boolean contentChanged) {
        if (workId == null) {
            log.info("[AI-TRACE] pipeline=summary skip episode={} reason=workId_null", episodeId);
            return;
        }
        if (!"완성".equals(newStatus)) {
            log.info("[AI-TRACE] pipeline=summary skip episode={} reason=newStatus_not_완성 actual={}",
                    episodeId, newStatus);
            return;
        }
        boolean newlyCompleted = !"완성".equals(prevStatus);
        if (!newlyCompleted && !contentChanged) {
            // 이미 완성 상태이고 본문 변경도 없음 — sort_order/title 등 메타만 갱신된 sync.
            log.info("[AI-TRACE] pipeline=summary skip episode={} reason=already_완성_no_content_change",
                    episodeId);
            return;
        }
        AiClient aiClient = aiClientProvider.getIfAvailable();
        if (aiClient == null) {
            log.info("[AI-TRACE] pipeline=summary skip episode={} reason=AiClient_bean_missing", episodeId);
            return;
        }

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() {
                    scheduleSummary(aiClient, episodeId, workId, writerId);
                }
            });
        } else {
            scheduleSummary(aiClient, episodeId, workId, writerId);
        }
    }

    private void scheduleSummary(AiClient aiClient, UUID episodeId, UUID workId, UUID writerId) {
        pendingSummary.compute(episodeId, (k, existing) -> {
            if (existing != null) {
                existing.cancel(false);
            }
            return scheduler.schedule(
                    () -> runSummary(aiClient, episodeId, workId, writerId),
                    DEBOUNCE_SUMMARY.toMillis(),
                    TimeUnit.MILLISECONDS
            );
        });
        log.info("[AI-TRACE] pipeline=summary scheduled episode={} workId={} debounce={}s",
                episodeId, workId, DEBOUNCE_SUMMARY.getSeconds());
    }

    private void runSummary(AiClient aiClient, UUID episodeId, UUID workId, UUID writerId) {
        pendingSummary.remove(episodeId);

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
        log.info("[AI-TRACE] pipeline=summary fire episode={} workId={}", episodeId, workId);
        invokeSummary(aiClient, episodeId, workId, writerId);
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
