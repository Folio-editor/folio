import { useEffect } from 'react';
import { useThemeStore } from '../stores/themeStore';
import { useAppearanceStore } from '../stores/appearanceStore';
import { SERVICE_FONTS } from '../config/fonts';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);
  const colorTheme = useAppearanceStore((s) => s.colorTheme);
  const serviceFont = useAppearanceStore((s) => s.serviceFont);

  useEffect(() => {
    const root = document.documentElement;

    const apply = (resolved: 'light' | 'dark') => {
      root.classList.remove('light', 'dark');
      root.classList.add(resolved);
    };

    if (theme !== 'system') {
      apply(theme);
      return;
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    apply(mq.matches ? 'dark' : 'light');

    const handler = (e: MediaQueryListEvent) => apply(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    Array.from(root.classList)
      .filter((cls) => cls.startsWith('theme-'))
      .forEach((cls) => root.classList.remove(cls));

    if (colorTheme !== 'default') {
      root.classList.add(`theme-${colorTheme}`);
    }
  }, [colorTheme]);

  useEffect(() => {
    const fontDef = SERVICE_FONTS.find((f) => f.id === serviceFont);
    if (!fontDef) return;

    if (fontDef.url) {
      const linkId = `folio-font-${fontDef.id}`;
      if (!document.getElementById(linkId)) {
        const link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = fontDef.url;
        document.head.appendChild(link);
      }
    }

    document.body.style.fontFamily = fontDef.fontFamily;
  }, [serviceFont]);

  return <>{children}</>;
}
