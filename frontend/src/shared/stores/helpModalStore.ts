import { create } from 'zustand';

/**
 * 글로벌 도움말 모달 상태.
 * F1 글로벌 단축키 + 에디터 툴바 ? 버튼이 같은 모달을 공유한다.
 * 모달은 AuthenticatedApp 에서 한 번만 마운트한다.
 */
interface HelpModalState {
  shortcutHelpOpen: boolean;
  openShortcutHelp: () => void;
  closeShortcutHelp: () => void;
  toggleShortcutHelp: () => void;
}

export const useHelpModalStore = create<HelpModalState>((set) => ({
  shortcutHelpOpen: false,
  openShortcutHelp: () => set({ shortcutHelpOpen: true }),
  closeShortcutHelp: () => set({ shortcutHelpOpen: false }),
  toggleShortcutHelp: () =>
    set((s) => ({ shortcutHelpOpen: !s.shortcutHelpOpen })),
}));
