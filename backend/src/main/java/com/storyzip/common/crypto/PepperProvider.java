package com.storyzip.common.crypto;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * server_pepper 보관소 (Plan C 결정 6/7/12/16).
 *
 * <p>이전엔 AWS Secrets Manager 에서 로드했으나 EC2 외부 차단 환경에서 사용 불가 →
 * <b>Doppler 의 {@code SERVER_PEPPER} 환경변수</b>로 직접 주입 (32 byte base64).
 *
 * <p>HKDF-SHA256 으로 사용자별 / PII용 파생 키를 만든다. server_pepper 자체는 절대 외부로
 * 반환되지 않으며, 호출자는 {@link #derivePepperUser(String)} 등의 결과만 받고 사용 직후
 * {@link Hkdf#zeroize(byte[])} 로 폐기해야 한다.
 *
 * <p>회전 정책: SERVER_PEPPER 갱신 + SERVER_PEPPER_VERSION bump + backend 재기동.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "folio.security.pepper.enabled", havingValue = "true")
public class PepperProvider implements DisposableBean {

    private static final byte[] PEPPER_USER_INFO =
            "folio-pepper-user-v1".getBytes(StandardCharsets.UTF_8);
    private static final byte[] PII_KEY_INFO =
            "folio-pii-v1".getBytes(StandardCharsets.UTF_8);
    private static final byte[] PII_SYSTEM_SALT =
            "pii-system-salt-v1".getBytes(StandardCharsets.UTF_8);
    private static final int DERIVED_KEY_LENGTH = 32;

    private final byte[] activePepper;
    private final String activeVersion;

    public PepperProvider(
            @Value("${folio.security.pepper.master-pepper-base64:}") String masterPepperBase64,
            @Value("${folio.security.pepper.version:v1}") String version) {
        if (masterPepperBase64 == null || masterPepperBase64.isBlank()) {
            throw new IllegalStateException(
                "SERVER_PEPPER 미설정. Doppler 의 SERVER_PEPPER 시크릿 등록 필요. "
                + "발급: NEW_PEPPER=$(openssl rand -base64 32 | tr -d '\\n') && doppler secrets set SERVER_PEPPER=\"$NEW_PEPPER\"");
        }
        // Doppler 또는 ENV 가 trailing whitespace/newline 붙이는 케이스 차단.
        String clean = masterPepperBase64.replaceAll("\\s+", "");
        byte[] decoded = Base64.getDecoder().decode(clean);
        if (decoded.length != 32) {
            Hkdf.zeroize(decoded);
            throw new IllegalStateException(
                "SERVER_PEPPER must be 32 bytes (base64 of 32B), got " + decoded.length);
        }
        this.activePepper = decoded;
        this.activeVersion = version;
        log.info("PepperProvider 초기화: version={}, source=ENV(SERVER_PEPPER)", version);
    }

    /**
     * 사용자별 pepper_user 도출. 클라이언트에 1회 전달용.
     *
     * <p>HKDF(IKM=server_pepper, salt=google_sub, info="folio-pepper-user-v1") → 32B
     */
    public DerivedKey derivePepperUser(String googleSub) {
        if (googleSub == null || googleSub.isBlank()) {
            throw new IllegalArgumentException("googleSub must not be blank");
        }
        byte[] salt = googleSub.getBytes(StandardCharsets.UTF_8);
        byte[] derived = Hkdf.deriveKey(activePepper, salt, PEPPER_USER_INFO, DERIVED_KEY_LENGTH);
        return new DerivedKey(derived, activeVersion);
    }

    /**
     * PII 시스템 키 도출. 모든 사용자 email/phone 암호화에 공통 사용.
     *
     * <p>HKDF(IKM=server_pepper, salt="pii-system-salt-v1", info="folio-pii-v1") → 32B
     */
    public DerivedKey derivePiiKey() {
        byte[] derived = Hkdf.deriveKey(activePepper, PII_SYSTEM_SALT, PII_KEY_INFO, DERIVED_KEY_LENGTH);
        return new DerivedKey(derived, activeVersion);
    }

    /**
     * email_hash = HKDF(server_pepper, email_lowercase, "folio-email-hash-v1") → 32B.
     * 무지개 테이블 방어용.
     */
    public byte[] hashEmail(String emailLowercase) {
        if (emailLowercase == null) throw new IllegalArgumentException("email must not be null");
        byte[] msg = emailLowercase.getBytes(StandardCharsets.UTF_8);
        return Hkdf.deriveKey(activePepper, msg,
                "folio-email-hash-v1".getBytes(StandardCharsets.UTF_8), 32);
    }

    @Override
    public void destroy() {
        Hkdf.zeroize(activePepper);
    }

    /**
     * derive* 결과. 호출자는 사용 후 반드시 {@link #destroy()} 를 호출해야 한다.
     */
    public record DerivedKey(byte[] keyBytes, String pepperVersion) implements AutoCloseable {

        public String keyBase64() {
            return Base64.getEncoder().encodeToString(keyBytes);
        }

        public void destroy() {
            Hkdf.zeroize(keyBytes);
        }

        @Override
        public void close() {
            destroy();
        }
    }
}
