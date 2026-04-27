import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';
import { useAuthStore } from '../stores/authStore';
import { useNetworkStatus } from './useNetworkStatus';

export interface AccountInfo {
  writer: {
    id: string;
    email: string;
    nickname: string | null;
    profileImageUrl: string | null;
    role: string;
    oauthProvider: string | null;
    createdAt: string;
  };
  plan: {
    tier: string;
    displayName: string;
    storageLimitBytes: number;
  };
  usage: {
    storageUsedBytes: number;
    storagePercent: number;
    quotaExceeded: boolean;
  };
  subscription: {
    plan: string;
    status: string;
    monthlyAmount: number;
    nextBillingAt: string;
    cancelledAt: string | null;
  } | null;
}

/** 로컬 캐시에 저장되는 계정 정보 (타임스탬프 포함) */
export interface CachedAccountInfo {
  data: AccountInfo;
  cachedAt: number; // Date.now()
}

const ACCOUNT_CACHE_KEY = 'folio:account-info-cache';

function loadCachedAccountInfo(): CachedAccountInfo | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedAccountInfo;
  } catch {
    return null;
  }
}

function saveCachedAccountInfo(data: AccountInfo) {
  localStorage.setItem(
    ACCOUNT_CACHE_KEY,
    JSON.stringify({ data, cachedAt: Date.now() } satisfies CachedAccountInfo),
  );
}

/**
 * 계정 정보 + 사용량 조회 훅.
 *
 * 오프라인 인지 동작:
 * - 마운트 시 localStorage 캐시를 즉시 초기 데이터로 사용 → 첫 렌더부터 데이터 표시
 * - 오프라인이면 fetch를 스킵하고 캐시를 stale로 마킹
 * - 온라인 복귀 시 자동 refetch (isOnline 의존성으로 useCallback이 재생성됨)
 * - fetch 실패해도 기존 data/cachedAt은 유지 → UI가 "사라지지 않음"
 *
 * 게스트 상태에서는 호출되지 않는다 (AccountSettings는 isGuest 분기로 GuestView 사용).
 */
export function useAccountInfo() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isOnline = useNetworkStatus();

  // 캐시를 초기 state로 주입 — 즉시 렌더 시작 (loading 화면 깜빡임 제거)
  const [initialCache] = useState<CachedAccountInfo | null>(() =>
    loadCachedAccountInfo(),
  );
  const [data, setData] = useState<AccountInfo | null>(
    initialCache?.data ?? null,
  );
  const [cachedAt, setCachedAt] = useState<number | null>(
    initialCache?.cachedAt ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState<boolean>(
    !isOnline && initialCache !== null,
  );

  const fetch = useCallback(async () => {
    if (!isAuthenticated) {
      setData(null);
      setCachedAt(null);
      setIsStale(false);
      return;
    }
    // 오프라인이면 fetch 스킵 — 캐시 그대로 사용, stale로 마킹
    if (!isOnline) {
      setIsStale(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<AccountInfo>('/account/me');
      setData(res);
      setCachedAt(Date.now());
      setIsStale(false);
      saveCachedAccountInfo(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      // 실패해도 캐시 데이터는 유지. setter 함수형으로 호출해 prev 참조
      // (data 의존성을 useCallback에 넣으면 무한 refetch 위험)
      setData((prev) => {
        if (prev) setIsStale(true);
        return prev;
      });
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch, isStale, cachedAt };
}

/**
 * 로컬에 캐싱된 계정 정보를 반환한다.
 * 게스트 상태에서 마지막 로그인 시점의 클라우드 사용량을 표시하는 데 사용.
 */
export function useCachedAccountInfo(): CachedAccountInfo | null {
  const [cached] = useState(() => loadCachedAccountInfo());
  return cached;
}
