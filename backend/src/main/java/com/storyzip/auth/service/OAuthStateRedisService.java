package com.storyzip.auth.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * OAuth state Redis 저장소 — CSRF 방지용 short-lived state 관리.
 *
 * <p>왜 Redis인가: 쿠키 기반 state 검증은 cross-site navigation
 * (예: localhost:5174 랜딩 → localhost:8080 백엔드) 시 일부 브라우저가
 * Set-Cookie를 거부하는 케이스가 있어 신뢰할 수 없다. Redis는 server-side라
 * 클라이언트 환경 영향 없음.
 *
 * <p>흐름:
 * <ol>
 *   <li>{@code GET /auth/google/web/start} — state 생성, returnTo와 함께 Redis에 5분 TTL로 저장</li>
 *   <li>{@code GET /auth/google/web/callback?state=...} — Redis lookup으로 returnTo 회복 + 즉시 삭제 (1회 소비)</li>
 * </ol>
 *
 * <p>CSRF 방지: state는 random UUID라 attacker가 추측 불가.
 * 1회 소비 + 5분 TTL로 재사용 차단.
 */
@Service
@RequiredArgsConstructor
public class OAuthStateRedisService {

    private static final String KEY_PREFIX = "OAUTH_STATE:";
    private static final Duration TTL = Duration.ofMinutes(5);

    private final StringRedisTemplate redisTemplate;

    /**
     * state를 Redis에 5분 TTL로 저장. value는 returnTo path.
     */
    public void saveState(String state, String returnTo) {
        redisTemplate.opsForValue().set(KEY_PREFIX + state, returnTo, TTL);
    }

    /**
     * state로 returnTo 회복 + 즉시 삭제 (1회 소비).
     *
     * @return 저장된 returnTo. state가 없거나 만료됐으면 null.
     */
    public String consumeState(String state) {
        if (state == null || state.isBlank()) return null;
        String key = KEY_PREFIX + state;
        String returnTo = redisTemplate.opsForValue().get(key);
        if (returnTo != null) {
            redisTemplate.delete(key);
        }
        return returnTo;
    }
}
