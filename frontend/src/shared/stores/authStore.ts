import { create } from 'zustand';
import type { Writer } from '../types/auth';

interface AuthState {
  writer: Writer | null;
  isAuthenticated: boolean;
  isRestoring: boolean;
  isLoggingIn: boolean;
  error: string | null;

  restore: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  writer: null,
  isAuthenticated: false,
  isRestoring: true,
  isLoggingIn: false,
  error: null,

  restore: async () => {
    set({ isRestoring: true, error: null });
    try {
      const result = await window.storyzip.auth.tryRestore();
      if (result) {
        set({
          writer: result.writer,
          isAuthenticated: true,
          isRestoring: false,
        });
      } else {
        set({ writer: null, isAuthenticated: false, isRestoring: false });
      }
    } catch (e) {
      set({
        writer: null,
        isAuthenticated: false,
        isRestoring: false,
        error: (e as Error).message,
      });
    }
  },

  login: async () => {
    set({ isLoggingIn: true, error: null });
    try {
      const result = await window.storyzip.auth.loginWithGoogle();
      set({
        writer: result.writer,
        isAuthenticated: true,
        isLoggingIn: false,
      });
    } catch (e) {
      set({
        isLoggingIn: false,
        error: (e as Error).message,
      });
    }
  },

  logout: async () => {
    try {
      await window.storyzip.auth.logout();
    } finally {
      set({ writer: null, isAuthenticated: false });
    }
  },
}));
