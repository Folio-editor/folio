package com.storyzip.auth.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.storyzip.auth.dto.OAuthAuthCodePayload;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * OAuth auth_code Redis 저장소 — 백엔드 callback에서 발급된 토큰들을 frontend가
 * 1회 교환받기 위한 short-lived 매개체.
 *
 * <p>왜 필요한가: cross-port localhost 환경에서 RT/AT를 쿠키로 전달하면 브라우저
 * cross-site 정책으로 거부되는 케이스가 있다. auth_code는 단순 query 파라미터라
 * 쿠키 정책 영향 없음. Electron의 PKCE 흐름이 token JSON 응답을 frontend가
 * 직접 받는 구조와 일치한다.
 *
 * <p>흐름:
 * <ol>
 *   <li>{@code GET /auth/google/web/callback} — Google에서 받은 code를 token으로 교환 + auth_code 발급</li>
 *   <li>에디터로 {@code ?auth_code=xxx} redirect</li>
 *   <li>{@code POST /auth/web/exchange?code=xxx} — Redis에서 1회 소비 → AT/RT JSON 응답</li>
 * </ol>
 *
 * <p>보안: auth_code는 random UUID + 2분 TTL + 1회 소비. 짧은 TTL로 가로채기 위험 최소화.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OAuthAuthCodeRedisService {

    private static final String KEY_PREFIX = "OAUTH_AUTH_CODE:";
    private static final Duration TTL = Duration.ofMinutes(2);

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    /**
     * auth_code에 토큰 payload를 매핑하여 Redis에 저장.
     */
    public void saveCode(String code, OAuthAuthCodePayload payload) {
        try {
            String json = objectMapper.writeValueAsString(payload);
            redisTemplate.opsForValue().set(KEY_PREFIX + code, json, TTL);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("auth_code payload 직렬화 실패", e);
        }
    }

    /**
     * auth_code로 payload 회복 + 즉시 삭제 (1회 소비).
     *
     * @return 저장된 payload. code가 없거나 만료/이미 소비됐으면 null.
     */
    public OAuthAuthCodePayload consumeCode(String code) {
        if (code == null || code.isBlank()) return null;
        String key = KEY_PREFIX + code;
        String json = redisTemplate.opsForValue().get(key);
        if (json == null) return null;
        redisTemplate.delete(key);
        try {
            return objectMapper.readValue(json, OAuthAuthCodePayload.class);
        } catch (JsonProcessingException e) {
            log.warn("auth_code payload 역직렬화 실패: {}", e.getMessage());
            return null;
        }
    }
}
