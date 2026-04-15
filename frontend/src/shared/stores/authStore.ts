import { create } from 'zustand';
import type { Writer } from '../types/auth';
import { migrateGuestToAccount } from '../sync/migrate';

// ────────────────────────────────────────────────────────────
// 앱 모드
//   restoring   — 앱 시작 시 이전 세션 복원 중 (로딩 스피너)
//   guest       — 로그인 없이 로컬 전용 편집 (SQLite 직접 쓰기, 클라우드 sync 없음)
//   authenticated — Google 로그인 완료 (PowerSync sync 활성)
// ────────────────────────────────────────────────────────────

interface AuthState {
  writer: Writer | null;
  guestWriterId: string | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  isRestoring: boolean;
  isLoggingIn: boolean;
  error: string | null;

  /** 현재 세션의 writerId. 로그인 시 real UUID, 게스트 시 guest UUID */
  currentWriterId: () => string | null;

  restore: () => Promise<void>;
  enterGuestMode: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  writer: null,
  guestWriterId: null,
  isAuthenticated: false,
  isGuest: false,
  isRestoring: true,
  isLoggingIn: false,
  error: null,

  currentWriterId: () => {
    const { writer, guestWriterId } = get();
    return writer?.id ?? guestWriterId;
  },

  /**
   * 앱 시작 시 호출.
   * 1) 저장된 refresh token으로 자동 로그인 시도
   * 2) 실패하면 → 게스트 모드로 진입 (로그인 화면 없음)
   */
  restore: async () => {
    set({ isRestoring: true, error: null });
    try {
      const result = await window.storyzip.auth.tryRestore();
      if (result) {
        set({
          writer: result.writer,
          isAuthenticated: true,
          isGuest: false,
          isRestoring: false,
        });
        return;
      }
    } catch {
      /* 네트워크 오류 등 — 게스트로 폴백 */
    }
    // 로그인 정보 없음 → 게스트 모드
    await get().enterGuestMode();
  },

  /**
   * 게스트 모드 진입.
   * 로컬 UUID를 받아 guestWriterId로 설정한다.
   */
  enterGuestMode: async () => {
    const guestWriterId = await window.storyzip.auth.getGuestId();
    set({
      writer: null,
      guestWriterId,
      isAuthenticated: false,
      isGuest: true,
      isRestoring: false,
    });
  },

  /**
   * Google 로그인.
   * 게스트 모드에서 로그인하면 로컬 데이터를 서버로 마이그레이션한다.
   */
  login: async () => {
    const wasGuest = get().isGuest;
    const guestId = get().guestWriterId;

    set({ isLoggingIn: true, error: null });
    try {
      const result = await window.storyzip.auth.loginWithGoogle();
      set({
        writer: result.writer,
        guestWriterId: null,
        isAuthenticated: true,
        isGuest: false,
        isLoggingIn: false,
      });

      // 게스트에서 로그인 시 로컬 데이터 서버로 업로드
      if (wasGuest && guestId) {
        void migrateGuestToAccount(guestId, result.writer.id).catch((e) => {
          console.warn('[AuthStore] 게스트 데이터 마이그레이션 실패:', e);
        });
      }
    } catch (e) {
      set({ isLoggingIn: false, error: (e as Error).message });
    }
  },

  /**
   * 로그아웃 → 게스트 모드로 복귀 (로그인 화면으로 가지 않음).
   */
  logout: async () => {
    try {
      await window.storyzip.auth.logout();
    } finally {
      // 게스트 UUID는 유지 (기존 로컬 데이터 접근 가능)
      const guestWriterId = get().guestWriterId ?? (await window.storyzip.auth.getGuestId());
      set({
        writer: null,
        guestWriterId,
        isAuthenticated: false,
        isGuest: true,
      });
    }
  },
}));
