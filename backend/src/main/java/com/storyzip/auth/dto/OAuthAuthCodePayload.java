package com.storyzip.auth.dto;

/**
 * 웹 OAuth 흐름의 short-lived auth_code Redis payload.
 *
 * <p>callback에서 발급되어 에디터가 {@code POST /auth/web/exchange}로 1회 소비.
 * 모든 필드를 frontend로 그대로 전달 — AT는 메모리, RT/deviceId/writer는 localStorage 저장.
 *
 * <p>{@code encryption} — Plan C 결정 7/14. 데스크톱 {@link LoginResponse}와 1:1 매핑되는
 * KEK 도출 재료. Pepper Provider 비활성 환경에서는 {@code null}로 내려가며 클라이언트는
 * KEK 도출을 건너뛴다. <b>웹 흐름은 OAuth 콜백이 풀페이지 redirect로 끝나서 frontend의
 * {@code login()} 액션이 resolve 되지 않으므로, 이 페이로드가 유일한 KEK 재료 전달 채널이다.</b>
 * 누락 시 v1: ciphertext가 메인탭/사이드바/AuxDocViewer/Agent 미리보기에 그대로 노출된다.
 */
public record OAuthAuthCodePayload(
        String accessToken,
        String refreshToken,
        String deviceId,
        WriterDto writer,
        boolean isNewUser,
        LoginResponse.EncryptionMaterial encryption
) {
}
