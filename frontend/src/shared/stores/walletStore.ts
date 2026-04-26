import { create } from 'zustand';
import { ApiError } from '../lib/apiClient';
import { paymentApi } from '../lib/paymentApi';
import type { TokenWalletResponse } from '../types/payment';

/**
 * 사이드바 잔액 표시 + 결제 화면 잔액이 같은 데이터를 공유하기 위한 단일 소스.
 * 결제/구독/환불/AI 차감 후에는 refresh()를 명시적으로 호출해 갱신한다.
 *
 * - 게스트(401) 등 잔액 조회 실패는 wallet=null + error="" 로 조용히 무시.
 * - 의도적으로 폴링하지 않는다 — 변경 시점이 명확하므로 명시 갱신이 더 효율적.
 */
interface WalletState {
  wallet: TokenWalletResponse | null;
  loading: boolean;
  error: string | null;

  refresh: () => Promise<void>;
  reset: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  wallet: null,
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const w = await paymentApi.getWallet();
      set({ wallet: w, loading: false });
    } catch (e) {
      // 401: 게스트/세션만료 → 잔액 미표시. 다른 에러는 메시지 보관.
      if (e instanceof ApiError && e.status === 401) {
        set({ wallet: null, loading: false, error: null });
        return;
      }
      set({
        loading: false,
        error: e instanceof Error ? e.message : '지갑 조회 실패',
      });
    }
  },

  reset: () => set({ wallet: null, loading: false, error: null }),
}));
