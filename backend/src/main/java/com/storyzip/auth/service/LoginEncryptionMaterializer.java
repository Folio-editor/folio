package com.storyzip.auth.service;

import com.storyzip.auth.domain.Writer;
import com.storyzip.auth.dto.LoginResponse;
import com.storyzip.common.crypto.PepperProvider;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Optional;

/**
 * Plan C 결정 7/14 — 로그인 응답에 KEK 도출 재료를 부착한다.
 *
 * <p>{@link PepperProvider}가 활성(folio.security.pepper.enabled=true)일 때만 동작하며,
 * 비활성 시(dev/test 기본) {@code null}을 반환한다.
 *
 * <p>책임:
 * <ol>
 *   <li>레거시 / 신규 Writer에게 32B 랜덤 user_salt 백필</li>
 *   <li>HKDF로 사용자별 pepper_user 도출 (server_pepper는 메모리에만 머무름)</li>
 *   <li>{ sub, salt, pepperUser, pepperVersion } 응답 묶음 생성</li>
 *   <li>derived 키 byte[] 즉시 zeroize</li>
 * </ol>
 */
@Slf4j
@Component
public class LoginEncryptionMaterializer {

    private static final int USER_SALT_BYTES = 32;

    private final Optional<PepperProvider> pepperProvider;
    private final SecureRandom secureRandom = new SecureRandom();

    public LoginEncryptionMaterializer(Optional<PepperProvider> pepperProvider) {
        this.pepperProvider = pepperProvider;
    }

    public boolean isEnabled() {
        return pepperProvider.isPresent();
    }

    /**
     * Writer에 user_salt가 없으면 발급(메모리에만 채움 — 영속화는 호출자의 @Transactional 책임).
     * 활성 시 EncryptionMaterial을 반환, 비활성 시 null.
     */
    public LoginResponse.EncryptionMaterial materialize(Writer writer) {
        if (pepperProvider.isEmpty()) {
            return null;
        }
        ensureSalt(writer);

        String sub = writer.getOauthId();
        if (sub == null || sub.isBlank()) {
            // OAuth 미연동 사용자(passwordHash만 있는 레거시) — KEK 흐름 미적용
            return null;
        }

        try (PepperProvider.DerivedKey derived = pepperProvider.get().derivePepperUser(sub)) {
            return new LoginResponse.EncryptionMaterial(
                    sub,
                    Base64.getEncoder().encodeToString(writer.getEncryptionSalt()),
                    derived.keyBase64(),
                    derived.pepperVersion()
            );
        }
    }

    private void ensureSalt(Writer writer) {
        if (writer.getEncryptionSalt() == null || writer.getEncryptionSalt().length == 0) {
            byte[] salt = new byte[USER_SALT_BYTES];
            secureRandom.nextBytes(salt);
            writer.assignEncryptionSaltIfMissing(salt);
            log.info("user_salt backfilled for writer={}", writer.getId());
        }
    }
}
