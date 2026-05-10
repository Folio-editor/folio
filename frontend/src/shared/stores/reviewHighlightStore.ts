import { create } from 'zustand';

export interface ReviewHighlightIssue {
  index: number;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  lines: number[];
  location: string;
  description: string;
}

interface ReviewHighlightState {
  issues: ReviewHighlightIssue[];
  /** 하이라이트가 속한 episode id — 다른 회차 에디터로 이동 시 잔여 표시 차단. */
  episodeId: string | null;
  focusedIndex: number | null;
  version: number;

  /**
   * @param episodeId 하이라이트가 속한 회차 id. 다른 episode 의 ContentEditor 는 이 id 와 다르면
   *   데코를 그리지 않는다. null 이면 모든 에디터에서 표시 (legacy / 임시 호환).
   */
  setIssues: (issues: ReviewHighlightIssue[], episodeId: string | null) => void;
  clearIssues: () => void;
  focusIssue: (index: number) => void;
  clearFocus: () => void;
}

export const useReviewHighlightStore = create<ReviewHighlightState>((set) => ({
  issues: [],
  episodeId: null,
  focusedIndex: null,
  version: 0,

  setIssues: (issues, episodeId) =>
    set((s) => ({
      issues,
      episodeId,
      focusedIndex: null,
      version: s.version + 1,
    })),

  clearIssues: () =>
    set((s) => ({
      issues: [],
      episodeId: null,
      focusedIndex: null,
      version: s.version + 1,
    })),

  focusIssue: (index) =>
    set((s) => ({ focusedIndex: index, version: s.version + 1 })),

  clearFocus: () =>
    set((s) => ({ focusedIndex: null, version: s.version + 1 })),
}));
