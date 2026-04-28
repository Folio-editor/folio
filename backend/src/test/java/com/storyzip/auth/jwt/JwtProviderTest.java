package com.storyzip.auth.jwt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtProviderTest {

    @Test
    @DisplayName("secret이 null이면 startup 시 IllegalStateException")
    void nullSecret_failsFast() {
        JwtProperties props = new JwtProperties();
        props.setSecret(null);

        JwtProvider provider = new JwtProvider(props);

        assertThatThrownBy(provider::validateSecret)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JWT_SECRET");
    }

    @Test
    @DisplayName("secret이 32바이트 미만이면 startup 시 IllegalStateException")
    void shortSecret_failsFast() {
        JwtProperties props = new JwtProperties();
        props.setSecret("too-short");

        JwtProvider provider = new JwtProvider(props);

        assertThatThrownBy(provider::validateSecret)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32바이트");
    }

    @Test
    @DisplayName("secret이 32바이트 이상이면 startup 통과")
    void validSecret_passes() {
        JwtProperties props = new JwtProperties();
        props.setSecret("a".repeat(32));

        JwtProvider provider = new JwtProvider(props);

        assertThatCode(provider::validateSecret).doesNotThrowAnyException();
    }
}
