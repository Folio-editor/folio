import { create } from 'zustand';

export interface EditorSettings {
  // 따옴표
  autoPairQuotes: boolean;
  dialogueColor: boolean;
  innerThoughtColor: boolean;

  // 한국어 자동 변환
  autoKoreanPunctuation: boolean;

  // 문단
  autoIndent: boolean;
  indentSize: '1em' | '2em';

  // 이름 태그
  nameTagEnabled: boolean;

  // 표시
  showLineNumbers: boolean;
  showParagraphMarks: boolean;

  // 집필 모드
  typewriterMode: boolean;
  typewriterPosition: number; // 0–100 (%)
  focusMode: boolean;

  // 목표
  dailyGoalEnabled: boolean;
  dailyGoalChars: number;

  // 서식
  fontFamily: 'system' | 'serif' | 'sans';
  lineHeight: number;
  fontSize: number;
}

const STORAGE_KEY = 'folio.editor.settings';

const DEFAULTS: EditorSettings = {
  autoPairQuotes: true,
  dialogueColor: true,
  innerThoughtColor: true,
  autoKoreanPunctuation: true,
  autoIndent: true,
  indentSize: '1em',
  nameTagEnabled: true,
  showLineNumbers: true,
  showParagraphMarks: false,
  typewriterMode: false,
  typewriterPosition: 50,
  focusMode: false,
  dailyGoalEnabled: false,
  dailyGoalChars: 3000,
  fontFamily: 'system',
  lineHeight: 1.8,
  fontSize: 16,
};

function loadSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<EditorSettings>) };
  } catch {
    return DEFAULTS;
  }
}

function persist(settings: EditorSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

interface EditorSettingsState extends EditorSettings {
  set: <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => void;
  reset: () => void;
}

export const useEditorSettings = create<EditorSettingsState>((set) => ({
  ...loadSettings(),
  set: (key, value) =>
    set((state) => {
      const next = { ...state, [key]: value };
      persist(next);
      return next;
    }),
  reset: () => {
    persist(DEFAULTS);
    set(DEFAULTS);
  },
}));
