package com.storyzip.common.observability;

import lombok.extern.slf4j.Slf4j;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.function.Supplier;

/**
 * 외부 시스템 호출(HTTP / 결제 게이트웨이 / AI / OAuth 등)을 일관된 포맷으로 계측한다.
 *
 * <p>한 호출당 다음 로그를 남긴다.
 * <ul>
 *   <li>성공 + 임계치 이내: DEBUG (운영 noise 방지)</li>
 *   <li>성공 + 임계치 초과: WARN (병목 후보 탐지)</li>
 *   <li>실패: WARN/ERROR — 호출자가 던지는 예외 유형에 위임. 여기선 elapsed만 기록.</li>
 * </ul>
 *
 * <p>로그 필드를 통일해 Loki에서 {@code system="toss"} / {@code op="confirmPayment"}로
 * 필터링 가능하도록 한다.
 */
@Slf4j
public final class ExternalCallLogger {

    /** 외부 시스템 식별자 — Loki/Grafana 라벨로 그대로 사용. */
    public static final String SYSTEM_TOSS = "toss";
    public static final String SYSTEM_AI = "ai";
    public static final String SYSTEM_GOOGLE_OAUTH = "google_oauth";

    private ExternalCallLogger() {}

    /**
     * 호출을 측정하고 로그를 남긴 후 결과를 반환한다.
     *
     * @param system 외부 시스템명 (e.g. "toss", "ai")
     * @param op 작업명 (e.g. "confirmPayment")
     * @param slaMs 이 작업의 SLA(ms). 초과 시 WARN.
     * @param action 실제 호출 람다
     */
    public static <T> T measure(String system, String op, long slaMs, Supplier<T> action) {
        Logger logger = LoggerFactory.getLogger("external." + system);
        long startNanos = System.nanoTime();
        try {
            T result = action.get();
            long elapsedMs = (System.nanoTime() - startNanos) / 1_000_000L;
            if (elapsedMs >= slaMs) {
                logger.warn("[EXT_SLOW] system={} op={} elapsedMs={} sla={} status=ok",
                        system, op, elapsedMs, slaMs);
            } else if (logger.isDebugEnabled()) {
                logger.debug("[EXT_OK] system={} op={} elapsedMs={} status=ok",
                        system, op, elapsedMs);
            }
            return result;
        } catch (RuntimeException e) {
            long elapsedMs = (System.nanoTime() - startNanos) / 1_000_000L;
            logger.warn("[EXT_FAIL] system={} op={} elapsedMs={} errType={} errMsg={}",
                    system, op, elapsedMs, e.getClass().getSimpleName(), e.getMessage());
            throw e;
        }
    }

    /** void 반환용 오버로드. */
    public static void measure(String system, String op, long slaMs, Runnable action) {
        measure(system, op, slaMs, () -> { action.run(); return null; });
    }

    /**
     * checked exception을 던지는 호출용 오버로드.
     * 람다 내부의 throw는 호출자가 처리 가능한 형태로 감싸 다시 던져야 한다.
     */
    @FunctionalInterface
    public interface ThrowingSupplier<T> {
        T get() throws Exception;
    }

    /**
     * checked exception을 허용하는 measure. 실패 시 원 예외를 그대로 다시 던진다.
     * 호출자는 try/catch로 IOException/InterruptedException 등을 명시적으로 처리해야 한다.
     */
    public static <T> T measureChecked(String system, String op, long slaMs, ThrowingSupplier<T> action)
            throws Exception {
        Logger logger = LoggerFactory.getLogger("external." + system);
        long startNanos = System.nanoTime();
        try {
            T result = action.get();
            long elapsedMs = (System.nanoTime() - startNanos) / 1_000_000L;
            if (elapsedMs >= slaMs) {
                logger.warn("[EXT_SLOW] system={} op={} elapsedMs={} sla={} status=ok",
                        system, op, elapsedMs, slaMs);
            } else if (logger.isDebugEnabled()) {
                logger.debug("[EXT_OK] system={} op={} elapsedMs={} status=ok",
                        system, op, elapsedMs);
            }
            return result;
        } catch (Exception e) {
            long elapsedMs = (System.nanoTime() - startNanos) / 1_000_000L;
            logger.warn("[EXT_FAIL] system={} op={} elapsedMs={} errType={} errMsg={}",
                    system, op, elapsedMs, e.getClass().getSimpleName(), e.getMessage());
            throw e;
        }
    }
}
