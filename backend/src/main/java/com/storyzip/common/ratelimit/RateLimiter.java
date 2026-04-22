package com.storyzip.common.ratelimit;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 인메모리 토큰 버킷 레이트 리미터.
 * 키(유저 ID 등)별로 일정 시간 내 허용 횟수를 제한한다.
 */
public class RateLimiter {

    private final int maxTokens;
    private final long refillIntervalMillis;
    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    public RateLimiter(int maxTokens, long refillIntervalMillis) {
        this.maxTokens = maxTokens;
        this.refillIntervalMillis = refillIntervalMillis;
    }

    public boolean tryConsume(String key) {
        Bucket bucket = buckets.computeIfAbsent(key, k -> new Bucket(maxTokens));
        return bucket.tryConsume(maxTokens, refillIntervalMillis);
    }

    private static class Bucket {
        private final AtomicLong tokens;
        private volatile long lastRefillTime;

        Bucket(int initial) {
            this.tokens = new AtomicLong(initial);
            this.lastRefillTime = System.currentTimeMillis();
        }

        boolean tryConsume(int maxTokens, long refillIntervalMillis) {
            refill(maxTokens, refillIntervalMillis);
            long current = tokens.get();
            while (current > 0) {
                if (tokens.compareAndSet(current, current - 1)) {
                    return true;
                }
                current = tokens.get();
            }
            return false;
        }

        private void refill(int maxTokens, long refillIntervalMillis) {
            long now = System.currentTimeMillis();
            long elapsed = now - lastRefillTime;
            if (elapsed >= refillIntervalMillis) {
                tokens.set(maxTokens);
                lastRefillTime = now;
            }
        }
    }
}
