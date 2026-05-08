package com.storyzip.agent.controller;

import com.storyzip.agent.dto.ReceiptCallbackRequest;
import com.storyzip.agent.dto.ReceiptCallbackResponse;
import com.storyzip.agent.service.AgentReceiptService;
import com.storyzip.ai.client.AiClientProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * AI 서버 → backend 영수증 발행 callback (Phase 4 §L-6).
 *
 * <p>인증: X-Internal-Api-Key. SecurityConfig 의 PUBLIC_ENDPOINTS 에 /internal/** 등재됨.
 * <p>본 엔드포인트가 token_receipt + token_receipt_line 발행 + token_wallet 차감을 단일 TX 로 수행.
 */
@Slf4j
@RestController
@RequestMapping("/internal/v1")
@RequiredArgsConstructor
public class InternalAgentReceiptController {

    private final AgentReceiptService receiptService;
    private final AiClientProperties aiClientProperties;

    @PostMapping("/token-receipts")
    public ReceiptCallbackResponse issueReceipt(
            @RequestBody ReceiptCallbackRequest body,
            @RequestHeader(value = "X-Internal-Api-Key", required = false) String apiKey
    ) {
        if (apiKey == null || !apiKey.equals(aiClientProperties.getInternalApiKey())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "internal api key required");
        }
        return receiptService.issueReceipt(body);
    }
}
