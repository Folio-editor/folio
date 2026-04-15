package com.storyzip.auth.domain;

/**
 * 사용자 권한.
 */
public enum Role {
    USER,
    PREMIUM,
    ADMIN;

    public String toAuthority() {
        return "ROLE_" + name();
    }
}
