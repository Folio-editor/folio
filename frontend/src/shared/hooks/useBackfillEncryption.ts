import { useEffect, useRef, useState } from 'react';
import { usePowerSync } from '@powersync/react';
import { getCurrentKek } from '../crypto/lifecycle';
import {
  runBackfillForWriter,
  type BackfillProgress,
} from '../crypto/backfill';
import { useWriterId } from './useWriterId';

/**
 * Plan C 옵션 1 — 평문 row 자동 백필 훅.
 *
 * <p>로그인 + KEK 도출 + writerId 확정이 모두 끝난 시점에 한 번 실행된다. SQLite 의 모든
 * 작품을 순회하며 'v1:' 접두사가 없는 평문 컬럼을 client-side 암호화로 다시 기록한다.
 *
 * <p>한 writer 당 한 번만 돌면 충분하지만, 새로운 게스트 row가 동기화로 내려올 수도 있어
 * writer 변경이나 KEK 재도출 시점마다 다시 실행된다. 같은 writer/kek 조합에서는 inflightRef
 * 로 동시 호출을 막는다.
 *
 * <p>동기화 큐가 로컬 우선 모델이므로 백필 결과는 자연스럽게 PowerSync upload 큐에 누적되고
 * 다음 connect 사이클에 서버로 반영된다 — 별도 push 호출은 필요 없다.
 */
export function useBackfillEncryption(): {
  isRunning: boolean;
  progress: BackfillProgress | null;
  error: Error | null;
} {
  const db = usePowerSync();
  const writerId = useWriterId();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<BackfillProgress | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // 같은 writerId 에서 두 번 트리거되지 않도록 guard. KEK 재도출 등으로 다시 실행하려면
  // ref 키를 (writerId + kek 식별자) 같은 합성 값으로 바꿀 수 있지만, KEK 객체는 모듈 스코프
  // 단일 핸들이라 writerId 만으로 충분하다.
  const startedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!writerId) return;
    const kek = getCurrentKek();
    if (!kek) return;
    if (startedRef.current === writerId) return;
    startedRef.current = writerId;

    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      setIsRunning(true);
      setError(null);
      try {
        const result = await runBackfillForWriter({
          db,
          kek,
          writerId,
          signal: controller.signal,
          onProgress: (p) => {
            if (cancelled) return;
            setProgress({ ...p });
          },
        });
        if (!cancelled) setProgress(result);
      } catch (e) {
        if (cancelled) return;
        // AbortError 는 의도된 cancel — 화면에 노출하지 않는다.
        if (e instanceof DOMException && e.name === 'AbortError') return;
        const err = e instanceof Error ? e : new Error(String(e));
        // 백필 실패는 사용자 흐름을 막지 않는다 — 다음 로그인에서 재시도된다.
        console.warn('[backfill] encryption backfill failed:', err);
        setError(err);
      } finally {
        if (!cancelled) setIsRunning(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [db, writerId]);

  return { isRunning, progress, error };
}
