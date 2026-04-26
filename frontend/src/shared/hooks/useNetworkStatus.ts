import { create } from 'zustand';

interface NetworkState {
  isOnline: boolean;
}

export const useNetworkStore = create<NetworkState>(() => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
}));

/**
 * 앱 초기화 시 1회 호출 — online/offline 이벤트 바인딩.
 * navigator.onLine은 OS 레벨 네트워크 인터페이스 상태를 즉시 반영하므로
 * PowerSync status.connected보다 빠르게 오프라인 전환을 감지한다.
 */
export function initNetworkListener() {
  const update = () =>
    useNetworkStore.setState({ isOnline: navigator.onLine });
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
}

/** 컴포넌트용 훅 — 현재 네트워크 온라인 여부 */
export function useNetworkStatus(): boolean {
  return useNetworkStore((s) => s.isOnline);
}
