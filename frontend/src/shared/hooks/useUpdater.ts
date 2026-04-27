import { useCallback, useEffect, useRef, useState } from 'react';
import type { UpdaterState } from '../types/auth';

const INITIAL_STATE: UpdaterState = { phase: 'idle' };

/**
 * 앱 업데이트 상태와 액션을 노출하는 훅.
 *
 * - 마운트 시 메인 프로세스의 onStateChange를 구독해 상태 변화를 즉시 반영.
 * - check/download/installAndRestart 액션은 메인의 IPC 호출을 그대로 위임.
 * - 마지막 "업데이트 확인" 시각을 lastCheckedAt으로 보존 (UI에 표시).
 * - web 플랫폼이거나 dev 빌드인 경우 phase는 'unsupported'로 도착.
 */
export function useUpdater() {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [state, setState] = useState<UpdaterState>(INITIAL_STATE);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  /** check/download가 진행 중일 때 UI 버튼 disable */
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void window.folio.updater.getCurrentVersion().then((v) => {
      if (!cancelled) setCurrentVersion(v);
    });
    const unsubscribe = window.folio.updater.onStateChange((next) => {
      setState(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const check = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const result = await window.folio.updater.check();
      // 메인이 broadcast한 상태가 우선 반영되지만, 호출 결과도 한 번 더 동기화.
      setState(result);
      setLastCheckedAt(Date.now());
    } finally {
      busyRef.current = false;
    }
  }, []);

  const download = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const result = await window.folio.updater.download();
      setState(result);
    } finally {
      busyRef.current = false;
    }
  }, []);

  const installAndRestart = useCallback(async () => {
    await window.folio.updater.installAndRestart();
  }, []);

  const isWeb = window.folio.platform === 'web';
  const isBusy = state.phase === 'checking' || state.phase === 'downloading';

  return {
    currentVersion,
    state,
    lastCheckedAt,
    isWeb,
    isBusy,
    check,
    download,
    installAndRestart,
  };
}
