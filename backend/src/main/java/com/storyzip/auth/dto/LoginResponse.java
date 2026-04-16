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
 */
public record LoginResponse(
        String accessToken,
        String refreshToken,
        WriterDto writer,
        boolean isNewUser
) {
}
