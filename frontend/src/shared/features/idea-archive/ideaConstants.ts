export const TAG_LIST = ['문장', '장면', '설정', '반전', '대사'] as const;

export const TAG_COLOR: Record<string, string> = {
  '문장': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  '장면': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '설정': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  '반전': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  '대사': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

export const TAG_OPTIONS = [
  { value: '', label: '태그 없음' },
  { value: '문장', label: '문장' },
  { value: '장면', label: '장면' },
  { value: '설정', label: '설정' },
  { value: '반전', label: '반전' },
  { value: '대사', label: '대사' },
];

export const TAG_DOT_COLOR: Record<string, string> = {
  '문장': 'bg-amber-400',
  '장면': 'bg-blue-400',
  '설정': 'bg-purple-400',
  '반전': 'bg-red-400',
  '대사': 'bg-green-400',
};
