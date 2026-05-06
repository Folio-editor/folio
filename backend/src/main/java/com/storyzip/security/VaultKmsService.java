package com.storyzip.security;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;

/**
 * HashiCorp Vault Transit Engine 호출 구현체.
 *
 * <p>전송 포맷:
 * <pre>
 *   POST /v1/transit/encrypt/{key}  body: {"plaintext": base64} → ciphertext "vault:v1:..."
 *   POST /v1/transit/decrypt/{key}  body: {"ciphertext": "vault:v1:..."} → plaintext base64
 * </pre>
 *
 * <p>저장 포맷: BYTEA 컬럼에 ciphertext 문자열을 UTF-8 로 그대로 저장.
 * Vault ciphertext 자체가 "vault:v1:..." ASCII 라 바이너리 인코딩 불필요.
 *
 * <p>curious-wiggling-thacker plan V-2.
 */
@Slf4j
@Service
@ConditionalOnProperty(prefix = "folio.security.vault", name = "enabled", havingValue = "true")
public class VaultKmsService implements KmsService {

    private final RestClient http;
    private final String transitKey;

    public VaultKmsService(
            @Value("${folio.security.vault.url}") String url,
            @Value("${folio.security.vault.token}") String token,
            @Value("${folio.security.vault.transit-key}") String transitKey,
            @Value("${folio.security.vault.connect-timeout-ms:2000}") int connectTimeoutMs,
            @Value("${folio.security.vault.read-timeout-ms:5000}") int readTimeoutMs) {
        if (token == null || token.isBlank()) {
            throw new IllegalStateException(
                "VAULT_TOKEN 미설정. infra/scripts/vault-init.sh 실행 후 .env 에 등록 필요.");
        }
        // Doppler 또는 vault-init 출력에서 토큰 끝에 trailing whitespace/CR/LF 가 붙는 케이스
        // 차단. HTTP 헤더 값에 control char 들어가면 RestClient 가
        // IllegalArgumentException("Illegal character(s) in message header value") 던짐.
        String cleanToken = token.replaceAll("[\\r\\n\\t ]+$", "").replaceAll("^[\\r\\n\\t ]+", "");
        this.transitKey = transitKey;
        this.http = RestClient.builder()
                .baseUrl(url)
                .defaultHeader("X-Vault-Token", cleanToken)
                .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .requestFactory(buildRequestFactory(connectTimeoutMs, readTimeoutMs))
                .build();
        log.info("VaultKmsService 초기화: url={}, transit-key={}", url, transitKey);
    }

    @Override
    public byte[] encrypt(byte[] plaintext) {
        String b64 = Base64.getEncoder().encodeToString(plaintext);
        JsonNode resp = http.post()
                .uri("/v1/transit/encrypt/{k}", transitKey)
                .body(Map.of("plaintext", b64))
                .retrieve()
                .body(JsonNode.class);
        String ciphertext = resp.path("data").path("ciphertext").asText(null);
        if (ciphertext == null) {
            throw new IllegalStateException("Vault encrypt 응답 파싱 실패: " + resp);
        }
        return ciphertext.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public byte[] decrypt(byte[] ciphertext) {
        String ct = new String(ciphertext, StandardCharsets.UTF_8);
        JsonNode resp = http.post()
                .uri("/v1/transit/decrypt/{k}", transitKey)
                .body(Map.of("ciphertext", ct))
                .retrieve()
                .body(JsonNode.class);
        String b64 = resp.path("data").path("plaintext").asText(null);
        if (b64 == null) {
            throw new IllegalStateException("Vault decrypt 응답 파싱 실패: " + resp);
        }
        return Base64.getDecoder().decode(b64);
    }

    private static org.springframework.http.client.ClientHttpRequestFactory buildRequestFactory(
            int connectMs, int readMs) {
        var f = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        f.setConnectTimeout(Duration.ofMillis(connectMs));
        f.setReadTimeout(Duration.ofMillis(readMs));
        return f;
    }
}
