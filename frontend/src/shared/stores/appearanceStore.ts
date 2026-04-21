import { create } from 'zustand';

export interface AppearanceState {
  colorTheme: string;
  serviceFont: string;
  setColorTheme: (id: string) => void;
  setServiceFont: (id: string) => void;
}

const STORAGE_KEY = 'folio.ui.appearance';

function load(): { colorTheme: string; serviceFont: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { colorTheme: 'default', serviceFont: 'system' };
    return { colorTheme: 'default', serviceFont: 'system', ...JSON.parse(raw) };
  } catch {
    return { colorTheme: 'default', serviceFont: 'system' };
  }
}

function persist(state: { colorTheme: string; serviceFont: string }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  ...load(),
  setColorTheme: (colorTheme) => {
    persist({ colorTheme, serviceFont: get().serviceFont });
    set({ colorTheme });
  },
  setServiceFont: (serviceFont) => {
    persist({ colorTheme: get().colorTheme, serviceFont });
    set({ serviceFont });
  },
}));
