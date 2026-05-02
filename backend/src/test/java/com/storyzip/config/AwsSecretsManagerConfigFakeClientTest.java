package com.storyzip.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.storyzip.common.crypto.PepperProvider;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueResponse;

import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * dev 프로필이 주입하는 FakeSecretsManagerClient가 PepperProvider의
 * 32B 검증을 통과하고, derivePepperUser가 결정적으로 동작하는지 확인.
 */
class AwsSecretsManagerConfigFakeClientTest {

    @Test
    @DisplayName("Fake client는 32B base64 pepper를 담은 시크릿 JSON을 반환한다")
    void fakeReturns32BytePepper() throws Exception {
        SecretsManagerClient client = new AwsSecretsManagerConfig.FakeSecretsManagerClient();

        GetSecretValueResponse res = client.getSecretValue(
                GetSecretValueRequest.builder().secretId("folio/encryption/pepper").build());

        ObjectMapper om = new ObjectMapper();
        var root = om.readTree(res.secretString());
        String active = root.get("active").asText();
        byte[] pepper = Base64.getDecoder().decode(root.get(active).asText());

        assertThat(active).isEqualTo("v1");
        assertThat(pepper).hasSize(32);
    }

    @Test
    @DisplayName("Fake client + PepperProvider — derivePepperUser 결과는 결정적")
    void deterministicAcrossCalls() {
        PepperProvider p1 = new PepperProvider(
                new AwsSecretsManagerConfig.FakeSecretsManagerClient(),
                new ObjectMapper(),
                "folio/encryption/pepper");
        PepperProvider p2 = new PepperProvider(
                new AwsSecretsManagerConfig.FakeSecretsManagerClient(),
                new ObjectMapper(),
                "folio/encryption/pepper");

        try (var d1 = p1.derivePepperUser("google-sub-abc");
             var d2 = p2.derivePepperUser("google-sub-abc")) {
            assertThat(d1.keyBase64()).isEqualTo(d2.keyBase64());
            assertThat(d1.pepperVersion()).isEqualTo("v1");
            assertThat(Base64.getDecoder().decode(d1.keyBase64())).hasSize(32);
        }
    }
}
