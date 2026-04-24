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
  focusedIndex: number | null;
  version: number;

  setIssues: (issues: ReviewHighlightIssue[]) => void;
  clearIssues: () => void;
  focusIssue: (index: number) => void;
  clearFocus: () => void;
}

export const useReviewHighlightStore = create<ReviewHighlightState>((set) => ({
  issues: [],
  focusedIndex: null,
  version: 0,

  setIssues: (issues) =>
    set((s) => ({ issues, focusedIndex: null, version: s.version + 1 })),

  clearIssues: () =>
    set((s) => ({ issues: [], focusedIndex: null, version: s.version + 1 })),

  focusIssue: (index) =>
    set((s) => ({ focusedIndex: index, version: s.version + 1 })),

  clearFocus: () =>
    set((s) => ({ focusedIndex: null, version: s.version + 1 })),
}));
