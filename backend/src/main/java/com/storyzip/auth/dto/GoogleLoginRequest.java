package com.storyzip.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record GoogleLoginRequest(
        @NotBlank String code,
        @NotBlank String codeVerifier,
        @NotBlank String redirectUri,
        @NotBlank String deviceId
) {
}
