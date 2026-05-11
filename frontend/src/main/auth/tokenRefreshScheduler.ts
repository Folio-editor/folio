import { EventEmitter } from 'node:events';

/**
 * Access Token proactive(무음) 갱신 스케줄러.
 *
 * <p>JWT `exp`에서 만료 시각을 읽어 만료 2분 전에 {@link refreshFn}을 호출한다.
 * 성공 시 새 토큰으로 재귀 리스케줄, 실패 시 분기:
 * <ul>
 *   <li>UNAUTHORIZED — RT 거부. 즉시 중단 + {@code session-expired} emit.</li>
 *   <li>NETWORK/5xx — 지수 백오프 재시도. {@link MAX_RETRIES} 초과 시 session-expired.</li>
 * </ul>
 *
 * <p>타이머는 Main 프로세스 Node Event Loop 기반이라 브라우저 throttle에 영향받지 않는다.
 */

const BUFFER_MS = 2 * 60 * 1000; // 만료 2분 전 발사
const MIN_DELAY_MS = 1000; // 즉시 발사에도 최소 1초 대기 (경합 방지)
const BACKOFF_BASE_MS = 30 * 1000;
const BACKOFF_MAX_MS = 5 * 60 * 1000;
const MAX_RETRIES = 6;
const NETWORK_RETRY_MS = 60 * 1000; // 네트워크 오류 시 고정 재시도 간격

export type RefreshOutcome =
  | { kind: 'ok'; accessToken: string }
  | { kind: 'unauthorized' } // RT 거부 — 세션 만료 확정
  | { kind: 'network' }; // 일시 오류 — 재시도 대상

export interface TokenRefreshScheduler extends EventEmitter {
  start(accessToken: string): void;
  stop(): void;
}

/**
 * base64url 디코드된 JWT payload에서 {@code exp}(unix seconds)를 추출한다.
 * 파싱 실패 시 null — 호출자는 즉시 refresh 트리거로 폴백해야 한다.
 */
export function parseJwtExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = Buffer.from(
      parts[1].replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8');
    const exp = (JSON.parse(payload) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

export function createTokenRefreshScheduler(
  refreshFn: () => Promise<RefreshOutcome>,
): TokenRefreshScheduler {
  const emitter = new EventEmitter() as TokenRefreshScheduler;
  let timer: NodeJS.Timeout | null = null;
  let retryCount = 0;
  let lastKnownToken: string | null = null;

  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const computeDelay = (accessToken: string): number => {
    const exp = parseJwtExp(accessToken);
    if (exp === null) {
      // 파싱 실패 → 안전하게 즉시 갱신 트리거
      return MIN_DELAY_MS;
    }
    const msUntilExpiry = exp * 1000 - Date.now();
    const delay = msUntilExpiry - BUFFER_MS;
    return Math.max(delay, MIN_DELAY_MS);
  };

  const scheduleNext = (accessToken: string, overrideDelay?: number) => {
    clear();
    const delay = overrideDelay ?? computeDelay(accessToken);
    timer = setTimeout(() => {
      void doRefresh();
    }, delay);
  };

  const doRefresh = async () => {
    try {
      const outcome = await refreshFn();
      if (outcome.kind === 'ok') {
        retryCount = 0;
        scheduleNext(outcome.accessToken);
        return;
      }
      if (outcome.kind === 'unauthorized') {
        console.warn('[auth] proactive refresh 거부(RT invalid) — 세션 만료');
        retryCount = 0;
        clear();
        emitter.emit('session-expired');
        return;
      }
      // network / 5xx — 카운터 소진 없이 고정 간격 재시도
      clear();
      timer = setTimeout(() => {
        void doRefresh();
      }, NETWORK_RETRY_MS);
    } catch (e) {
      console.warn('[auth] proactive refresh 예외:', e);
      handleRetry();
    }
  };

  const handleRetry = () => {
    retryCount += 1;
    if (retryCount > MAX_RETRIES) {
      console.warn(
        `[auth] proactive refresh ${MAX_RETRIES}회 초과 — 세션 만료 처리`,
      );
      retryCount = 0;
      clear();
      emitter.emit('session-expired');
      return;
    }
    const backoff = Math.min(
      BACKOFF_BASE_MS * Math.pow(2, retryCount - 1),
      BACKOFF_MAX_MS,
    );
    clear();
    timer = setTimeout(() => {
      void doRefresh();
    }, backoff);
  };

  emitter.start = (accessToken: string) => {
    retryCount = 0;
    lastKnownToken = accessToken;
    scheduleNext(accessToken);
  };
  emitter.stop = () => {
    retryCount = 0;
    lastKnownToken = null;
    clear();
  };

  return emitter;
}
