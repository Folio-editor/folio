import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';
import { useAuthStore } from '../stores/authStore';

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
 * 로그인 상태에서만 API 호출. 게스트일 때는 null 반환.
 * API 응답은 localStorage에 캐싱하여 오프라인/게스트 상태에서도 조회 가능.
 */
export function useAccountInfo() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [data, setData] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!isAuthenticated) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<AccountInfo>('/account/me');
      setData(res);
      saveCachedAccountInfo(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

/**
 * 로컬에 캐싱된 계정 정보를 반환한다.
 * 게스트/오프라인 상태에서 마지막 로그인 시점의 클라우드 사용량을 표시하는 데 사용.
 */
export function useCachedAccountInfo(): CachedAccountInfo | null {
  const [cached] = useState(() => loadCachedAccountInfo());
  return cached;
}
