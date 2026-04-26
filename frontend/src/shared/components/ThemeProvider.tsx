import { useEffect } from 'react';
import { useThemeStore } from '../stores/themeStore';
import { useAppearanceStore } from '../stores/appearanceStore';
import { SERVICE_FONTS } from '../config/fonts';

/** "rgb(R, G, B)" / "rgba(R, G, B, A)" → "#rrggbb". 파싱 실패 시 null. */
function rgbStringToHex(input: string): string | null {
  const m = input.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) return null;
  const [r, g, b] = m.slice(0, 3).map((n) => Math.round(Number(n)));
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}

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

  // ── Windows 타이틀바 오버레이 색을 ActivityBar 토큰과 동기화 ──
  // theme(라이트/다크) 또는 colorTheme(테마 종류) 변경 시 다음 페인트 후 측정.
  // var(--activity-bar) 를 임시 div에 적용해 브라우저가 oklch → rgb 변환한 값을 읽어와 hex로 변환.
  useEffect(() => {
    if (window.folio?.platform !== 'electron') return;

    const id = window.requestAnimationFrame(() => {
      const probe = document.createElement('div');
      probe.style.color = 'var(--activity-bar)';
      probe.style.backgroundColor = 'var(--activity-bar-foreground)';
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      document.body.appendChild(probe);
      const computed = getComputedStyle(probe);
      const bgHex = rgbStringToHex(computed.color);
      const fgHex = rgbStringToHex(computed.backgroundColor);
      document.body.removeChild(probe);
      if (bgHex && fgHex) {
        void window.folio.window.setTitleBarColor(bgHex, fgHex);
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [theme, colorTheme]);

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
