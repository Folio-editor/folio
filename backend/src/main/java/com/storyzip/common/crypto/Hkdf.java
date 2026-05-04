package com.storyzip.common.crypto;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.security.GeneralSecurityException;
import java.util.Arrays;

/**
 * RFC 5869 HKDF-SHA256.
 *
 * <p>Plan C 결정 12의 HKDF 입력 매핑(IKM/salt/info 자리)을 그대로 따르기 위해
 * 외부 의존성 없이 javax.crypto.Mac 으로 직접 구현한다.
 *
 * <p>호출자는 사용 직후 반환된 byte[]를 {@link #zeroize(byte[])} 로 명시 폐기해야 한다 (결정 16).
 */
public final class Hkdf {

    private static final String HMAC_SHA256 = "HmacSHA256";
    private static final int HASH_LEN = 32;

    private Hkdf() {}

    public static byte[] deriveKey(byte[] ikm, byte[] salt, byte[] info, int length) {
        if (length <= 0 || length > 255 * HASH_LEN) {
            throw new IllegalArgumentException("HKDF length out of range: " + length);
        }
        byte[] prk = extract(salt, ikm);
        try {
            return expand(prk, info, length);
        } finally {
            zeroize(prk);
        }
    }

    private static byte[] extract(byte[] salt, byte[] ikm) {
        try {
            byte[] effectiveSalt = (salt == null || salt.length == 0) ? new byte[HASH_LEN] : salt;
            Mac mac = Mac.getInstance(HMAC_SHA256);
            mac.init(new SecretKeySpec(effectiveSalt, HMAC_SHA256));
            return mac.doFinal(ikm);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HKDF extract failed", e);
        }
    }

    private static byte[] expand(byte[] prk, byte[] info, int length) {
        try {
            Mac mac = Mac.getInstance(HMAC_SHA256);
            mac.init(new SecretKeySpec(prk, HMAC_SHA256));
            byte[] effectiveInfo = info == null ? new byte[0] : info;

            int n = (length + HASH_LEN - 1) / HASH_LEN;
            byte[] okm = new byte[length];
            byte[] previous = new byte[0];
            int written = 0;

            for (int i = 1; i <= n; i++) {
                mac.reset();
                mac.update(previous);
                mac.update(effectiveInfo);
                mac.update((byte) i);
                previous = mac.doFinal();
                int copy = Math.min(HASH_LEN, length - written);
                System.arraycopy(previous, 0, okm, written, copy);
                written += copy;
            }
            zeroize(previous);
            return okm;
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HKDF expand failed", e);
        }
    }

    public static void zeroize(byte[] secret) {
        if (secret != null) {
            Arrays.fill(secret, (byte) 0);
        }
    }
}
