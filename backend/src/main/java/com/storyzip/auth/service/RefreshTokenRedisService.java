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
 * <p>Key 구조: {@code RT:{writerId}:{deviceId}} — 기기별로 분리하여 다중 로그인 지원.
 * <p>TTL은 Refresh Token 만료 시간과 동일하게 설정하여 만료 후 자동 삭제.
 *
 * <p>주요 시나리오:
 * <ul>
 *   <li>로그인: {@link #save(UUID, String, String, long)} — 해당 기기 토큰 저장/갱신</li>
 *   <li>재발급(RTR): {@link #save}로 덮어쓰기 → 기존 토큰 자동 무효화</li>
 *   <li>단일 기기 로그아웃: {@link #delete(UUID, String)}</li>
 *   <li>전체 기기 로그아웃: {@link #deleteAllDevices(UUID)}</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class RefreshTokenRedisService {

    private static final String KEY_PREFIX = "RT:";

    private final StringRedisTemplate redisTemplate;

    /**
     * Refresh Token을 Redis에 저장한다. 같은 기기에 기존 토큰이 있으면 덮어쓴다.
     *
     * @param writerId 사용자 ID
     * @param deviceId 기기 식별자 (클라이언트가 발급한 고유 ID)
     * @param token    Refresh Token 문자열
     * @param ttlSeconds 만료 시간(초)
     */
    public void save(UUID writerId, String deviceId, String token, long ttlSeconds) {
        String key = buildKey(writerId, deviceId);
        redisTemplate.opsForValue().set(key, token, ttlSeconds, TimeUnit.SECONDS);
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
     * 특정 기기의 Refresh Token을 삭제한다 (해당 기기 로그아웃).
     */
    public void delete(UUID writerId, String deviceId) {
        redisTemplate.delete(buildKey(writerId, deviceId));
    }

    /**
     * 해당 사용자의 모든 기기 Refresh Token을 삭제한다 (전체 로그아웃 / 회원 탈퇴).
     */
    public void deleteAllDevices(UUID writerId) {
        Set<String> keys = redisTemplate.keys(KEY_PREFIX + writerId + ":*");
        if (keys != null && !keys.isEmpty()) {
            redisTemplate.delete(keys);
        }
    }

    private String buildKey(UUID writerId, String deviceId) {
        return KEY_PREFIX + writerId + ":" + deviceId;
    }
}
