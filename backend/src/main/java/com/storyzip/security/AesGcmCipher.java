package com.storyzip.security;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

/**
 * 클라이언트 cipher.ts 와 동일 포맷 AES-256-GCM 복호화.
 *
 * <p>포맷: "v1:" + base64(IV(12B) || ciphertext || tag(16B))
 *
 * <p>curious-wiggling-thacker plan V-7. AI 인덱싱 경로 (InternalDecryptController) 에서만
 * 사용. 평문은 메모리에만, 로그·DB 0.
 */
public final class AesGcmCipher {

    private static final String PREFIX = "v1:";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private static final SecureRandom RANDOM = new SecureRandom();

    private AesGcmCipher() {}

    /**
     * @param workKey 32B AES key
     * @param plaintext UTF-8 평문 — null/빈 문자열은 그대로 반환 (게스트/평문 호환)
     * @return "v1:" prefixed base64. 클라이언트 cipher.ts encryptString 결과와 동일 포맷.
     */
    public static String encryptString(byte[] workKey, String plaintext) {
        if (plaintext == null || plaintext.isEmpty()) {
            return plaintext;
        }
        if (plaintext.startsWith(PREFIX)) {
            // 이미 ciphertext — 이중 암호화 방지
            return plaintext;
        }
        byte[] iv = new byte[IV_BYTES];
        RANDOM.nextBytes(iv);
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(workKey, "AES"),
                    new GCMParameterSpec(TAG_BITS, iv));
            byte[] ct = c.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] all = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, all, 0, iv.length);
            System.arraycopy(ct, 0, all, iv.length, ct.length);
            return PREFIX + Base64.getEncoder().encodeToString(all);
        } catch (Exception e) {
            throw new IllegalStateException("AES-GCM encrypt failed", e);
        }
    }

    /**
     * @param workKey 32B AES key
     * @param payload "v1:" prefixed base64 string
     * @return 평문 UTF-8 문자열, 또는 payload 가 null/빈/non-cipher 면 그대로 반환 (게스트 모드 호환)
     */
    public static String decryptString(byte[] workKey, String payload) {
        if (payload == null || payload.isEmpty() || !payload.startsWith(PREFIX)) {
            return payload;
        }
        byte[] all = Base64.getDecoder().decode(payload.substring(PREFIX.length()));
        if (all.length < IV_BYTES + (TAG_BITS / 8)) {
            throw new IllegalArgumentException("ciphertext too short");
        }
        byte[] iv = Arrays.copyOfRange(all, 0, IV_BYTES);
        byte[] ct = Arrays.copyOfRange(all, IV_BYTES, all.length);
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(workKey, "AES"),
                    new GCMParameterSpec(TAG_BITS, iv));
            byte[] plain = c.doFinal(ct);
            return new String(plain, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("AES-GCM decrypt failed", e);
        }
    }
}
