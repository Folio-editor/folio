import { useEffect, useState } from 'react';
import { useThemeStore } from '../stores/themeStore';

/**
 * 현재 실제 적용된 테마 ('light' | 'dark') 반환.
 *
 * useThemeStore 의 'system' 모드는 OS 설정을 따라가므로 여기서 prefers-color-scheme 까지
 * 합쳐서 최종 해소(resolved) 값을 돌려준다. ThemeProvider 가 root 에 'light'/'dark' 클래스를
 * 토글하는 것과 동일한 규칙.
 */
export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useThemeStore((s) => s.theme);

  const compute = (): 'light' | 'dark' => {
    if (theme === 'light' || theme === 'dark') return theme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  const [resolved, setResolved] = useState<'light' | 'dark'>(compute);

  useEffect(() => {
    setResolved(compute());
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setResolved(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  return resolved;
}
