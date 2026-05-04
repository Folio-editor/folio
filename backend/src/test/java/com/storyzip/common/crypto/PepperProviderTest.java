package com.storyzip.common.crypto;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueResponse;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Plan C 결정 12 — HKDF 입력 매핑 검증.
 *
 * <p>이 테스트의 핵심은 PepperProvider가 IKM/salt/info 자리를 결정 12 그대로
 * (server_pepper / google_sub / "folio-pepper-user-v1") 사용하는지를 못 박는 것이다.
 * 인자 자리 바꿈은 Plan C 결함 #1이라 회귀를 허용해선 안 된다.
 */
class PepperProviderTest {

    private static final byte[] PEPPER = repeat((byte) 0xAB, 32);
    private static final String PEPPER_BASE64 = Base64.getEncoder().encodeToString(PEPPER);
    private static final String SECRET_JSON = """
            {
              "active": "v1",
              "v1": "%s"
            }
            """.formatted(PEPPER_BASE64);

    private SecretsManagerClient secretsManager;
    private PepperProvider provider;

    @BeforeEach
    void setUp() {
        secretsManager = mock(SecretsManagerClient.class);
        when(secretsManager.getSecretValue(any(GetSecretValueRequest.class)))
                .thenReturn(GetSecretValueResponse.builder().secretString(SECRET_JSON).build());
        provider = new PepperProvider(secretsManager, new ObjectMapper(), "folio/encryption/pepper");
    }

    @Test
    @DisplayName("derivePepperUser는 HKDF(IKM=pepper, salt=sub, info=\"folio-pepper-user-v1\")를 따른다")
    void derivePepperUser_hkdfMappingMatchesDecision12() {
        String sub = "1234567890";
        byte[] expected = referenceHkdfSha256(
                PEPPER,
                sub.getBytes(StandardCharsets.UTF_8),
                "folio-pepper-user-v1".getBytes(StandardCharsets.UTF_8),
                32);

        PepperProvider.DerivedKey result = provider.derivePepperUser(sub);

        assertThat(result.keyBytes()).isEqualTo(expected);
        assertThat(result.pepperVersion()).isEqualTo("v1");

        result.destroy();
        assertThat(result.keyBytes()).containsOnly((byte) 0);
    }

    @Test
    @DisplayName("derivePiiKey는 HKDF(IKM=pepper, salt=\"pii-system-salt-v1\", info=\"folio-pii-v1\")를 따른다")
    void derivePiiKey_hkdfMappingMatchesDecision12() {
        byte[] expected = referenceHkdfSha256(
                PEPPER,
                "pii-system-salt-v1".getBytes(StandardCharsets.UTF_8),
                "folio-pii-v1".getBytes(StandardCharsets.UTF_8),
                32);

        try (PepperProvider.DerivedKey result = provider.derivePiiKey()) {
            assertThat(result.keyBytes()).isEqualTo(expected);
            assertThat(result.pepperVersion()).isEqualTo("v1");
        }
    }

    @Test
    @DisplayName("derivePepperUser는 sub가 다르면 결과가 다르다 — domain separation")
    void differentSub_producesDifferentKey() {
        try (PepperProvider.DerivedKey a = provider.derivePepperUser("user-a");
             PepperProvider.DerivedKey b = provider.derivePepperUser("user-b")) {
            assertThat(a.keyBytes()).isNotEqualTo(b.keyBytes());
        }
    }

    @Test
    @DisplayName("derivePepperUser와 derivePiiKey는 결과가 다르다 — info 분리")
    void pepperUserAndPiiKey_differDueToInfoSeparation() {
        try (PepperProvider.DerivedKey user = provider.derivePepperUser("pii-system-salt-v1");
             PepperProvider.DerivedKey pii = provider.derivePiiKey()) {
            // 같은 salt/IKM이라도 info가 달라 반드시 다른 키가 나와야 한다.
            assertThat(user.keyBytes()).isNotEqualTo(pii.keyBytes());
        }
    }

    @Test
    @DisplayName("Secrets Manager 호출은 5분 TTL 캐시로 1회만 발생한다")
    void secretsManager_isCachedWithinTtl() {
        AtomicInteger callCount = new AtomicInteger();
        when(secretsManager.getSecretValue(any(GetSecretValueRequest.class)))
                .thenAnswer(inv -> {
                    callCount.incrementAndGet();
                    return GetSecretValueResponse.builder().secretString(SECRET_JSON).build();
                });

        for (int i = 0; i < 10; i++) {
            provider.derivePepperUser("user-" + i).destroy();
        }

        assertThat(callCount.get()).isEqualTo(1);
    }

    @Test
    @DisplayName("invalidate 후엔 재조회된다")
    void invalidate_forcesRefresh() {
        provider.derivePepperUser("u1").destroy();
        provider.invalidate();
        provider.derivePepperUser("u1").destroy();

        verify(secretsManager, times(2)).getSecretValue(any(GetSecretValueRequest.class));
    }

    @Test
    @DisplayName("active 버전이 빠지면 IllegalStateException")
    void missingActive_throws() {
        when(secretsManager.getSecretValue(any(GetSecretValueRequest.class)))
                .thenReturn(GetSecretValueResponse.builder()
                        .secretString("""
                                { "v1": "%s" }
                                """.formatted(PEPPER_BASE64))
                        .build());
        provider.invalidate();

        assertThatThrownBy(() -> provider.derivePepperUser("u1"))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("pepper가 32B가 아니면 거부")
    void wrongPepperLength_throws() {
        String shortBase64 = Base64.getEncoder().encodeToString(repeat((byte) 0x01, 16));
        when(secretsManager.getSecretValue(any(GetSecretValueRequest.class)))
                .thenReturn(GetSecretValueResponse.builder()
                        .secretString("""
                                { "active": "v1", "v1": "%s" }
                                """.formatted(shortBase64))
                        .build());
        provider.invalidate();

        assertThatThrownBy(() -> provider.derivePepperUser("u1"))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("googleSub blank면 거부")
    void blankSub_throws() {
        assertThatThrownBy(() -> provider.derivePepperUser(""))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> provider.derivePepperUser(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // --- 참조 HKDF (RFC 5869) — 별도 구현으로 자가 검증 ---
    private static byte[] referenceHkdfSha256(byte[] ikm, byte[] salt, byte[] info, int length) {
        try {
            byte[] effectiveSalt = (salt == null || salt.length == 0) ? new byte[32] : salt;
            Mac extract = Mac.getInstance("HmacSHA256");
            extract.init(new SecretKeySpec(effectiveSalt, "HmacSHA256"));
            byte[] prk = extract.doFinal(ikm);

            Mac expand = Mac.getInstance("HmacSHA256");
            expand.init(new SecretKeySpec(prk, "HmacSHA256"));
            byte[] out = new byte[length];
            byte[] t = new byte[0];
            int written = 0;
            for (int i = 1; written < length; i++) {
                expand.reset();
                expand.update(t);
                expand.update(info);
                expand.update((byte) i);
                t = expand.doFinal();
                int copy = Math.min(t.length, length - written);
                System.arraycopy(t, 0, out, written, copy);
                written += copy;
            }
            return out;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static byte[] repeat(byte b, int len) {
        byte[] out = new byte[len];
        for (int i = 0; i < len; i++) out[i] = b;
        return out;
    }
}
