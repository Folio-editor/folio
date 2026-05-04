package com.storyzip.auth.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.storyzip.auth.domain.Role;
import com.storyzip.auth.domain.Writer;
import com.storyzip.auth.dto.LoginResponse;
import com.storyzip.common.crypto.PepperProvider;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueResponse;

import java.util.Base64;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class LoginEncryptionMaterializerTest {

    private static byte[] pepperBytes() {
        byte[] b = new byte[32];
        for (int i = 0; i < 32; i++) b[i] = (byte) 0xCD;
        return b;
    }

    private static String secretJson() {
        return """
                { "active": "v1", "v1": "%s" }
                """.formatted(Base64.getEncoder().encodeToString(pepperBytes()));
    }

    private PepperProvider buildProvider() {
        SecretsManagerClient client = mock(SecretsManagerClient.class);
        when(client.getSecretValue(any(GetSecretValueRequest.class)))
                .thenReturn(GetSecretValueResponse.builder().secretString(secretJson()).build());
        return new PepperProvider(client, new ObjectMapper(), "folio/encryption/pepper");
    }

    @Test
    @DisplayName("PepperProvider 비활성 시 materialize → null (KEK 흐름 disable)")
    void disabled_returnsNull() {
        LoginEncryptionMaterializer m = new LoginEncryptionMaterializer(Optional.empty());
        Writer writer = Writer.builder().email("a@b.c").oauthProvider("google").oauthId("sub-x").build();

        assertThat(m.isEnabled()).isFalse();
        assertThat(m.materialize(writer)).isNull();
    }

    @Test
    @DisplayName("활성 + salt 없는 사용자 → 32B salt 백필 후 응답에 포함")
    void enabled_backfillsSalt() {
        LoginEncryptionMaterializer m = new LoginEncryptionMaterializer(Optional.of(buildProvider()));
        Writer writer = Writer.builder().email("a@b.c").oauthProvider("google").oauthId("sub-1").build();

        LoginResponse.EncryptionMaterial mat = m.materialize(writer);

        assertThat(writer.getEncryptionSalt()).isNotNull().hasSize(32);
        assertThat(mat).isNotNull();
        assertThat(mat.sub()).isEqualTo("sub-1");
        assertThat(mat.salt()).isEqualTo(Base64.getEncoder().encodeToString(writer.getEncryptionSalt()));
        assertThat(mat.pepperVersion()).isEqualTo("v1");
        // pepper_user는 base64-encoded 32B
        assertThat(Base64.getDecoder().decode(mat.pepperUser())).hasSize(32);
    }

    @Test
    @DisplayName("OAuth sub 없는(이메일+패스워드) 레거시 사용자 → null")
    void noOauthSub_returnsNull() {
        LoginEncryptionMaterializer m = new LoginEncryptionMaterializer(Optional.of(buildProvider()));
        Writer writer = Writer.builder().email("a@b.c").passwordHash("hash").role(Role.USER).build();

        assertThat(m.materialize(writer)).isNull();
    }

    @Test
    @DisplayName("두 번째 호출에선 salt가 보존되어야 한다 (재발급 금지)")
    void secondCall_preservesSalt() {
        LoginEncryptionMaterializer m = new LoginEncryptionMaterializer(Optional.of(buildProvider()));
        Writer writer = Writer.builder().email("a@b.c").oauthProvider("google").oauthId("sub-1").build();

        m.materialize(writer);
        byte[] firstSalt = writer.getEncryptionSalt().clone();
        m.materialize(writer);

        assertThat(writer.getEncryptionSalt()).isEqualTo(firstSalt);
    }
}
