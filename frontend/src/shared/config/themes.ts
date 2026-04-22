export interface ColorThemeDef {
  id: string;
  label: string;
  previewLight: string;
  previewDark: string;
}

export const COLOR_THEMES: ColorThemeDef[] = [
  {
    id: 'default',
    label: '기본',
    previewLight: 'oklch(1 0 0)',
    previewDark: 'oklch(0.145 0.004 285.82)',
  },
  {
    id: 'sepia',
    label: '세피아',
    previewLight: 'oklch(0.96 0.02 80)',
    previewDark: 'oklch(0.18 0.015 60)',
  },
  {
    id: 'forest',
    label: '포레스트',
    previewLight: 'oklch(0.97 0.01 150)',
    previewDark: 'oklch(0.16 0.015 155)',
  },
  {
    id: 'ocean',
    label: '오션',
    previewLight: 'oklch(0.97 0.01 240)',
    previewDark: 'oklch(0.16 0.02 240)',
  },
  {
    id: 'rose',
    label: '로즈',
    previewLight: 'oklch(0.97 0.015 10)',
    previewDark: 'oklch(0.17 0.02 350)',
  },
  {
    id: 'lavender',
    label: '라벤더',
    previewLight: 'oklch(0.97 0.015 295)',
    previewDark: 'oklch(0.17 0.02 295)',
  },
];
