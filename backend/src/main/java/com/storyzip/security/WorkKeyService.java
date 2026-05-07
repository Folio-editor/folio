package com.storyzip.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.storyzip.sync.repository.WorkRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.UUID;

/**
 * work_id → 평문 work_key 해석. server_encrypted_dek 를 KmsService 로 unwrap 한 결과를
 * 짧은 TTL Caffeine 캐시로 보관 (Vault 호출 횟수 최소화).
 *
 * <p>호출자는 {@link #resolveWorkKey} 결과 바이트를 사용 직후 변수 해제. 캐시는 자체적으로
 * TTL 만료 시 Java GC 가 zeroize 비대칭 회수 (Java 한계 — Cleaner/SecretKeySpec 미사용).
 *
 * <p>NULL 반환: 작품의 server_encrypted_dek 가 NULL (오프라인 신규 작품) 인 경우.
 * 호출자는 NULL 시 AI 인덱싱·복호화 skip 해야 함.
 *
 * <p>curious-wiggling-thacker plan V-2.
 */
@Slf4j
@Service
@ConditionalOnBean(KmsService.class)
public class WorkKeyService {

    private final KmsService kms;
    private final WorkRepository workRepo;
    private final Cache<UUID, byte[]> cache;

    public WorkKeyService(
            KmsService kms,
            WorkRepository workRepo,
            @Value("${folio.security.vault.cache-ttl-seconds:300}") int cacheTtlSeconds) {
        this.kms = kms;
        this.workRepo = workRepo;
        this.cache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(cacheTtlSeconds))
                .maximumSize(1000)
                .build();
    }

    /**
     * @return 평문 work_key, 또는 server_encrypted_dek 가 NULL 이면 null
     */
    public byte[] resolveWorkKey(UUID workId) {
        byte[] cached = cache.getIfPresent(workId);
        if (cached != null) return cached.clone();  // 호출자가 zero-out 해도 캐시 안전

        byte[] sealed = workRepo.findById(workId)
                .map(w -> w.getServerEncryptedDek())
                .orElse(null);
        if (sealed == null) {
            log.debug("work {} server_encrypted_dek NULL (오프라인 신규 작품 또는 미발급)", workId);
            return null;
        }
        byte[] plaintext = kms.decrypt(sealed);
        cache.put(workId, plaintext);
        return plaintext.clone();
    }

    /**
     * 캐시 무효화. 작품 삭제·키 회전 시 호출.
     */
    public void invalidate(UUID workId) {
        cache.invalidate(workId);
    }
}
