package com.storyzip.auth.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * Refresh Token Redis 저장소.
 *
 * <p>Key 구조:
 * <ul>
 *   <li>정방향 {@code RT:{writerId}:{deviceId}} → token — 기기별 다중 로그인 지원</li>
 *   <li>역방향 {@code RT_REV:{token}} → {@code "{writerId}:{deviceId}"} — 토큰만으로 사용자 식별
 *       (웹 쿠키 기반 refresh에서 사용)</li>
 * </ul>
 * <p>TTL은 Refresh Token 만료 시간과 동일하게 설정하여 만료 후 자동 삭제.
 *
 * <p>주요 시나리오:
 * <ul>
 *   <li>로그인: {@link #save(UUID, String, String, long)} — 해당 기기 토큰 저장/갱신</li>
 *   <li>재발급(RTR): {@link #save}로 덮어쓰기 → 기존 토큰 자동 무효화</li>
 *   <li>단일 기기 로그아웃: {@link #delete(UUID, String)}</li>
 *   <li>전체 기기 로그아웃: {@link #deleteAllDevices(UUID)}</li>
 *   <li>쿠키 기반 refresh: {@link #findOwner(String)} — 토큰만으로 (writerId, deviceId) 조회</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class RefreshTokenRedisService {

    private static final String KEY_PREFIX = "RT:";
    private static final String REV_PREFIX = "RT_REV:";

    private final StringRedisTemplate redisTemplate;

    /**
     * Refresh Token을 Redis에 저장한다. 같은 기기에 기존 토큰이 있으면 덮어쓴다.
     * 정방향 키와 역방향 키를 모두 갱신하며, 이전 토큰의 역방향 키는 삭제한다.
     *
     * @param writerId 사용자 ID
     * @param deviceId 기기 식별자 (클라이언트가 발급한 고유 ID)
     * @param token    Refresh Token 문자열
     * @param ttlSeconds 만료 시간(초)
     */
    public void save(UUID writerId, String deviceId, String token, long ttlSeconds) {
        String fwdKey = buildKey(writerId, deviceId);
        // 회전 시 이전 토큰의 역방향 키를 정리해야 reverse-lookup이 정확히 동작
        String previousToken = redisTemplate.opsForValue().get(fwdKey);
        if (previousToken != null && !previousToken.equals(token)) {
            redisTemplate.delete(REV_PREFIX + previousToken);
        }
        redisTemplate.opsForValue().set(fwdKey, token, ttlSeconds, TimeUnit.SECONDS);
        redisTemplate.opsForValue().set(REV_PREFIX + token, writerId + ":" + deviceId, ttlSeconds, TimeUnit.SECONDS);
    }

    /**
     * 해당 기기에 저장된 Refresh Token을 조회한다.
     *
     * @return 저장된 토큰. 없으면 null.
     */
    public String find(UUID writerId, String deviceId) {
        return redisTemplate.opsForValue().get(buildKey(writerId, deviceId));
    }

    /**
     * Refresh Token으로부터 소유자(writerId, deviceId)를 역조회한다.
     * 웹 쿠키 기반 refresh 흐름에서 사용 — 클라이언트가 writerId를 전달하지 않기 때문.
     *
     * @return 소유자 정보. 토큰이 만료/삭제됐으면 null.
     */
    public Owner findOwner(String token) {
        String value = redisTemplate.opsForValue().get(REV_PREFIX + token);
        if (value == null) return null;
        int sep = value.indexOf(':');
        if (sep <= 0) return null;
        try {
            UUID writerId = UUID.fromString(value.substring(0, sep));
            String deviceId = value.substring(sep + 1);
            return new Owner(writerId, deviceId);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /**
     * 특정 기기의 Refresh Token을 삭제한다 (해당 기기 로그아웃).
     * 역방향 키도 함께 삭제한다.
     */
    public void delete(UUID writerId, String deviceId) {
        String fwdKey = buildKey(writerId, deviceId);
        String token = redisTemplate.opsForValue().get(fwdKey);
        if (token != null) {
            redisTemplate.delete(REV_PREFIX + token);
        }
        redisTemplate.delete(fwdKey);
    }

    /**
     * 해당 사용자의 모든 기기 Refresh Token을 삭제한다 (전체 로그아웃 / 회원 탈퇴).
     * 역방향 키도 함께 정리한다.
     */
    public void deleteAllDevices(UUID writerId) {
        Set<String> keys = redisTemplate.keys(KEY_PREFIX + writerId + ":*");
        if (keys == null || keys.isEmpty()) return;
        // 역방향 키 정리를 위해 토큰 값들을 먼저 모은다
        for (String key : keys) {
            String token = redisTemplate.opsForValue().get(key);
            if (token != null) {
                redisTemplate.delete(REV_PREFIX + token);
            }
        }
        redisTemplate.delete(keys);
    }

    private String buildKey(UUID writerId, String deviceId) {
        return KEY_PREFIX + writerId + ":" + deviceId;
    }

    /** Refresh Token 소유자 정보 (역조회 결과). */
    public record Owner(UUID writerId, String deviceId) {
    }
}
