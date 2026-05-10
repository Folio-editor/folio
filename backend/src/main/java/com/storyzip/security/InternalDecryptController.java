package com.storyzip.security;

import com.storyzip.ai.client.AiClientProperties;
import com.storyzip.sync.repository.EpisodeRepository;
import com.storyzip.sync.repository.WorkRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * AI 서버 → backend 평문 본문 fetch 경로 (curious-wiggling-thacker plan V-7).
 *
 * <p>흐름:
 * <ol>
 *   <li>AI 서버가 X-Internal-Api-Key 헤더로 호출 (양방향 동일 secret 재사용)</li>
 *   <li>WorkKeyService 가 work.server_encrypted_dek → Vault decrypt → work_key 평문</li>
 *   <li>AesGcmCipher 가 episode.content ciphertext → 평문 본문</li>
 *   <li>응답 후 work_key + 평문 즉시 메모리 폐기</li>
 * </ol>
 *
 * <p>경로 prefix /internal — Spring Security 또는 nginx 에서 외부 노출 차단할 것.
 */
@Slf4j
@RestController
@RequestMapping("/internal")
@RequiredArgsConstructor
@ConditionalOnBean(KmsService.class)
public class InternalDecryptController {

    private final WorkKeyService workKeyService;
    private final WorkRepository workRepo;
    private final EpisodeRepository episodeRepo;
    private final AiClientProperties aiClientProperties;

    public record DecryptEpisodeResponse(String workId, String episodeId, String plaintext) {}

