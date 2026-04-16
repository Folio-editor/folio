import { useEffect, useState } from 'react';

/**
 * localStorage 에 JSON 직렬화되어 영속되는 `useState`.
 * - 초기값은 저장된 값이 있으면 그쪽, 없거나 파싱 실패 시 `initial`.
 * - 저장 실패(프라이빗 모드 / quota 초과 등)는 조용히 무시한다.
 * - 키는 네임스페이스 권장 (예: `storyzip.ui.sidebarWidth`).
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, (v: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* quota / private mode — 무시 */
    }
  }, [key, state]);

  return [state, setState];
}
