package com.storyzip.agent.controller;

import com.storyzip.agent.service.SuggestionService;
import com.storyzip.ai.client.AiClient;
import com.storyzip.ai.client.dto.AgentCreateThreadRequest;
import com.storyzip.ai.client.dto.AgentMessageRequest;
import com.storyzip.ai.client.dto.AgentRunResponse;
import com.storyzip.ai.client.dto.AgentTaskResponse;
import com.storyzip.ai.client.dto.AgentThreadResponse;
import com.storyzip.common.exception.ErrorCode;
import com.storyzip.common.exception.PaymentException;
import com.storyzip.payment.dto.TokenWalletResponse;
import com.storyzip.payment.service.TokenWalletService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Phase 4 — Agent REST 진입점.
 *
 * <p>흐름:
 * <ol>
 *   <li>구독 / 잔액 preflight</li>
 *   <li>AI 서버 forward</li>
 *   <li>응답 그대로 반환 (영수증은 AI 서버가 별도 internal callback 으로 발행)</li>
 * </ol>
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/agent")
@RequiredArgsConstructor
@Tag(name = "Agent", description = "AI Agent (Sonnet planner + Haiku worker)")
@SecurityRequirement(name = "bearerAuth")
public class AgentController {

    /** 시나리오별 진입 최소 잔액 (ai/app/agent/scenarios.py SCENARIO_BUDGET 의 min_balance 와 정합). */
    private static final Map<String, Integer> MIN_BALANCE = Map.ofEntries(
            Map.entry("auto", 200),
            // card_auto: 카드 모드 자유 문서 생성 — auto 와 동등 동작 (단발 진입점 분리용 alias).
            Map.entry("card_auto", 200),
            Map.entry("draft_next", 800),
            Map.entry("revision", 600),
            Map.entry("consistency_check", 400),
            Map.entry("extraction", 300),
            Map.entry("qa", 100),
            Map.entry("ideation", 100)
    );

    // Phase 4 — auto 모드는 모든 의도를 포괄하므로 항상 비동기.
    private static final Set<String> ASYNC_SCENARIOS =
            Set.of("auto", "card_auto", "draft_next", "revision", "consistency_check", "extraction");

    private final AiClient aiClient;
    private final TokenWalletService walletService;
    private final SuggestionService suggestionService;

    public record CreateThreadClientRequest(String workId, String scenario, String title) {}

    public record MessageClientRequest(String message) {}

    // ─────── Threads ───────

    @PostMapping("/threads")
    @Operation(summary = "Agent thread 생성")
    public ResponseEntity<AgentThreadResponse> createThread(
            @RequestBody CreateThreadClientRequest body,
            Authentication auth
    ) {
        validateScenario(body.scenario());
        String writerId = auth.getName();
        AgentThreadResponse resp = aiClient.createAgentThread(
                new AgentCreateThreadRequest(body.workId(), writerId, body.scenario(), body.title())
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(resp);
    }

    @GetMapping("/threads")
    @Operation(summary = "내 thread 목록")
    public List<Map<String, Object>> listThreads(
            @RequestParam("workId") String workId,
            Authentication auth
    ) {
        return aiClient.listAgentThreads(workId, auth.getName());
    }

    @GetMapping("/threads/{threadId}")
    @Operation(summary = "thread 상세 (메시지 포함)")
    public Map<String, Object> getThread(
            @PathVariable String threadId,
            Authentication auth
    ) {
        Map<String, Object> body = aiClient.getAgentThread(threadId);
        Object writerOnAi = body.get("writer_id");
        if (writerOnAi != null && !writerOnAi.toString().equals(auth.getName())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "thread owner mismatch");
        }
        return body;
    }

