package com.storyzip.common.circuitbreaker;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CircuitBreakerTest {

    @Test
    @DisplayName("CLOSED 상태에서 정상 호출은 결과를 반환한다")
    void closed_normalCall_returnsResult() {
        CircuitBreaker cb = new CircuitBreaker(3, 1000);
        String result = cb.execute(() -> "ok", () -> "fallback");
        assertThat(result).isEqualTo("ok");
        assertThat(cb.getState()).isEqualTo(CircuitBreaker.State.CLOSED);
    }

    @Test
    @DisplayName("임계치 미만 실패는 CLOSED를 유지한다")
    void belowThreshold_staysClosed() {
        CircuitBreaker cb = new CircuitBreaker(3, 1000);
        for (int i = 0; i < 2; i++) {
            try { cb.execute(() -> { throw new RuntimeException("fail"); }, () -> null); }
            catch (Exception ignored) {}
        }
        assertThat(cb.getState()).isEqualTo(CircuitBreaker.State.CLOSED);
    }

    @Test
    @DisplayName("임계치 도달 시 OPEN으로 전환되고 폴백이 실행된다")
    void thresholdReached_opensAndRunsFallback() {
        CircuitBreaker cb = new CircuitBreaker(3, 60_000);
        for (int i = 0; i < 3; i++) {
            try { cb.execute(() -> { throw new RuntimeException("fail"); }, () -> null); }
            catch (Exception ignored) {}
        }
        assertThat(cb.getState()).isEqualTo(CircuitBreaker.State.OPEN);

        String result = cb.execute(() -> "should not reach", () -> "fallback");
        assertThat(result).isEqualTo("fallback");
    }

    @Test
    @DisplayName("OPEN 대기 시간 경과 후 HALF_OPEN에서 성공하면 CLOSED로 복귀")
    void afterOpenDuration_halfOpenThenClosed() {
        CircuitBreaker cb = new CircuitBreaker(2, 1); // 1ms 대기
        for (int i = 0; i < 2; i++) {
            try { cb.execute(() -> { throw new RuntimeException("fail"); }, () -> null); }
            catch (Exception ignored) {}
        }
        assertThat(cb.getState()).isEqualTo(CircuitBreaker.State.OPEN);

        try { Thread.sleep(10); } catch (InterruptedException ignored) {}

        String result = cb.execute(() -> "recovered", () -> "fallback");
        assertThat(result).isEqualTo("recovered");
        assertThat(cb.getState()).isEqualTo(CircuitBreaker.State.CLOSED);
    }

    @Test
    @DisplayName("HALF_OPEN에서 다시 실패하면 OPEN으로 재전환")
    void halfOpen_failAgain_reopens() {
        CircuitBreaker cb = new CircuitBreaker(2, 1);
        for (int i = 0; i < 2; i++) {
            try { cb.execute(() -> { throw new RuntimeException("fail"); }, () -> null); }
            catch (Exception ignored) {}
        }

        try { Thread.sleep(10); } catch (InterruptedException ignored) {}

        assertThatThrownBy(() -> cb.execute(
                () -> { throw new RuntimeException("still failing"); },
                () -> { throw new RuntimeException("still failing"); }
        )).isInstanceOf(RuntimeException.class);

        assertThat(cb.getState()).isEqualTo(CircuitBreaker.State.OPEN);
    }

    @Test
    @DisplayName("성공 후 실패 카운터가 리셋된다")
    void success_resetsFailureCount() {
        CircuitBreaker cb = new CircuitBreaker(3, 60_000);
        for (int i = 0; i < 2; i++) {
            try { cb.execute(() -> { throw new RuntimeException("fail"); }, () -> null); }
            catch (Exception ignored) {}
        }
        cb.execute(() -> "success", () -> "fallback"); // 리셋

        // 다시 2번 실패해도 CLOSED 유지 (리셋되었으므로)
        for (int i = 0; i < 2; i++) {
            try { cb.execute(() -> { throw new RuntimeException("fail"); }, () -> null); }
            catch (Exception ignored) {}
        }
        assertThat(cb.getState()).isEqualTo(CircuitBreaker.State.CLOSED);
    }
}
