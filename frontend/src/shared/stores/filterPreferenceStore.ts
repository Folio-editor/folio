// ============================================================
// filterPreferenceStore — 사이드바 패널별 필터 (다중 선택)
// ============================================================
// 패널별 가능한 필드:
//   episode      → status (미작성/초고/퇴고/완성)
//   plot         → status (예정/작성중/완료)  *회차 자식만 status 보유*
//   character    → gender (male/female/other)
//   foreshadow   → priority (상/중/하)
//   idea-archive → tag (12개 태그)
//   plan / world-note / home-work → 없음 (UI에서 비활성)
// ============================================================

import { create } from 'zustand';
import type { SortPanelKey } from './sortPreferenceStore';

const STORAGE_KEY = 'folio.ui.filterPreference';

/** 빈 필터 default reference (stable) — selector에서 매 렌더 새 배열 반환 시 무한 루프 방지 */
export const EMPTY_FILTER: readonly string[] = Object.freeze([]);

type Persisted = Partial<Record<SortPanelKey, string[]>>;

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

interface FilterState {
  byPanel: Persisted;
  /** 다중 토글 — 이미 있으면 제거, 없으면 추가 */
  toggle: (panel: SortPanelKey, value: string) => void;
  set: (panel: SortPanelKey, values: string[]) => void;
  clear: (panel: SortPanelKey) => void;
}

export const useFilterPreferenceStore = create<FilterState>((set, getState) => ({
  byPanel: load(),
  toggle: (panel, value) => {
    const cur = getState().byPanel[panel] ?? [];
    const next = cur.includes(value)
      ? cur.filter((v) => v !== value)
      : [...cur, value];
    const updated = { ...getState().byPanel, [panel]: next };
    persist(updated);
    set({ byPanel: updated });
  },
  set: (panel, values) => {
    const updated = { ...getState().byPanel, [panel]: values };
    persist(updated);
    set({ byPanel: updated });
  },
  clear: (panel) => {
    const updated = { ...getState().byPanel };
    delete updated[panel];
    persist(updated);
    set({ byPanel: updated });
  },
}));

/** SQL IN 절 빌더 — 빈 배열이면 빈 문자열 반환 */
export function buildInClause(
  column: string,
  values: string[],
  prefix = 'AND',
): { sql: string; params: string[] } {
  if (values.length === 0) return { sql: '', params: [] };
  const placeholders = values.map(() => '?').join(', ');
  return {
    sql: `${prefix} ${column} IN (${placeholders})`,
    params: values,
  };
}
