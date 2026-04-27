package com.storyzip.ai.controller;

import com.storyzip.ai.client.AiClient;
import com.storyzip.ai.client.dto.DraftRequest;
import com.storyzip.ai.client.dto.ReviewRequest;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.payment.dto.TokenWalletResponse;
import com.storyzip.payment.pricing.CreditCalculator;
import com.storyzip.payment.service.TokenWalletService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.UUID;

/**
 * 프론트엔드 → Spring → FastAPI AI 서버 프록시.
 * - /drafts: SSE 스트리밍 초안 생성
 * - /reviews: JSON 원고 검수
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/ai")
@RequiredArgsConstructor
@Tag(name = "AI", description = "AI 초안 생성 · 원고 검수 API")
@SecurityRequirement(name = "bearerAuth")
public class AiController {

    /** 잔액 부족 사전 차단 시 사용하는 보수적 추정치 (실제 차감은 사후 정산). */
    private static final int DRAFT_SONNET_MIN_CREDITS = 38;
    private static final int DRAFT_OPUS_MIN_CREDITS   = 70;
    private static final int REVIEW_MIN_CREDITS       = 29;

    private final AiClient aiClient;
    private final TokenWalletService tokenWalletService;
    private final CreditCalculator creditCalculator;

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
        UUID writerUuid = UUID.fromString(writerId);
        String model = body.model() != null ? body.model() : "sonnet";

        // 사전 검증: 최소 추정치 미달이면 즉시 402 차단.
        int minCredits = "opus".equalsIgnoreCase(model)
                ? DRAFT_OPUS_MIN_CREDITS : DRAFT_SONNET_MIN_CREDITS;
        ensureBalance(writerUuid, minCredits);

        DraftRequest request = new DraftRequest(
                body.workId(),
                writerId,
                body.episodeId(),
                body.storyline(),
                body.currentEpisodeNum(),
                model,
                body.userPrompt()
        );

        SseEmitter emitter = new SseEmitter(5 * 60 * 1000L); // 5분 타임아웃
        aiClient.streamDraft(request, emitter, usage -> deductFromUsage(
                writerUuid, model, usage,
                "AI_DRAFT_" + body.episodeId(),
                safeUuid(body.episodeId())
        ));
        return emitter;
    }

    @PostMapping("/reviews")
    @Operation(summary = "AI 원고 검수")
    public ResponseEntity<Map<String, Object>> reviewEpisode(
            @RequestBody ReviewClientRequest body,
            Authentication authentication
    ) {
        String writerId = authentication.getName();
        UUID writerUuid = UUID.fromString(writerId);

        ensureBalance(writerUuid, REVIEW_MIN_CREDITS);

        ReviewRequest request = new ReviewRequest(
                body.workId(),
                writerId,
                body.episodeId(),
                body.content(),
                body.episodeNumber()
        );

        Map<String, Object> result = aiClient.requestReview(request);

        Object usage = result.get("usage");
        if (usage instanceof Map<?, ?> usageMap) {
            @SuppressWarnings("unchecked")
            Map<String, Object> typed = (Map<String, Object>) usageMap;
            deductFromUsage(writerUuid, "sonnet", typed,
                    "AI_REVIEW_" + body.episodeId(),
                    safeUuid(body.episodeId()));
        }
        return ResponseEntity.ok(result);
    }

    /** 잔액(구독+보너스+종량제 합계)이 최소 요구치 이상인지 확인. 미달 시 P008 발생. */
    private void ensureBalance(UUID writerId, int required) {
        TokenWalletResponse wallet = tokenWalletService.getWallet(writerId);
        if (wallet.balance() < required) {
            throw new PaymentException(ErrorCode.INSUFFICIENT_TOKEN);
        }
    }

    /** AI usage(input_tokens/output_tokens)에서 크레딧을 산출해 차감. usage 비어있으면 무시. */
    private void deductFromUsage(UUID writerId, String model, Map<String, Object> usage,
                                 String reason, UUID referenceId) {
        if (usage == null || usage.isEmpty()) {
            log.warn("AI usage missing — skipping credit deduction: writerId={}, reason={}",
                    writerId, reason);
            return;
        }
        int input = intFrom(usage.get("input_tokens"));
        int output = intFrom(usage.get("output_tokens"));
        if (input == 0 && output == 0) {
            log.warn("AI usage tokens are zero — skipping deduction: writerId={}, reason={}",
                    writerId, reason);
            return;
        }
        int credits = creditCalculator.calcCredits(model, input, output);
        if (credits <= 0) return;
        try {
            tokenWalletService.use(writerId, credits, reason, referenceId);
            log.info("AI credit deducted: writerId={}, credits={}, model={}, in={}, out={}, reason={}",
                    writerId, credits, model, input, output, reason);
        } catch (PaymentException e) {
            // 사후 차감 실패(잔액 음수 등)는 사용자에게 노출되지 않으므로 로그만 남김.
            log.warn("AI credit deduction failed: writerId={}, credits={}, reason={}, code={}",
                    writerId, credits, reason, e.getErrorCode());
        }
    }

    private static int intFrom(Object v) {
        if (v instanceof Number n) return n.intValue();
        if (v instanceof String s) {
            try { return Integer.parseInt(s); } catch (NumberFormatException e) { return 0; }
        }
        return 0;
    }

    private static UUID safeUuid(String s) {
        try { return UUID.fromString(s); } catch (Exception e) { return null; }
    }
}
