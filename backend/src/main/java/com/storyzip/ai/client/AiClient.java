package com.storyzip.ai.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.storyzip.ai.client.dto.AgentCreateThreadRequest;
import com.storyzip.ai.client.dto.AgentMessageRequest;
import com.storyzip.ai.client.dto.AgentRunResponse;
import com.storyzip.ai.client.dto.AgentTaskResponse;
import com.storyzip.ai.client.dto.AgentThreadResponse;
import com.storyzip.ai.client.dto.DraftRequest;
import com.storyzip.ai.client.dto.EpisodePipelineRequest;
import com.storyzip.ai.client.dto.EpisodePipelineResponse;
import com.storyzip.ai.client.dto.HealthResponse;
import com.storyzip.ai.client.dto.PingEnqueuedResponse;
import com.storyzip.ai.client.dto.PingResultResponse;
import com.storyzip.ai.client.dto.QuickSpellcheckRequest;
import com.storyzip.ai.client.dto.QuickSummarizeRequest;
import com.storyzip.ai.client.dto.ReviewRequest;
import com.storyzip.ai.client.dto.SpellcheckRequest;
import com.storyzip.common.exception.AiException;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.observability.ExternalCallLogger;
import com.storyzip.common.observability.TraceContextFilter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/**
 * FastAPI AI 서버 호출용 얇은 클라이언트.
 *
 * <p>현재는 Phase 1 스모크용(health / _dev_ping)만 노출. Phase 2 이후
 * /v1/pipelines/episode, /v1/drafts, /v1/reviews 메서드가 추가된다.
 */
@Slf4j
@Component
public class AiClient {

    private static final String INTERNAL_API_KEY_HEADER = "X-Internal-Api-Key";

    /** AI 호출 SLA — health/ping은 짧고, pipeline 트리거(큐에 적재만)도 짧다. */
    private static final long AI_QUICK_SLA_MS = 2_000L;
    /** 리뷰는 LLM 한 번 호출이라 길다. 30초 넘으면 사용자 경험 망가지므로 WARN. */
    private static final long AI_REVIEW_SLA_MS = 30_000L;
    private static final long AI_SPELLCHECK_SLA_MS = 20_000L;
    /** 회차 요약은 본문 길이에 따라 변동 — Haiku 1회 + DB UPSERT 한 번. */
    private static final long AI_SUMMARIZE_SLA_MS = 30_000L;
    /** 초안 SSE 스트림 전체 — 5분이 한계 (timeout 설정과 동일). */
    private static final long AI_DRAFT_STREAM_SLA_MS = 60_000L;

    private final AiClientProperties properties;
    private final RestClient restClient;

    public AiClient(AiClientProperties properties) {
        this.properties = properties;
        HttpClient httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(properties.getConnectTimeout())
                .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(properties.getReadTimeout());
        this.restClient = RestClient.builder()
                .baseUrl(properties.getBaseUrl())
                .requestFactory(requestFactory)
                .build();
    }

    /** 공개 엔드포인트 — FastAPI 연결성 확인. */
    public HealthResponse health() {
        return ExternalCallLogger.measure(ExternalCallLogger.SYSTEM_AI, "health", AI_QUICK_SLA_MS, () -> {
            try {
                HealthResponse body = restClient.get()
                        .uri("/v1/health")
                        .retrieve()
                        .body(HealthResponse.class);
                if (body == null) {
                    throw new AiException(ErrorCode.AI_RESPONSE_INVALID);
                }
                return body;
            } catch (ResourceAccessException e) {
                throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
            } catch (RestClientResponseException e) {
                throw new AiException(ErrorCode.AI_RESPONSE_INVALID, e);
            }
        });
    }

    /** 회차 인덱싱 파이프라인 트리거 (청킹 + 임베딩). */
    public EpisodePipelineResponse triggerEpisodePipeline(EpisodePipelineRequest request) {
        return invokeAiPipeline("triggerEpisodePipeline", "/v1/pipelines/episode", request);
    }

