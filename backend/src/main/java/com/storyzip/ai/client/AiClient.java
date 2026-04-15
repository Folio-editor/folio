package com.storyzip.ai.client;

import com.storyzip.ai.client.dto.HealthResponse;
import com.storyzip.ai.client.dto.PingEnqueuedResponse;
import com.storyzip.ai.client.dto.PingResultResponse;
import com.storyzip.common.exception.AiException;
import com.storyzip.common.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.net.http.HttpClient;
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