    @DeleteMapping("/threads/{threadId}")
    @Operation(summary = "대화 세션 삭제")
    public ResponseEntity<Void> deleteThread(
            @PathVariable String threadId,
            Authentication auth
    ) {
        // 소유자 검증은 AI 서버 쪽 DELETE 가 writer_id 기반 조건절로 1행 보장.
        // 서비스 단에서 1차로 GET 으로 owner 확인하면 race window 가 생기므로 atomic DELETE 만 신뢰.
        aiClient.deleteAgentThread(threadId, auth.getName());
        log.info("agent thread deleted threadId={} writer={}", threadId, auth.getName());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/threads/{threadId}/compress")
    @Operation(summary = "대화 수동 압축 — 채팅 UI 의 압축 버튼 트리거")
    public Map<String, Object> compressThread(
            @PathVariable String threadId,
            Authentication auth
    ) {
        // 소유자 검증 — getAgentThread 로 1차 owner 확인 (압축은 thread 메시지를 변경하므로 안전 우선)
        Map<String, Object> thread = aiClient.getAgentThread(threadId);
        if (!auth.getName().equals(thread.get("writer_id"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "thread owner mismatch");
        }
        Map<String, Object> result = aiClient.compressAgentThread(threadId);
        log.info("agent thread compressed threadId={} writer={}", threadId, auth.getName());
        return result;
    }

    // ─────── Messages ───────

    @PostMapping("/threads/{threadId}/messages")
    @Operation(summary = "동기 메시지 전송 (qa / ideation)")
    public AgentRunResponse sendMessage(
            @PathVariable String threadId,
            @RequestBody MessageClientRequest body,
            Authentication auth
    ) {
        UUID writerUuid = UUID.fromString(auth.getName());
        Map<String, Object> thread = aiClient.getAgentThread(threadId);
        String scenario = (String) thread.get("scenario");
        if (!auth.getName().equals(thread.get("writer_id"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "thread owner mismatch");
        }
        if (ASYNC_SCENARIOS.contains(scenario)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "scenario " + scenario + " requires /messages/async");
        }
        ensureBalance(writerUuid, MIN_BALANCE.getOrDefault(scenario, 100));
        return aiClient.sendAgentMessage(threadId, new AgentMessageRequest(body.message()));
    }

    @PostMapping(value = "/threads/{threadId}/messages/stream",
                 produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "SSE 실시간 스트리밍 — 매 step / 도구 호출 / 완료 이벤트 발행")
    public SseEmitter streamMessage(
            @PathVariable String threadId,
            @RequestBody MessageClientRequest body,
            Authentication auth
    ) {
        UUID writerUuid = UUID.fromString(auth.getName());
        Map<String, Object> thread = aiClient.getAgentThread(threadId);
        String scenario = (String) thread.get("scenario");
        if (!auth.getName().equals(thread.get("writer_id"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "thread owner mismatch");
        }
        ensureBalance(writerUuid, MIN_BALANCE.getOrDefault(scenario, 100));
        SseEmitter emitter = new SseEmitter(10 * 60 * 1000L);    // 10분 timeout
        aiClient.streamAgentMessage(threadId, new AgentMessageRequest(body.message()), emitter);
        return emitter;
    }

    @PostMapping("/threads/{threadId}/messages/async")
    @Operation(summary = "비동기 메시지 전송 (draft_next / revision / consistency / extraction)")
    public AgentTaskResponse sendMessageAsync(
            @PathVariable String threadId,
            @RequestBody MessageClientRequest body,
            Authentication auth
    ) {
        UUID writerUuid = UUID.fromString(auth.getName());
        Map<String, Object> thread = aiClient.getAgentThread(threadId);
        String scenario = (String) thread.get("scenario");
        if (!auth.getName().equals(thread.get("writer_id"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "thread owner mismatch");
        }
        ensureBalance(writerUuid, MIN_BALANCE.getOrDefault(scenario, 100));
        return aiClient.sendAgentMessageAsync(threadId, new AgentMessageRequest(body.message()));
    }

    // ─────── Suggestions ───────

    // ─────── Async Task Status ───────

    @GetMapping("/tasks/{taskId}/status")
    @Operation(summary = "비동기 agent 태스크 진행 상태")
    public Map<String, Object> getTaskStatus(@PathVariable String taskId, Authentication auth) {
        // task_id 가 사용자 본인 thread 의 task 인지 검증은 task 메타에 writer_id 가 없어
        // 1차에서는 인증된 사용자만 조회 가능 (cross-user task_id 노출은 가능하나 정보가 진행률뿐).
        // Phase 5 — task 발급 시 writer_id 캐시 + 검증 추가.
        return aiClient.getAgentTaskStatus(taskId);
    }

    @GetMapping("/suggestions")
    @Operation(summary = "Agent 제안 목록")
    public List<Map<String, Object>> listSuggestions(
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "entityType", required = false) String entityType,
            @RequestParam(value = "limit", defaultValue = "50") int limit,
            Authentication auth
    ) {
        return suggestionService.list(UUID.fromString(auth.getName()), status, entityType, limit);
    }

    public record SuggestionPatchRequest(
            String status,
            String reviewerNote,
            /** spelling_batch 전용 — 작가가 체크박스로 선별한 fix index 들. 다른 entity_type 에선 무시. */
            List<Integer> selectedIndices
    ) {}

    @PatchMapping("/suggestions/{id}")
    @Operation(summary = "제안 승인/거절")
    public Map<String, Object> patchSuggestion(
            @PathVariable UUID id,
            @RequestBody SuggestionPatchRequest body,
            Authentication auth
    ) {
        return suggestionService.updateStatus(
                UUID.fromString(auth.getName()), id, body.status(), body.reviewerNote(), body.selectedIndices()
        );
    }

    @DeleteMapping("/suggestions/{id}")
    @Operation(summary = "제안 기록 영구 삭제 — 처리 완료 또는 미처리 기록 정리용")
    public ResponseEntity<Void> deleteSuggestion(
            @PathVariable UUID id,
            Authentication auth
    ) {
        suggestionService.delete(UUID.fromString(auth.getName()), id);
        return ResponseEntity.noContent().build();
    }

    // ─────── 헬퍼 ───────

    private void validateScenario(String scenario) {
        if (scenario == null || !MIN_BALANCE.containsKey(scenario)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown scenario");
        }
    }

    private void ensureBalance(UUID writerId, int minRequired) {
        TokenWalletResponse wallet = walletService.getWallet(writerId);
        if (wallet.balance() < minRequired) {
            throw new PaymentException(ErrorCode.INSUFFICIENT_TOKEN);
        }
    }
}
