import { useEffect, useRef, useState } from 'react';
import { usePowerSync } from '@powersync/react';
import { getCurrentKek } from '../crypto/lifecycle';
import {
  runBackfillForWriter,
  type BackfillProgress,
} from '../crypto/backfill';
import { useWriterId } from './useWriterId';
import { useAuthStore } from '../stores/authStore';

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
  // Plan C 결정 22 — KEK 라이프사이클 변화를 deps로 추적하기 위한 카운터.
  // KEK 자체는 모듈 스코프 변수라 React가 직접 추적할 수 없으므로 authStore의
  // kekVersion(initKekFromLogin/restoreKek/clearKek 시 증가)을 deps에 둔다.
  const kekVersion = useAuthStore((s) => s.kekVersion);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<BackfillProgress | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // 합성 가드 — 같은 writerId + 같은 kekVersion 조합은 한 번만 실행.
  // login()이 이미 동기 백필을 끝낸 직후 마운트되어도 backfill SELECT의
  // NOT LIKE 'v1:%' 필터로 0건 매치 → 실질 no-op이지만, 가드로 중복 진입 자체 차단.
  // KEK 회전(pepper 변경) 시 kekVersion이 바뀌어 자동 재실행.
  const startedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!writerId) return;
    const kek = getCurrentKek();
    if (!kek) return;
    const guard = `${writerId}:${kekVersion}`;
    if (startedRef.current === guard) return;
    startedRef.current = guard;

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
  }, [db, writerId, kekVersion]);

  return { isRunning, progress, error };
}
