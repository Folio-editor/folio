package com.storyzip.auth.dto;

import com.storyzip.auth.domain.Role;
import com.storyzip.auth.domain.Writer;

import java.util.UUID;

public record WriterDto(
        UUID id,
        String email,
        String nickname,
        String profileImageUrl,
        Role role
) {

    public static WriterDto from(Writer writer) {
        return new WriterDto(
                writer.getId(),
                writer.getEmail(),
                writer.getNickname(),
                writer.getProfileImageUrl(),
                writer.getRole()
        );
    }
}