    @PostMapping("/works/{workId}/decrypt-episode/{episodeId}")
    public ResponseEntity<DecryptEpisodeResponse> decryptEpisode(
            @PathVariable UUID workId,
            @PathVariable UUID episodeId,
            @RequestHeader(value = "X-Internal-Api-Key", required = false) String apiKey
    ) {
        if (apiKey == null || !apiKey.equals(aiClientProperties.getInternalApiKey())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "internal api key required");
        }
        var episode = episodeRepo.findById(episodeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "episode not found"));
        if (!workId.equals(episode.getWorkId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "workId mismatch");
        }
        if (!workRepo.existsById(workId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "work not found");
        }

        byte[] workKey = workKeyService.resolveWorkKey(workId);
        if (workKey == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "server_encrypted_dek 미발급 — 클라이언트 server-dek pending 처리 대기");
        }
        try {
            String plain = AesGcmCipher.decryptString(workKey, episode.getContent());
            return ResponseEntity.ok(new DecryptEpisodeResponse(
                    workId.toString(), episodeId.toString(), plain));
        } finally {
            // workKey 자체는 WorkKeyService 캐시에 남음 (TTL). 응답 변수는 GC 의존.
            Arrays.fill(workKey, (byte) 0);
        }
    }

    /**
     * Phase 4 — 임의의 v1: 암호문 필드 다수를 한번에 복호화 (character / world_note / plot 용).
     *
     * <p>Body: {"fields": {"key": "v1:abc...", "key2": "평문"}}<br>
     * 응답: {"fields": {"key": "복호화된 평문", "key2": "평문"}}<br>
     * v1: 접두사가 없는 값은 그대로 echo. 디코드 실패 시 원본 그대로 반환 (에러 X — 일부 실패 허용).
     */
    public record DecryptFieldsRequest(Map<String, String> fields) {}
    public record DecryptFieldsResponse(String workId, Map<String, String> fields) {}

    @PostMapping("/works/{workId}/decrypt-fields")
    public ResponseEntity<DecryptFieldsResponse> decryptFields(
            @PathVariable UUID workId,
            @RequestBody DecryptFieldsRequest body,
            @RequestHeader(value = "X-Internal-Api-Key", required = false) String apiKey
    ) {
        if (apiKey == null || !apiKey.equals(aiClientProperties.getInternalApiKey())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "internal api key required");
        }
        if (body == null || body.fields() == null) {
            return ResponseEntity.ok(new DecryptFieldsResponse(workId.toString(), Map.of()));
        }
        if (!workRepo.existsById(workId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "work not found");
        }

        Map<String, String> result = new LinkedHashMap<>(body.fields().size());
        boolean needsKey = body.fields().values().stream()
                .anyMatch(v -> v != null && v.startsWith("v1:"));
        byte[] workKey = needsKey ? workKeyService.resolveWorkKey(workId) : null;
        if (needsKey && workKey == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "server_encrypted_dek 미발급 — 클라이언트 server-dek pending 처리 대기");
        }
        try {
            for (Map.Entry<String, String> e : body.fields().entrySet()) {
                String value = e.getValue();
                if (value == null || !value.startsWith("v1:")) {
                    result.put(e.getKey(), value);
                    continue;
                }
                try {
                    result.put(e.getKey(), AesGcmCipher.decryptString(workKey, value));
                } catch (Exception ex) {
                    log.warn("[INTERNAL_DECRYPT_FIELD_FAIL] work={} key={} reason={}",
                            workId, e.getKey(), ex.getMessage());
                    result.put(e.getKey(), value);
                }
            }
            return ResponseEntity.ok(new DecryptFieldsResponse(workId.toString(), result));
        } finally {
            if (workKey != null) Arrays.fill(workKey, (byte) 0);
        }
    }

    /**
     * Phase 4.6 — AI 서버가 청크/요약 INSERT 전 자유형 텍스트 필드 일괄 암호화.
     *
     * <p>Body: {"fields": {"key": "평문", "key2": "다른 평문", "key3": null}}<br>
     * 응답: {"fields": {"key": "v1:abc...", "key2": "v1:def...", "key3": null}}<br>
     * null / 빈 문자열은 그대로 echo. 이미 v1: 인 값도 그대로 echo (이중 암호화 차단).<br>
     *
     * <p>호출처: chunk_and_embed_task (chunks), summarize_episode / generate_summary_task
     * (oneline_summary, summary, cliffhanger, tone, time_progression, pov_character).
     */
    public record EncryptFieldsRequest(Map<String, String> fields) {}
    public record EncryptFieldsResponse(String workId, Map<String, String> fields) {}

    @PostMapping("/works/{workId}/encrypt-fields")
    public ResponseEntity<EncryptFieldsResponse> encryptFields(
            @PathVariable UUID workId,
            @RequestBody EncryptFieldsRequest body,
            @RequestHeader(value = "X-Internal-Api-Key", required = false) String apiKey
    ) {
        if (apiKey == null || !apiKey.equals(aiClientProperties.getInternalApiKey())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "internal api key required");
        }
        if (body == null || body.fields() == null) {
            return ResponseEntity.ok(new EncryptFieldsResponse(workId.toString(), Map.of()));
        }
        if (!workRepo.existsById(workId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "work not found");
        }

        Map<String, String> result = new LinkedHashMap<>(body.fields().size());
        boolean needsKey = body.fields().values().stream()
                .anyMatch(v -> v != null && !v.isEmpty() && !v.startsWith("v1:"));
        byte[] workKey = needsKey ? workKeyService.resolveWorkKey(workId) : null;
        if (needsKey && workKey == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "server_encrypted_dek 미발급 — 클라이언트 server-dek pending 처리 대기");
        }
        try {
            for (Map.Entry<String, String> e : body.fields().entrySet()) {
                String value = e.getValue();
                if (value == null || value.isEmpty() || value.startsWith("v1:")) {
                    // null/빈/이미 ciphertext — 그대로 echo
                    result.put(e.getKey(), value);
                    continue;
                }
                try {
                    result.put(e.getKey(), AesGcmCipher.encryptString(workKey, value));
                } catch (Exception ex) {
                    log.warn("[INTERNAL_ENCRYPT_FIELD_FAIL] work={} key={} reason={}",
                            workId, e.getKey(), ex.getMessage());
                    // fail-soft: 암호화 실패하면 평문으로 두지 않고 에러 던져서 INSERT 자체 실패시킴
                    throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                            "encrypt failed for field=" + e.getKey());
                }
            }
            return ResponseEntity.ok(new EncryptFieldsResponse(workId.toString(), result));
        } finally {
            if (workKey != null) Arrays.fill(workKey, (byte) 0);
        }
    }
}
