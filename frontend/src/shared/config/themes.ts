export interface ColorThemeDef {
  id: string;
  label: string;
  /** 라이트 모드 미리보기 surface (테마별로 다름) */
  previewLight: string;
  /**
   * 다크 모드 미리보기 surface.
   * 정책상 모든 테마가 동일한 .dark 기본 surface 를 공유하므로 모든 항목이 같은 값.
   * (themes.css 의 .theme-XXX.dark 가 surface 토큰을 정의하지 않아 .dark 기본이 inherit)
   */
  previewDark: string;
  /** 그 테마의 액센트 색 (라이트 .theme-XXX 의 --primary). 카드에 primary dot으로 노출. */
  previewPrimaryLight: string;
  /** 그 테마의 다크 액센트 색 (.theme-XXX.dark 의 --primary). 다크 모드에서 dot으로 노출. */
  previewPrimaryDark: string;
}

const SHARED_DARK_SURFACE = 'oklch(0.22 0.01 285.82)';

export const COLOR_THEMES: ColorThemeDef[] = [
  {
    id: 'default',
    label: '기본',
    previewLight: 'oklch(1 0 0)',
    previewDark: SHARED_DARK_SURFACE,
    previewPrimaryLight: 'oklch(0.205 0.015 285.82)',
    previewPrimaryDark: 'oklch(0.985 0.001 285.82)',
  },
  {
    id: 'sepia',
    label: '세피아',
    previewLight: 'oklch(0.96 0.02 80)',
    previewDark: SHARED_DARK_SURFACE,
    previewPrimaryLight: 'oklch(0.45 0.10 60)',
    previewPrimaryDark: 'oklch(0.78 0.08 55)',
  },
  {
    id: 'forest',
    label: '포레스트',
    previewLight: 'oklch(0.992 0.004 150)',
    previewDark: 'oklch(0.16 0.015 155)',
  },
  {
    id: 'ocean',
    label: '오션',
    previewLight: 'oklch(0.992 0.004 240)',
    previewDark: 'oklch(0.16 0.02 240)',
  },
  {
    id: 'rose',
    label: '로즈',
    previewLight: 'oklch(0.992 0.003 20)',
    previewDark: 'oklch(0.17 0.02 350)',
  },
  {
    id: 'lavender',
    label: '라벤더',
    previewLight: 'oklch(0.992 0.004 295)',
    previewDark: 'oklch(0.17 0.02 295)',
  },
];
