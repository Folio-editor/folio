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
}
