package com.storyzip.auth.dto;

/**
 * AT/RT 회전 응답.
 *
 * <p>{@code encryption} — KEK 도출 재료. 웹 refresh 경로에서도 함께 내려주어,
 * 브라우저 IndexedDB가 비워지거나 pepper 회전이 일어났을 때 새로고침만으로 자가 복원되게 한다.
 * Pepper Provider 비활성 시 {@code null}. Electron의 `/auth/refresh`도 동일 응답을 사용하지만
 * 클라이언트는 safeStorage 기반 `restoreKek`을 우선 사용하므로 추가 필드를 단순 무시한다.
 */
public record AccessTokenResponse(
        String accessToken,
        String refreshToken,
        LoginResponse.EncryptionMaterial encryption
) {
}
