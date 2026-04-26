// ============================================================
// sortPreferenceStore — 사이드바 패널별 정렬 기준 (zustand + localStorage 영속)
// ============================================================
// 패널 키: 'world-note' | 'plot' | 'episode' | 'plan' | 'character'
//          | 'foreshadow' | 'idea-archive' | 'home-work'
//
// 정렬 옵션:
//   - manual: 사용자 sort_order (기본). 드래그 reorder 활성.
//   - recent: updated_at DESC (최근 편집순). 드래그 비활성.
//   - alpha:  title/name 가나다 순 (COLLATE NOCASE). 드래그 비활성.
// ============================================================

import { create } from 'zustand';

export type SortMode = 'manual' | 'recent' | 'alpha';

export type SortPanelKey =
  | 'world-note'
  | 'plot'
  | 'episode'
  | 'plan'
  | 'character'
  | 'foreshadow'
  | 'idea-archive'
  | 'home-work';

const STORAGE_KEY = 'folio.ui.sortPreference';

type Persisted = Partial<Record<SortPanelKey, SortMode>>;

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Persisted;
  } catch {
    return {};
  }
}

function persist(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

interface SortPreferenceState {
  byPanel: Persisted;
  get: (panel: SortPanelKey) => SortMode;
  set: (panel: SortPanelKey, mode: SortMode) => void;
}

export const useSortPreferenceStore = create<SortPreferenceState>((set, getState) => ({
  byPanel: load(),
  get: (panel) => getState().byPanel[panel] ?? 'manual',
  set: (panel, mode) => {
    const next = { ...getState().byPanel, [panel]: mode };
    persist(next);
    set({ byPanel: next });
  },
}));

/** SQL ORDER BY 절 생성 — title 컬럼명을 다르게 쓰는 테이블이 있어 인자로 받음 */
export function buildOrderBy(
  mode: SortMode,
  opts: {
    /** 가나다 정렬에 쓸 컬럼 — 'title' / 'name' / 'content' 등 */
    titleColumn: string;
  },
): string {
  switch (mode) {
    case 'recent':
      return `ORDER BY updated_at DESC, created_at DESC`;
    case 'alpha':
      return `ORDER BY ${opts.titleColumn} COLLATE NOCASE ASC, created_at ASC`;
    case 'manual':
    default:
      return `ORDER BY sort_order ASC, created_at ASC`;
  }
}
