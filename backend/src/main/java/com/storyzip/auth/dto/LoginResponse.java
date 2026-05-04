package com.storyzip.auth.dto;

/**
 * 로그인 응답.
 *
 * <p>{@code isNewUser} — 이번 로그인에서 writer가 새로 생성됐는지.
 * 클라이언트는 이 값으로 게스트 로컬 데이터 처리 방식을 결정한다.
 * <ul>
 *   <li>{@code true}  — 신규 가입. 서버 데이터 확정 0건 → 로컬 백업해도 안전</li>
 *   <li>{@code false} — 기존 회원. 서버 데이터가 있을 가능성 → 서버 우선, 로컬은 폐기되어야 함</li>
 * </ul>
 *
 * <p>{@code encryption} — Plan C 결정 7/14의 KEK 도출 재료.
 * server_pepper 노출 없이 사용자별 파생값(pepper_user) + user_salt + version만 전달한다.
 * Pepper Provider가 비활성(dev/test)인 환경에서는 {@code null}이며, 클라이언트는 KEK 도출을
 * 건너뛴다(=암호화 동작 disable).
 */
public record LoginResponse(
        String accessToken,
        String refreshToken,
        WriterDto writer,
        boolean isNewUser,
        EncryptionMaterial encryption
) {

    /**
     * KEK 도출 재료 묶음.
     *
     * @param sub            Google sub. KEK 도출 info 필드("folio-kek-v1:" + sub)에 사용
     * @param salt           Base64-encoded user_salt (writer.encryption_salt)
     * @param pepperUser     Base64-encoded pepper_user = HKDF(server_pepper, sub, "folio-pepper-user-v1")
     * @param pepperVersion  현재 활성 server_pepper 버전 (예: "v1") — 회전 감지용
     */
    public record EncryptionMaterial(
            String sub,
            String salt,
            String pepperUser,
            String pepperVersion
    ) {
    }
}
