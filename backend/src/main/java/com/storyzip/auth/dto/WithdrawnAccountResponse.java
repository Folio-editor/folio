package com.storyzip.auth.dto;

import java.time.LocalDateTime;

/**
 * 탈퇴 처리된 계정으로 로그인을 시도했을 때의 응답 (HTTP 409).
 *
 * <p>클라이언트는 이 응답을 받으면 "복구하시겠습니까?" 다이얼로그를 띄우고,
 * 사용자 동의 시 {@code POST /api/v1/auth/restore} 로 새 Google code 와 함께 복구 요청한다.
 *
 * <p>※ {@code deletedAt} / {@code restorableUntil} 은 String 으로 직렬화한다.
 * Jackson 의 LocalDateTime 직렬화 형식이 환경(JavaTimeModule 활성 여부)마다 달라질 수 있어
 * 클라이언트가 array 와 string 을 동시에 받아야 하는 불편을 막기 위해 명시적 ISO-8601 문자열 사용.
 *
 * @param status            항상 "withdrawn" — 클라이언트가 응답 분기에 사용
 * @param deletedAt         탈퇴 처리된 시각 (ISO-8601 문자열)
 * @param restorableUntil   30일 후 자동 영구삭제 시각 (ISO-8601 문자열) — 그 이전까지는 복구 가능
 */
public record WithdrawnAccountResponse(
        String status,
        String deletedAt,
        String restorableUntil
) {
    public static WithdrawnAccountResponse of(LocalDateTime deletedAt, LocalDateTime restorableUntil) {
        return new WithdrawnAccountResponse("withdrawn", deletedAt.toString(), restorableUntil.toString());
    }
}
