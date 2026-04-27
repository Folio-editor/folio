package com.storyzip.ai.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.storyzip.ai.client.dto.DraftRequest;
import com.storyzip.ai.client.dto.EpisodePipelineRequest;
import com.storyzip.ai.client.dto.EpisodePipelineResponse;
import com.storyzip.ai.client.dto.HealthResponse;
import com.storyzip.ai.client.dto.PingEnqueuedResponse;
import com.storyzip.ai.client.dto.PingResultResponse;
import com.storyzip.ai.client.dto.ReviewRequest;
import com.storyzip.common.exception.AiException;
import com.storyzip.common.exception.ErrorCode;
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
            log.warn("AI health request failed (connection)", e);
            throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
        } catch (RestClientResponseException e) {
            log.warn("AI health request failed (http {})", e.getStatusCode(), e);
            throw new AiException(ErrorCode.AI_RESPONSE_INVALID, e);
        }
    }

    /** 회차 인덱싱 파이프라인 트리거 (청킹 + 임베딩 + 요약 + 추출). */
    public EpisodePipelineResponse triggerEpisodePipeline(EpisodePipelineRequest request) {
        try {
            EpisodePipelineResponse body = restClient.post()
                    .uri("/v1/pipelines/episode")
                    .header(INTERNAL_API_KEY_HEADER, properties.getInternalApiKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .body(EpisodePipelineResponse.class);
            if (body == null || body.taskId() == null) {
                throw new AiException(ErrorCode.AI_RESPONSE_INVALID);
            }
            return body;
        } catch (ResourceAccessException e) {
            log.warn("AI pipeline trigger failed (connection)", e);
            throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
        } catch (RestClientResponseException e) {
            log.warn("AI pipeline trigger failed (http {})", e.getStatusCode(), e);
            throw new AiException(ErrorCode.AI_RESPONSE_INVALID, e);
        }
    }

    /** Celery 태스크 적재 — dev 스모크 전용. */
    public PingEnqueuedResponse enqueuePing(String msg) {
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
            log.warn("AI ping enqueue failed (connection)", e);
            throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
        } catch (RestClientResponseException e) {
            log.warn("AI ping enqueue failed (http {})", e.getStatusCode(), e);
            throw new AiException(ErrorCode.AI_RESPONSE_INVALID, e);
        }
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
        Thread.startVirtualThread(() -> {
            ObjectMapper mapper = new ObjectMapper();
            Map<String, Object> lastDoneUsage = new java.util.HashMap<>();
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

                HttpResponse<java.io.InputStream> response = sseClient.send(
                        httpReq, HttpResponse.BodyHandlers.ofInputStream()
                );

                if (response.statusCode() != 200) {
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
                log.info("Draft stream upstream completed: lastDoneUsage={}", lastDoneUsage);
                try { emitter.complete(); } catch (Exception ignored) { /* 이미 완료됨 */ }
            } catch (Exception e) {
                log.warn("Draft streaming failed", e);
                emitter.completeWithError(e);
            } finally {
                if (onDone != null) {
                    try {
                        onDone.accept(lastDoneUsage);
                    } catch (Exception e) {
                        log.warn("Draft onDone callback failed", e);
                    }
                }
            }
        });
    }

    /** 원고 검수 — FastAPI /v1/reviews 프록시 (동기 JSON). */
    @SuppressWarnings("unchecked")
    public Map<String, Object> requestReview(ReviewRequest request) {
        try {
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
                String bodyPreview = bodyLen == 0 ? "" : body.substring(0, Math.min(bodyLen, 200));
                log.warn("AI review failed (http {}): bodyLen={} preview={}",
                        response.statusCode(), bodyLen, bodyPreview);
                throw new AiException(ErrorCode.AI_RESPONSE_INVALID);
            }

            return mapper.readValue(response.body(), Map.class);
        } catch (AiException e) {
            throw e;
        } catch (java.io.IOException e) {
            log.warn("AI review request failed (IO)", e);
            throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AiException(ErrorCode.AI_REQUEST_TIMEOUT, e);
        }
    }

    /** Celery 태스크 결과 조회. */
    public PingResultResponse getPingResult(String taskId) {
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
            log.warn("AI ping result failed (connection)", e);
            throw new AiException(ErrorCode.AI_SERVER_UNAVAILABLE, e);
        } catch (RestClientResponseException e) {
            log.warn("AI ping result failed (http {})", e.getStatusCode(), e);
            throw new AiException(ErrorCode.AI_RESPONSE_INVALID, e);
        }
    }
}
