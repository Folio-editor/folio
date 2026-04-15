package com.storyzip.auth.dto;

public record LoginResponse(String accessToken, String refreshToken, WriterDto writer) {
}
