package com.storyzip.auth.dto;

/**
 * 웹 OAuth 흐름의 short-lived auth_code Redis payload.
 *
 * <p>callback에서 발급되어 에디터가 {@code POST /auth/web/exchange}로 1회 소비.
 * 모든 필드를 frontend로 그대로 전달 — AT는 메모리, RT/deviceId/writer는 localStorage 저장.
 */
public record OAuthAuthCodePayload(
        String accessToken,
        String refreshToken,
        String deviceId,
        WriterDto writer,
        boolean isNewUser
) {
}
