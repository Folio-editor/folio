package com.storyzip.auth.dto;

/**
 * 웹 쿠키 기반 refresh 응답.
 * RT는 httpOnly 쿠키로 갱신되므로 body에는 AT만 노출한다.
 */
public record WebAccessTokenResponse(String accessToken) {
}
