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

/**
 * 계정 정보 + 사용량 조회 훅.
 * 로그인 상태에서만 API 호출. 게스트일 때는 null 반환.
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