    /**
     * AI 파이프라인 공용 호출 헬퍼 (Phase 2 R-B 통일).
     *
     * <p>응답 검증 규칙:
     *  - body == null → invalid
     *  - status="skipped" → 정상 (task_id 없음 허용)
     *  - status="accepted" + task_id == null → invalid (이쪽만 옛 버그였음)
     */
    private EpisodePipelineResponse invokeAiPipeline(String op, String uri, EpisodePipelineRequest request) {
        return ExternalCallLogger.measure(
                ExternalCallLogger.SYSTEM_AI, op, AI_QUICK_SLA_MS, () -> {
            try {
                EpisodePipelineResponse body = restClient.post()
                        .uri(uri)
                        .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(request)
                        .retrieve()
                        .body(EpisodePipelineResponse.class);
                if (body == null) {
                    throw new AiException(ErrorCode.AI_RESPONSE_INVALID);
                }
                if ("accepted".equals(body.status()) && body.taskId() == null) {
                    throw new AiException(ErrorCode.AI_RESPONSE_INVALID);
                }
                return body;
            } catch (ResourceAccessException e) {
                throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
            } catch (RestClientResponseException e) {
                throw new AiException(ErrorCode.AI_RESPONSE_INVALID, e);
            }
        });
    }

    /** 회차 요약 파이프라인 트리거 (Haiku, 프리미엄 전용). */
    public EpisodePipelineResponse triggerEpisodeSummary(EpisodePipelineRequest request) {
        return invokeAiPipeline("triggerEpisodeSummary", "/v1/pipelines/episode-summary", request);
    }

    // ─────────── Phase 4: Agent 서비스 ───────────

    private static final long AI_AGENT_SLA_MS = 60_000L;     // sync agent qa/ideation 한도

    public AgentThreadResponse createAgentThread(AgentCreateThreadRequest request) {
        return ExternalCallLogger.measure(
                ExternalCallLogger.SYSTEM_AI, "createAgentThread", AI_QUICK_SLA_MS, () -> {
            try {
                AgentThreadResponse body = restClient.post()
                        .uri("/v1/agent/threads")
                        .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(request)
                        .retrieve()
                        .body(AgentThreadResponse.class);
                if (body == null || body.threadId() == null) {
                    throw new AiException(ErrorCode.AI_RESPONSE_INVALID);
                }
                return body;
            } catch (ResourceAccessException e) {
                throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
            } catch (RestClientResponseException e) {
                throw new AiException(ErrorCode.AI_RESPONSE_INVALID, e);
            }
        });
    }

    public AgentRunResponse sendAgentMessage(String threadId, AgentMessageRequest request) {
        return ExternalCallLogger.measure(
                ExternalCallLogger.SYSTEM_AI, "sendAgentMessage", AI_AGENT_SLA_MS, () -> {
            try {
                AgentRunResponse body = restClient.post()
                        .uri("/v1/agent/threads/{tid}/messages", threadId)
                        .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(request)
                        .retrieve()
                        .body(AgentRunResponse.class);
                if (body == null) {
                    throw new AiException(ErrorCode.AI_RESPONSE_INVALID);
                }
                return body;
            } catch (ResourceAccessException e) {
                throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
            } catch (RestClientResponseException e) {
                throw new AiException(ErrorCode.AI_RESPONSE_INVALID, e);
            }
        });
    }

    public AgentTaskResponse sendAgentMessageAsync(String threadId, AgentMessageRequest request) {
        return ExternalCallLogger.measure(
                ExternalCallLogger.SYSTEM_AI, "sendAgentMessageAsync", AI_QUICK_SLA_MS, () -> {
            try {
                AgentTaskResponse body = restClient.post()
                        .uri("/v1/agent/threads/{tid}/messages/async", threadId)
                        .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(request)
                        .retrieve()
                        .body(AgentTaskResponse.class);
                if (body == null || body.taskId() == null) {
                    throw new AiException(ErrorCode.AI_RESPONSE_INVALID);
                }
                return body;
            } catch (ResourceAccessException e) {
                throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
            } catch (RestClientResponseException e) {
                throw new AiException(ErrorCode.AI_RESPONSE_INVALID, e);
            }
        });
    }

