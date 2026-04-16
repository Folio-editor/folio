package com.storyzip.common.circuitbreaker;

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

    private final int failureThreshold;
    private final long openDurationMillis;
    private final AtomicInteger failureCount = new AtomicInteger(0);
    private final AtomicLong lastFailureTime = new AtomicLong(0);
    private volatile State state = State.CLOSED;

    public CircuitBreaker(int failureThreshold, long openDurationMillis) {
        this.failureThreshold = failureThreshold;
        this.openDurationMillis = openDurationMillis;
    }

    public <T> T execute(Supplier<T> action, Supplier<T> fallback) {
        if (state == State.OPEN) {
            if (System.currentTimeMillis() - lastFailureTime.get() >= openDurationMillis) {
                state = State.HALF_OPEN;
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
        failureCount.set(0);
        state = State.CLOSED;
    }

    private void onFailure() {
        lastFailureTime.set(System.currentTimeMillis());
        if (failureCount.incrementAndGet() >= failureThreshold) {
            state = State.OPEN;
        }
    }

    public State getState() {
        return state;
    }
}
