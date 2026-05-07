package com.storyzip.security;

/**
 * Envelope encryption 추상화. 구현체는 KEK 자체를 외부에 노출하지 않고
 * encrypt/decrypt API 만 제공한다 (Vault Transit / AWS KMS 등 교체 가능).
 *
 * curious-wiggling-thacker plan V-2.
 */
public interface KmsService {

    /**
     * 평문 바이트를 envelope ciphertext 로 wrap. 결과 바이트는 BYTEA 컬럼에 그대로 저장 가능.
     */
    byte[] encrypt(byte[] plaintext);

    /**
     * envelope ciphertext 를 평문으로 unwrap. 호출자는 평문 메모리를 즉시 폐기해야 함.
     */
    byte[] decrypt(byte[] ciphertext);
}
