package com.storyzip.common.circuitbreaker;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

/**
 * 간단한 서킷브레이커.
 *
 * <p>상태:
 * <ul>
 *   <li>CLOSED — 정상. 실패가 임계치에 도달하면 OPEN으로 전환</li>
 *   <li>OPEN — 차단. 요청을 즉시 거부. 대기 시간 경과 후 HALF_OPEN으로 전환</li>
 *   <li>HALF_OPEN — 시험. 1건 통과시켜 성공하면 CLOSED, 실패하면 다시 OPEN</li>
 * </ul>
 */
public class CircuitBreaker {

    public enum State { CLOSED, OPEN, HALF_OPEN }

    private static final Logger log = LoggerFactory.getLogger(CircuitBreaker.class);

    private final int failureThreshold;
    private final long openDurationMillis;
    private final String name;
    private final AtomicInteger failureCount = new AtomicInteger(0);
    private final AtomicLong lastFailureTime = new AtomicLong(0);
    private volatile State state = State.CLOSED;

    public CircuitBreaker(int failureThreshold, long openDurationMillis) {
        this(failureThreshold, openDurationMillis, "circuit-breaker");
    }

    /** 이름이 부여된 CB — 상태 전환 로그에 식별자로 노출된다. */
    public CircuitBreaker(int failureThreshold, long openDurationMillis, String name) {
        this.failureThreshold = failureThreshold;
        this.openDurationMillis = openDurationMillis;
        this.name = name;
    }

    public <T> T execute(Supplier<T> action, Supplier<T> fallback) {
        if (state == State.OPEN) {
            if (System.currentTimeMillis() - lastFailureTime.get() >= openDurationMillis) {
                transition(State.HALF_OPEN, "open-duration-elapsed");
            } else {
                return fallback.get();
            }
        }

        try {
            T result = action.get();
            onSuccess();
            return result;
        } catch (Exception e) {
            onFailure();
            throw e;
        }
    }

    public void execute(Runnable action, Runnable fallback) {
        execute(() -> { action.run(); return null; }, () -> { fallback.run(); return null; });
    }

    private void onSuccess() {
        if (state != State.CLOSED) {
            transition(State.CLOSED, "probe-success");
        }
        failureCount.set(0);
    }

    private void onFailure() {
        lastFailureTime.set(System.currentTimeMillis());
        int failures = failureCount.incrementAndGet();
        if (failures >= failureThreshold && state != State.OPEN) {
            transition(State.OPEN, "failure-threshold-exceeded(" + failures + ")");
        }
    }

    private void transition(State next, String reason) {
        State prev = state;
        state = next;
        // 상태 전환은 운영 가시성 핵심 — 항상 WARN 이상으로 노출
        if (next == State.OPEN) {
            log.warn("[CB_OPEN] cb={} prev={} reason={} cooldownMs={}",
                    name, prev, reason, openDurationMillis);
        } else if (next == State.HALF_OPEN) {
            log.info("[CB_HALF_OPEN] cb={} prev={} reason={}", name, prev, reason);
        } else {
            log.info("[CB_CLOSED] cb={} prev={} reason={}", name, prev, reason);
        }
    }

    public State getState() {
        return state;
    }
}
