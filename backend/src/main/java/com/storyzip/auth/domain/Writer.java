package com.storyzip.auth.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 사용자(작가) 엔티티 — writer 테이블.
 *
 * <p>OAuth 전용 사용자는 {@code passwordHash}가 NULL.
 * <p>회원 탈퇴 시 {@code deletedAt} 에 타임스탬프를 기록하는 소프트 삭제 적용.
 * <p>{@code createdAt}는 Spring Data Auditing으로 자동 설정.
 */
@Entity
@Table(name = "writer")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class Writer {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "UUID")
    private UUID id;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "password_hash", length = 255)
    private String passwordHash;

    @Column(length = 100)
    private String nickname;

    @Column(name = "profile_image_url", columnDefinition = "TEXT")
    private String profileImageUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    @Column(name = "oauth_provider", length = 50)
    private String oauthProvider;

    @Column(name = "oauth_id", length = 255)
    private String oauthId;

    /**
     * Plan C 결정 14 — KEK 도출 입력 user_salt.
     *
     * <p>16~32B 랜덤. 서버에서 1회 생성하여 평문 저장하고, 매 로그인 응답으로 클라이언트에 전달한다.
     * PowerSync 동기화 대상에서 제외(sync-rules.yaml에서 select 미포함).
     */
    @Column(name = "encryption_salt", columnDefinition = "BYTEA")
    private byte[] encryptionSalt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Builder
    private Writer(String email, String passwordHash, String nickname, String profileImageUrl,
                   Role role, String oauthProvider, String oauthId, byte[] encryptionSalt) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.nickname = nickname;
        this.profileImageUrl = profileImageUrl;
        this.role = role != null ? role : Role.USER;
        this.oauthProvider = oauthProvider;
        this.oauthId = oauthId;
        this.encryptionSalt = encryptionSalt;
    }

    /** 레거시 사용자 백필 — 기존엔 NULL일 수 있으므로 첫 로그인 시 생성하여 채운다. */
    public void assignEncryptionSaltIfMissing(byte[] salt) {
        if (this.encryptionSalt == null || this.encryptionSalt.length == 0) {
            this.encryptionSalt = salt;
        }
    }

    public void updateProfile(String nickname, String profileImageUrl) {
        if (nickname != null) this.nickname = nickname;
        if (profileImageUrl != null) this.profileImageUrl = profileImageUrl;
    }

    public void softDelete() {
        this.deletedAt = LocalDateTime.now();
    }

    /** 30일 내 복구 시 호출 — deleted_at 초기화. */
    public void restoreFromWithdrawal() {
        this.deletedAt = null;
    }

    public boolean isDeleted() {
        return this.deletedAt != null;
    }
}
