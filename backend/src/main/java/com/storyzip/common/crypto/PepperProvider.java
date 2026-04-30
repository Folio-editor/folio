package com.storyzip.common.crypto;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.RemovalCause;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueResponse;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;

/**
 * Plan C 결정 6/7/12/16 — server_pepper 보관소.
 *
 * <p>AWS Secrets Manager에서 {@code folio/encryption/pepper} 시크릿을 5분 TTL Caffeine 캐시로
 * 조회하고, HKDF-SHA256으로 사용자별 / PII용 파생 키를 만든다.
 *
 * <p>server_pepper 자체는 절대 외부로 반환되지 않는다. 호출자는 derive* 메서드의 결과만
 * 받으며, 사용 직후 {@link Hkdf#zeroize(byte[])} 로 즉시 폐기해야 한다.
 *
 * <p>시크릿 JSON 포맷:
 * <pre>{@code
 * {
 *   "active": "v1",
 *   "v1": "<base64-32B-random>",
 *   "v1_created_at": "2026-04-29T00:00:00Z"
 * }
 * }</pre>
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "folio.security.pepper.enabled", havingValue = "true")
public class PepperProvider implements DisposableBean {

    private static final byte[] PEPPER_USER_INFO =
            "folio-pepper-user-v1".getBytes(StandardCharsets.UTF_8);
    private static final byte[] PII_KEY_INFO =
            "folio-pii-v1".getBytes(StandardCharsets.UTF_8);
    private static final byte[] PII_SYSTEM_SALT =
            "pii-system-salt-v1".getBytes(StandardCharsets.UTF_8);
    private static final int DERIVED_KEY_LENGTH = 32;
    private static final String CACHE_KEY = "pepper";

    private final SecretsManagerClient secretsManagerClient;
    private final ObjectMapper objectMapper;
    private final String secretId;
    private final Cache<String, PepperBundle> cache;

    public PepperProvider(
            SecretsManagerClient secretsManagerClient,
            ObjectMapper objectMapper,
            @Value("${folio.security.pepper.secret-id:folio/encryption/pepper}") String secretId) {
        this.secretsManagerClient = secretsManagerClient;
        this.objectMapper = objectMapper;
        this.secretId = secretId;
        this.cache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofMinutes(5))
                .maximumSize(1)
                .removalListener((String k, PepperBundle v, RemovalCause cause) -> {
                    if (v != null) v.destroy();
                })
                .build();
    }

    /**
     * 사용자별 pepper_user 도출. 클라이언트에 1회 전달용.
     *
     * <p>HKDF(IKM=server_pepper, salt=google_sub, info="folio-pepper-user-v1") → 32B
     */
    public DerivedKey derivePepperUser(String googleSub) {
        if (googleSub == null || googleSub.isBlank()) {
            throw new IllegalArgumentException("googleSub must not be blank");
        }
        PepperBundle bundle = loadBundle();
        byte[] salt = googleSub.getBytes(StandardCharsets.UTF_8);
        byte[] derived = Hkdf.deriveKey(bundle.activePepper(), salt, PEPPER_USER_INFO, DERIVED_KEY_LENGTH);
        return new DerivedKey(derived, bundle.activeVersion());
    }

    /**
     * PII 시스템 키 도출. 모든 사용자 email/phone 암호화에 공통 사용.
     *
     * <p>HKDF(IKM=server_pepper, salt="pii-system-salt-v1", info="folio-pii-v1") → 32B
     */
    public DerivedKey derivePiiKey() {
        PepperBundle bundle = loadBundle();
        byte[] derived = Hkdf.deriveKey(bundle.activePepper(), PII_SYSTEM_SALT, PII_KEY_INFO, DERIVED_KEY_LENGTH);
        return new DerivedKey(derived, bundle.activeVersion());
    }

    /**
     * email_hash = SHA-256-HMAC(server_pepper, email_lowercase). 무지개 테이블 방어용.
     * 결정 9의 "SHA-256(email_lowercase + pepper)"를 HMAC 형태로 안전하게 구현.
     */
    public byte[] hashEmail(String emailLowercase) {
        if (emailLowercase == null) throw new IllegalArgumentException("email must not be null");
        PepperBundle bundle = loadBundle();
        byte[] msg = emailLowercase.getBytes(StandardCharsets.UTF_8);
        return Hkdf.deriveKey(bundle.activePepper(), msg,
                "folio-email-hash-v1".getBytes(StandardCharsets.UTF_8), 32);
    }

    /** 캐시 강제 무효화 (회전 시 외부 트리거용). */
    public void invalidate() {
        cache.invalidateAll();
    }

    private PepperBundle loadBundle() {
        return cache.get(CACHE_KEY, k -> fetchFromSecretsManager());
    }

    private PepperBundle fetchFromSecretsManager() {
        GetSecretValueResponse response = secretsManagerClient.getSecretValue(
                GetSecretValueRequest.builder().secretId(secretId).build());

        String secretString = response.secretString();
        if (secretString == null || secretString.isBlank()) {
            throw new IllegalStateException("pepper secret is empty: " + secretId);
        }

        try {
            JsonNode root = objectMapper.readTree(secretString);
            String active = root.path("active").asText(null);
            if (active == null || active.isBlank()) {
                throw new IllegalStateException("pepper secret missing 'active' field");
            }
            JsonNode versionNode = root.path(active);
            if (versionNode.isMissingNode() || !versionNode.isTextual()) {
                throw new IllegalStateException("pepper secret missing version: " + active);
            }
            byte[] pepper = Base64.getDecoder().decode(versionNode.asText());
            if (pepper.length != 32) {
                Hkdf.zeroize(pepper);
                throw new IllegalStateException("pepper must be 32 bytes, got " + pepper.length);
            }
            return new PepperBundle(active, pepper);
        } catch (Exception e) {
            throw new IllegalStateException("failed to parse pepper secret", e);
        }
    }

    @Override
    public void destroy() {
        cache.asMap().forEach((k, v) -> v.destroy());
        cache.invalidateAll();
        cache.cleanUp();
    }

    /**
     * server_pepper 원본을 5분 동안 메모리에 들고 있는 캐시 엔트리.
     * destroy 시 byte[] zeroize.
     */
    private record PepperBundle(String activeVersion, byte[] activePepper) {
        void destroy() {
            Hkdf.zeroize(activePepper);
        }
    }

    /**
     * derive* 결과. 호출자는 사용 후 반드시 {@link #destroy()} 를 호출해야 한다.
     */
    public record DerivedKey(byte[] keyBytes, String pepperVersion) implements AutoCloseable {

        public String keyBase64() {
            return Base64.getEncoder().encodeToString(keyBytes);
        }

        public void destroy() {
            Hkdf.zeroize(keyBytes);
        }

        @Override
        public void close() {
            destroy();
        }
    }
}