    public Map<String, Object> getAgentThread(String threadId) {
        return ExternalCallLogger.measure(
                ExternalCallLogger.SYSTEM_AI, "getAgentThread", AI_QUICK_SLA_MS, () -> {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> body = restClient.get()
                        .uri("/v1/agent/threads/{tid}", threadId)
                        .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                        .retrieve()
                        .body(Map.class);
                if (body == null) {
                    throw new AiException(ErrorCode.AI_RESPONSE_INVALID);
                }
                return body;
            } catch (ResourceAccessException e) {
                throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
            } catch (RestClientResponseException e) {
                throw new AiException(ErrorCode.AI_RESPONSE_INVALID, e);
            }
        });
    }

    /** 대화 수동 압축 — Haiku 1회 호출로 첫 절반을 요약. */
    public Map<String, Object> compressAgentThread(String threadId) {
        return ExternalCallLogger.measure(
                ExternalCallLogger.SYSTEM_AI, "compressAgentThread", AI_QUICK_SLA_MS, () -> {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> body = restClient.post()
                        .uri("/v1/agent/threads/{tid}/compress", threadId)
                        .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                        .retrieve()
                        .body(Map.class);
                if (body == null) {
                    throw new AiException(ErrorCode.AI_RESPONSE_INVALID);
                }
                return body;
            } catch (ResourceAccessException e) {
                throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
            } catch (RestClientResponseException e) {
                throw new AiException(ErrorCode.AI_RESPONSE_INVALID, e);
            }
        });
    }

    /** Agent 대화 세션 삭제 — writer_id 를 query 로 전달해 AI 서버에서 소유자 검증. */
    public void deleteAgentThread(String threadId, String writerId) {
        ExternalCallLogger.measure(
                ExternalCallLogger.SYSTEM_AI, "deleteAgentThread", AI_QUICK_SLA_MS, () -> {
            try {
                restClient.delete()
                        .uri(uriBuilder -> uriBuilder
                                .path("/v1/agent/threads/{tid}")
                                .queryParam("writer_id", writerId)
                                .build(threadId))
                        .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                        .retrieve()
                        .toBodilessEntity();
                return null;
            } catch (ResourceAccessException e) {
                throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
            } catch (RestClientResponseException e) {
                throw new AiException(ErrorCode.AI_RESPONSE_INVALID, e);
            }
        });
    }

    /**
     * Agent SSE 스트리밍 — AI 서버 /v1/agent/threads/{tid}/messages/stream 프록시.
     * step / done / error 이벤트를 그대로 SseEmitter 로 전달.
     */
    public void streamAgentMessage(
            String threadId,
            AgentMessageRequest body,
            SseEmitter emitter
    ) {
        Thread.startVirtualThread(TraceContextFilter.wrapMdc(() -> {
            ObjectMapper mapper = new ObjectMapper();
            long startNanos = System.nanoTime();
            try {
                String jsonBody = mapper.writeValueAsString(body);
                HttpRequest httpReq = HttpRequest.newBuilder()
                        .uri(URI.create(properties.getBaseUrl()
                                + "/v1/agent/threads/" + threadId + "/messages/stream"))
                        .header("Content-Type", "application/json")
                        .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                        .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                        .timeout(Duration.ofMinutes(10))
                        .build();
                HttpClient sseClient = HttpClient.newBuilder()
                        .version(HttpClient.Version.HTTP_1_1)
                        .connectTimeout(properties.getConnectTimeout())
                        .build();
                log.info("[EXT_START] system=ai op=streamAgentMessage thread={}", threadId);
                HttpResponse<java.io.InputStream> resp = sseClient.send(
                        httpReq, HttpResponse.BodyHandlers.ofInputStream()
                );
                if (resp.statusCode() != 200) {
                    long el = (System.nanoTime() - startNanos) / 1_000_000L;
                    log.warn("[EXT_FAIL] op=streamAgentMessage elapsedMs={} status={}",
                            el, resp.statusCode());
                    emitter.completeWithError(new AiException(ErrorCode.AI_RESPONSE_INVALID));
                    return;
                }
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(resp.body(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (line.startsWith("data: ")) {
                            String data = line.substring(6);
                            try {
                                emitter.send(SseEmitter.event().data(data,
                                        org.springframework.http.MediaType.APPLICATION_JSON));
                            } catch (Exception sendErr) {
                                log.debug("agent SSE downstream disconnected; drain upstream");
                            }
                        }
                    }
                }
                long el = (System.nanoTime() - startNanos) / 1_000_000L;
                log.info("[EXT_OK] op=streamAgentMessage elapsedMs={} status=ok", el);
                try { emitter.complete(); } catch (Exception ignored) {}
            } catch (Exception e) {
                long el = (System.nanoTime() - startNanos) / 1_000_000L;
                log.warn("[EXT_FAIL] op=streamAgentMessage elapsedMs={} errType={} errMsg={}",
                        el, e.getClass().getSimpleName(), e.getMessage(), e);
                emitter.completeWithError(e);
            }
        }));
    }

    public Map<String, Object> getAgentTaskStatus(String taskId) {
        return ExternalCallLogger.measure(
                ExternalCallLogger.SYSTEM_AI, "getAgentTaskStatus", AI_QUICK_SLA_MS, () -> {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> body = restClient.get()
                        .uri("/v1/agent/tasks/{tid}/status", taskId)
                        .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                        .retrieve()
                        .body(Map.class);
                return body == null ? Map.of() : body;
            } catch (ResourceAccessException e) {
                throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
            } catch (RestClientResponseException e) {
                throw new AiException(ErrorCode.AI_RESPONSE_INVALID, e);
            }
        });
    }

    @SuppressWarnings("unchecked")
    public java.util.List<Map<String, Object>> listAgentThreads(String workId, String writerId) {
        return ExternalCallLogger.measure(
                ExternalCallLogger.SYSTEM_AI, "listAgentThreads", AI_QUICK_SLA_MS, () -> {
            try {
                java.util.List<Map<String, Object>> body = restClient.get()
                        .uri(uriBuilder -> uriBuilder.path("/v1/agent/threads")
                                .queryParam("work_id", workId)
                                .queryParam("writer_id", writerId)
                                .build())
                        .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                        .retrieve()
                        .body(java.util.List.class);
                return body == null ? java.util.List.of() : body;
            } catch (ResourceAccessException e) {
                throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
            } catch (RestClientResponseException e) {
                throw new AiException(ErrorCode.AI_RESPONSE_INVALID, e);
            }
        });
    }

    /** Celery 태스크 적재 — dev 스모크 전용. */
    public PingEnqueuedResponse enqueuePing(String msg) {
        return ExternalCallLogger.measure(
                ExternalCallLogger.SYSTEM_AI, "enqueuePing", AI_QUICK_SLA_MS, () -> {
            try {
                PingEnqueuedResponse body = restClient.post()
                        .uri("/v1/_dev/ping")
                        .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("msg", msg))
                        .retrieve()
                        .body(PingEnqueuedResponse.class);
                if (body == null || body.taskId() == null) {
                    throw new AiException(ErrorCode.AI_RESPONSE_INVALID);
                }
                return body;
            } catch (ResourceAccessException e) {
                throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
            } catch (RestClientResponseException e) {
                throw new AiException(ErrorCode.AI_RESPONSE_INVALID, e);
            }
        });
    }

    /**
     * SSE 스트리밍으로 초안 생성 — FastAPI /v1/drafts 프록시.
     * 별도 스레드에서 SseEmitter로 이벤트를 전달한다.
     *
     * <p>스트림 종료 시 마지막 {@code done} 이벤트의 {@code usage}를 추출해
     * {@code onDone} 콜백으로 넘긴다 (크레딧 차감 트리거). usage가 없거나
     * 파싱 실패 시 빈 Map으로 호출된다.
     */
    public void streamDraft(DraftRequest request, SseEmitter emitter,
                            java.util.function.Consumer<Map<String, Object>> onDone) {
        // 가상 스레드는 부모 MDC를 자동 상속하지 않으므로 wrapMdc로 전체 컨텍스트
        // (traceId/userId/role/httpMethod/httpPath …)를 캡처해 자식에서 복원·정리한다.
        Thread.startVirtualThread(TraceContextFilter.wrapMdc(() -> {
            ObjectMapper mapper = new ObjectMapper();
            Map<String, Object> lastDoneUsage = new java.util.HashMap<>();
            long startNanos = System.nanoTime();
            try {
                String jsonBody = mapper.writeValueAsString(request);

                HttpRequest httpReq = HttpRequest.newBuilder()
                        .uri(URI.create(properties.getBaseUrl() + "/v1/drafts"))
                        .header("Content-Type", "application/json")
                        .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                        .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                        .timeout(Duration.ofMinutes(5))
                        .build();

                HttpClient sseClient = HttpClient.newBuilder()
                        .version(HttpClient.Version.HTTP_1_1)
                        .connectTimeout(properties.getConnectTimeout())
                        .build();

                log.info("[EXT_START] system=ai op=streamDraft");

                HttpResponse<java.io.InputStream> response = sseClient.send(
                        httpReq, HttpResponse.BodyHandlers.ofInputStream()
                );

                if (response.statusCode() != 200) {
                    long elapsed = (System.nanoTime() - startNanos) / 1_000_000L;
                    log.warn("[EXT_FAIL] system=ai op=streamDraft elapsedMs={} status={}",
                            elapsed, response.statusCode());
                    emitter.completeWithError(new AiException(ErrorCode.AI_RESPONSE_INVALID));
                    return;
                }

                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (line.startsWith("data: ")) {
                            String data = line.substring(6);
                            // done 이벤트의 usage를 캡처. type이 done이 아니거나 파싱 실패면 무시.
                            try {
                                @SuppressWarnings("unchecked")
                                Map<String, Object> parsed = mapper.readValue(data, Map.class);
                                if ("done".equals(parsed.get("type"))) {
                                    Object usage = parsed.get("usage");
                                    log.info("Draft done event received: usage={}", usage);
                                    if (usage instanceof Map<?, ?> usageMap) {
                                        lastDoneUsage.clear();
                                        usageMap.forEach((k, v) -> lastDoneUsage.put(String.valueOf(k), v));
                                    }
                                }
                            } catch (Exception ignored) {
                                // chunk 이벤트 등은 그대로 전달만 함
                            }
                            try {
                                emitter.send(SseEmitter.event().data(data, org.springframework.http.MediaType.APPLICATION_JSON));
                            } catch (Exception sendErr) {
                                // 다운스트림(프론트) 끊김 — 업스트림은 끝까지 읽어 usage 캡처를 보장한다.
                                log.debug("Downstream emitter send failed (client likely disconnected); continuing to drain upstream");
                            }
                        }
                    }
                }
                long elapsed = (System.nanoTime() - startNanos) / 1_000_000L;
                if (elapsed >= AI_DRAFT_STREAM_SLA_MS) {
                    log.warn("[EXT_SLOW] system=ai op=streamDraft elapsedMs={} sla={} status=ok",
                            elapsed, AI_DRAFT_STREAM_SLA_MS);
                } else {
                    log.info("[EXT_OK] system=ai op=streamDraft elapsedMs={} status=ok lastDoneUsage={}",
                            elapsed, lastDoneUsage);
                }
                try { emitter.complete(); } catch (Exception ignored) { /* 이미 완료됨 */ }
            } catch (Exception e) {
                long elapsed = (System.nanoTime() - startNanos) / 1_000_000L;
                log.warn("[EXT_FAIL] system=ai op=streamDraft elapsedMs={} errType={} errMsg={}",
                        elapsed, e.getClass().getSimpleName(), e.getMessage(), e);
                emitter.completeWithError(e);
            } finally {
                if (onDone != null) {
                    try {
                        onDone.accept(lastDoneUsage);
                    } catch (Exception e) {
                        log.warn("Draft onDone callback failed", e);
                    }
                }
                // MDC 정리는 wrapMdc 헬퍼 finally에서 처리됨
            }
        }));
    }

    /** 원고 검수 — FastAPI /v1/reviews 프록시 (동기 JSON). */
    @SuppressWarnings("unchecked")
    public Map<String, Object> requestReview(ReviewRequest request) {
        try {
            return ExternalCallLogger.measureChecked(
                    ExternalCallLogger.SYSTEM_AI, "requestReview", AI_REVIEW_SLA_MS, () -> {
                ObjectMapper mapper = new ObjectMapper();
                String jsonBody = mapper.writeValueAsString(request);

                HttpRequest httpReq = HttpRequest.newBuilder()
                        .uri(URI.create(properties.getBaseUrl() + "/v1/reviews"))
                        .header("Content-Type", "application/json")
                        .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                        .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                        .timeout(Duration.ofMinutes(3))
                        .build();

                HttpClient reviewClient = HttpClient.newBuilder()
                        .version(HttpClient.Version.HTTP_1_1)
                        .connectTimeout(properties.getConnectTimeout())
                        .build();

                HttpResponse<String> response = reviewClient.send(
                        httpReq, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
                );

                if (response.statusCode() != 200) {
                    String body = response.body();
                    int bodyLen = body == null ? 0 : body.length();
                    // Plan C 옵션 1 — AI 서버가 에러 응답에 RAG context(평문 원고)를 echo할 가능성이 있어
                    // body preview는 절대 로깅하지 않는다. status + length만 남긴다.
                    log.warn("AI review non-200: status={} bodyLen={}",
                            response.statusCode(), bodyLen);
                    throw new AiException(ErrorCode.AI_RESPONSE_INVALID);
                }

                return mapper.readValue(response.body(), Map.class);
            });
        } catch (AiException e) {
            throw e;
        } catch (java.io.IOException e) {
            throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AiException(ErrorCode.AI_REQUEST_TIMEOUT, e);
        } catch (Exception e) {
            // measureChecked의 시그니처가 throws Exception이라 강제로 잡힘 — AiException으로 통일
            throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
        }
    }

    /** 맞춤법 검사 FastAPI /v1/spellcheck 프록시(동기 JSON). */
    @SuppressWarnings("unchecked")
    public Map<String, Object> requestSpellcheck(SpellcheckRequest request) {
        try {
            return ExternalCallLogger.measureChecked(
                    ExternalCallLogger.SYSTEM_AI, "requestSpellcheck", AI_SPELLCHECK_SLA_MS, () -> {
                ObjectMapper mapper = new ObjectMapper();
                String jsonBody = mapper.writeValueAsString(request);

                HttpRequest httpReq = HttpRequest.newBuilder()
                        .uri(URI.create(properties.getBaseUrl() + "/v1/spellcheck"))
                        .header("Content-Type", "application/json")
                        .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                        .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                        .timeout(Duration.ofMinutes(2))
                        .build();

                HttpClient spellcheckClient = HttpClient.newBuilder()
                        .version(HttpClient.Version.HTTP_1_1)
                        .connectTimeout(properties.getConnectTimeout())
                        .build();

                HttpResponse<String> response = spellcheckClient.send(
                        httpReq, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
                );

                if (response.statusCode() != 200) {
                    String body = response.body();
                    int bodyLen = body == null ? 0 : body.length();
                    log.warn("AI spellcheck non-200: status={} bodyLen={}",
                            response.statusCode(), bodyLen);
                    throw new AiException(ErrorCode.AI_RESPONSE_INVALID);
                }

                return mapper.readValue(response.body(), Map.class);
            });
        } catch (AiException e) {
            throw e;
        } catch (java.io.IOException e) {
            throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AiException(ErrorCode.AI_REQUEST_TIMEOUT, e);
        } catch (Exception e) {
            throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
        }
    }

    /** 맞춤법 검사 + 큐 적재 통합 — FastAPI /v1/quick/spellcheck 프록시. spellcheck 와 동일하게 Haiku 1회. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> requestQuickSpellcheck(QuickSpellcheckRequest request) {
        try {
            return ExternalCallLogger.measureChecked(
                    ExternalCallLogger.SYSTEM_AI, "requestQuickSpellcheck", AI_SPELLCHECK_SLA_MS, () -> {
                ObjectMapper mapper = new ObjectMapper();
                String jsonBody = mapper.writeValueAsString(request);

                HttpRequest httpReq = HttpRequest.newBuilder()
                        .uri(URI.create(properties.getBaseUrl() + "/v1/quick/spellcheck"))
                        .header("Content-Type", "application/json")
                        .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                        .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                        .timeout(Duration.ofMinutes(2))
                        .build();

                HttpClient client = HttpClient.newBuilder()
                        .version(HttpClient.Version.HTTP_1_1)
                        .connectTimeout(properties.getConnectTimeout())
                        .build();

                HttpResponse<String> response = client.send(
                        httpReq, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
                );

                if (response.statusCode() != 200) {
                    String body = response.body();
                    int bodyLen = body == null ? 0 : body.length();
                    log.warn("AI quick spellcheck non-200: status={} bodyLen={}",
                            response.statusCode(), bodyLen);
                    throw new AiException(ErrorCode.AI_RESPONSE_INVALID);
                }

                return mapper.readValue(response.body(), Map.class);
            });
        } catch (AiException e) {
            throw e;
        } catch (java.io.IOException e) {
            throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AiException(ErrorCode.AI_REQUEST_TIMEOUT, e);
        } catch (Exception e) {
            throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
        }
    }

    /** 회차 요약 단발 생성 — FastAPI /v1/quick/summarize 프록시 (동기 JSON, Haiku 1회). */
    @SuppressWarnings("unchecked")
    public Map<String, Object> requestQuickSummarize(QuickSummarizeRequest request) {
        try {
            return ExternalCallLogger.measureChecked(
                    ExternalCallLogger.SYSTEM_AI, "requestQuickSummarize", AI_SUMMARIZE_SLA_MS, () -> {
                ObjectMapper mapper = new ObjectMapper();
                String jsonBody = mapper.writeValueAsString(request);

                HttpRequest httpReq = HttpRequest.newBuilder()
                        .uri(URI.create(properties.getBaseUrl() + "/v1/quick/summarize"))
                        .header("Content-Type", "application/json")
                        .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                        .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                        .timeout(Duration.ofMinutes(2))
                        .build();

                HttpClient summarizeClient = HttpClient.newBuilder()
                        .version(HttpClient.Version.HTTP_1_1)
                        .connectTimeout(properties.getConnectTimeout())
                        .build();

                HttpResponse<String> response = summarizeClient.send(
                        httpReq, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
                );

                if (response.statusCode() != 200) {
                    String body = response.body();
                    int bodyLen = body == null ? 0 : body.length();
                    log.warn("AI quick summarize non-200: status={} bodyLen={}",
                            response.statusCode(), bodyLen);
                    throw new AiException(ErrorCode.AI_RESPONSE_INVALID);
                }

                return mapper.readValue(response.body(), Map.class);
            });
        } catch (AiException e) {
            throw e;
        } catch (java.io.IOException e) {
            throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AiException(ErrorCode.AI_REQUEST_TIMEOUT, e);
        } catch (Exception e) {
            throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
        }
    }

    /** Celery 태스크 결과 조회. */
    public PingResultResponse getPingResult(String taskId) {
        return ExternalCallLogger.measure(
                ExternalCallLogger.SYSTEM_AI, "getPingResult", AI_QUICK_SLA_MS, () -> {
            try {
                PingResultResponse body = restClient.get()
                        .uri("/v1/_dev/ping/{taskId}", taskId)
                        .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                        .retrieve()
                        .body(PingResultResponse.class);
                if (body == null) {
                    throw new AiException(ErrorCode.AI_RESPONSE_INVALID);
                }
                return body;
            } catch (ResourceAccessException e) {
                throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
            } catch (RestClientResponseException e) {
                throw new AiException(ErrorCode.AI_RESPONSE_INVALID, e);
            }
        });
    }
}
