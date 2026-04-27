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
  /**
   * AI 사용 직후 차감 반영용 — 즉시 1회 + 1.5초 후 1회 더 refresh.
   * 서버의 토큰 차감이 완전히 commit되기까지 약간의 지연이 있을 수 있으므로
   * 이중 호출로 사용자가 "즉각 반영"으로 체감하도록 보장.
   */
  refreshAfterUsage: () => void;
  reset: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
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

  refreshAfterUsage: () => {
    void get().refresh();
    setTimeout(() => {
      void get().refresh();
    }, 1500);
  },

  reset: () => set({ wallet: null, loading: false, error: null }),
}));
