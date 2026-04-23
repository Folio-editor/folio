package com.storyzip.ai.controller;

import com.storyzip.ai.client.AiClient;
import com.storyzip.ai.client.dto.DraftRequest;
import com.storyzip.ai.client.dto.ReviewRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

/**
 * 프론트엔드 → Spring → FastAPI AI 서버 프록시.
 * - /drafts: SSE 스트리밍 초안 생성
 * - /reviews: JSON 원고 검수
 */
@RestController
@RequestMapping("/api/v1/ai")
@RequiredArgsConstructor
@Tag(name = "AI", description = "AI 초안 생성 · 원고 검수 API")
@SecurityRequirement(name = "bearerAuth")
public class AiController {

    private final AiClient aiClient;

    public record DraftClientRequest(
            String workId,
            String episodeId,
            String storyline,
            int currentEpisodeNum,
            String model,
            String userPrompt
    ) {}

    public record ReviewClientRequest(
            String workId,
            String episodeId,
            String content,
            int episodeNumber
    ) {}

    @PostMapping(value = "/drafts", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "AI 초안 생성 (SSE 스트리밍)")
    public SseEmitter generateDraft(
            @RequestBody DraftClientRequest body,
            Authentication authentication
    ) {
        String writerId = authentication.getName();

        DraftRequest request = new DraftRequest(
                body.workId(),
                writerId,
                body.episodeId(),
                body.storyline(),
                body.currentEpisodeNum(),
                body.model() != null ? body.model() : "sonnet",
                body.userPrompt()
        );

        SseEmitter emitter = new SseEmitter(5 * 60 * 1000L); // 5분 타임아웃
        aiClient.streamDraft(request, emitter);
        return emitter;
    }

    @PostMapping("/reviews")
    @Operation(summary = "AI 원고 검수")
    public ResponseEntity<Map<String, Object>> reviewEpisode(
            @RequestBody ReviewClientRequest body,
            Authentication authentication
    ) {
        String writerId = authentication.getName();

        ReviewRequest request = new ReviewRequest(
                body.workId(),
                writerId,
                body.episodeId(),
                body.content(),
                body.episodeNumber()
        );

        Map<String, Object> result = aiClient.requestReview(request);
        return ResponseEntity.ok(result);
    }
}
