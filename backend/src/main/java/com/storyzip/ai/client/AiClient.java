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
     */
    public void streamDraft(DraftRequest request, SseEmitter emitter) {
        Thread.startVirtualThread(() -> {
            try {
                ObjectMapper mapper = new ObjectMapper();
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
                            emitter.send(SseEmitter.event().data(data, org.springframework.http.MediaType.APPLICATION_JSON));
                        }
                    }
                }
                emitter.complete();
            } catch (Exception e) {
                log.warn("Draft streaming failed", e);
                emitter.completeWithError(e);
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
