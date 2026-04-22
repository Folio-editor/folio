export interface ServiceFontDef {
  id: string;
  label: string;
  fontFamily: string;
  url?: string;
  category: 'sans' | 'serif';
}

export const SERVICE_FONTS: ServiceFontDef[] = [
  {
    id: 'system',
    label: '시스템 기본',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
    category: 'sans',
  },
  {
    id: 'pretendard',
    label: 'Pretendard',
    fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
    url: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css',
    category: 'sans',
  },
  {
    id: 'noto-sans-kr',
    label: 'Noto Sans KR',
    fontFamily: "'Noto Sans KR', sans-serif",
    url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap',
    category: 'sans',
  },
  {
    id: 'noto-serif-kr',
    label: 'Noto Serif KR (명조)',
    fontFamily: "'Noto Serif KR', serif",
    url: 'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;700&display=swap',
    category: 'serif',
  },
  {
    id: 'ridibatang',
    label: '리디바탕',
    fontFamily: "'RIDIBatang', serif",
    url: 'https://cdn.jsdelivr.net/gh/niceplugin/RIDIBatang/fonts/ridibatang-variable.css',
    category: 'serif',
  },
];
