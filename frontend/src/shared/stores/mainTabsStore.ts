// ============================================================
// mainTabsStore — 메인 패널 다중 탭 + 탭별 navigation history
// ============================================================
// VSCode 식 다중 문서 탭 모델:
// - 단일 클릭 = 활성 탭 doc 교체 (history.back push)
// - Ctrl/Cmd+Click = 새 탭 (중복 시 점프)
// - 동일 (section, itemId)는 한 탭만 (다중 view X)
// - { tabs, activeTabId }만 영속, history는 메모리 (재시작 시 비움)
// - 우측 패널은 글로벌 — 탭 전환과 무관
// ============================================================

import { create } from 'zustand';
import type { MainDoc, MainTab } from '../types/workspace';

const STORAGE_KEY = 'folio.ui.mainTabs';
const LEGACY_MAINDOC_KEY = 'folio.ui.mainDoc';
const HISTORY_LIMIT = 50;

interface HistoryEntry {
  back: MainDoc[];
  forward: MainDoc[];
}

interface PersistedState {
  tabs: MainTab[];
  activeTabId: string | null;
}

interface MainTabsState {
  tabs: MainTab[];
  activeTabId: string | null;
  /** 메모리 전용 — tabId → 그 탭의 back/forward 스택 */
  history: Record<string, HistoryEntry>;

  // queries
  getActiveTab: () => MainTab | null;
  getActiveDoc: () => MainDoc | null;
  canBack: () => boolean;
  canForward: () => boolean;

  // navigation actions
  /** 활성 탭 doc 교체 + 이전 doc을 history.back push. 중복 시 점프. 활성 없으면 새 탭. */
  replaceActive: (doc: MainDoc) => void;
  /** 새 탭에 doc 열기. 중복 시 점프. background=true면 활성 전환 X. */
  openTab: (doc: MainDoc, opts?: { background?: boolean }) => void;
  /** 빈 탭(welcome) 생성 */
  openBlankTab: () => void;
  /** 활성 탭의 doc만 변경 (history.back push) — 빈 탭 채우기 case 포함 */
  navigateActive: (doc: MainDoc) => void;

  // close
  closeTab: (tabId: string) => void;
  closeOthers: (tabId: string) => void;
  closeRight: (tabId: string) => void;
  closeAll: () => void;

  // active / order
  setActiveTab: (tabId: string) => void;
  reorderTabs: (orderedIds: string[]) => void;

  // history
  back: () => void;
  forward: () => void;

  // 마이그레이션 / 정리
  hydrateLegacyMainDoc: () => void;
  pruneStaleTabs: (validate: (doc: MainDoc) => boolean) => number;
}

function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tabs: [], activeTabId: null };
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.tabs)) return { tabs: [], activeTabId: null };
    return {
      tabs: parsed.tabs,
      activeTabId: parsed.activeTabId ?? null,
    };
  } catch {
    return { tabs: [], activeTabId: null };
  }
}

function persist(tabs: MainTab[], activeTabId: string | null): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tabs, activeTabId } satisfies PersistedState),
    );
  } catch {
    // storage quota 등 — 무시 (재시작 시 빈 상태로 시작)
  }
}

function newTabId(): string {
  return crypto.randomUUID();
}

function sameDoc(a: MainDoc | null, b: MainDoc | null): boolean {
  if (!a || !b) return a === b;
  return a.section === b.section && a.itemId === b.itemId;
}

function findTabByDoc(tabs: MainTab[], doc: MainDoc): number {
  return tabs.findIndex((t) => sameDoc(t.doc, doc));
}

/** history 깊이 제한 — 가장 오래된 것부터 drop */
function pushHistory(stack: MainDoc[], doc: MainDoc): MainDoc[] {
  const next = [...stack, doc];
  if (next.length > HISTORY_LIMIT) return next.slice(next.length - HISTORY_LIMIT);
  return next;
}

/** 활성 탭 닫을 때 다음 활성 후보 — 우측 → 좌측 → null */
function pickNextActive(
  tabs: MainTab[],
  closingIndex: number,
): string | null {
  if (closingIndex < tabs.length - 1) return tabs[closingIndex + 1].id;
  if (closingIndex > 0) return tabs[closingIndex - 1].id;
  return null;
}

export const useMainTabsStore = create<MainTabsState>((set, get) => ({
  tabs: loadPersisted().tabs,
  activeTabId: loadPersisted().activeTabId,
  history: {},

  // ── queries ──
  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId) ?? null;
  },
  getActiveDoc: () => {
    const tab = get().getActiveTab();
    return tab?.doc ?? null;
  },
  canBack: () => {
    const { activeTabId, history } = get();
    if (!activeTabId) return false;
    return (history[activeTabId]?.back.length ?? 0) > 0;
  },
  canForward: () => {
    const { activeTabId, history } = get();
    if (!activeTabId) return false;
    return (history[activeTabId]?.forward.length ?? 0) > 0;
  },

  // ── navigation ──
  replaceActive: (doc) => {
    const { tabs, activeTabId, history } = get();

    // 동일 doc이 다른 탭에 이미 존재 → 그 탭으로 점프
    const existingIdx = findTabByDoc(tabs, doc);
    if (existingIdx >= 0) {
      const existing = tabs[existingIdx];
      if (existing.id === activeTabId) return; // 활성 탭과 동일 → no-op
      set({ activeTabId: existing.id });
      persist(tabs, existing.id);
      return;
    }

    // 활성 탭 없으면 새 탭
    if (!activeTabId) {
      const id = newTabId();
      const next = [...tabs, { id, doc }];
      set({ tabs: next, activeTabId: id });
      persist(next, id);
      return;
    }

    // 활성 탭 doc 교체 + history push
    const activeIdx = tabs.findIndex((t) => t.id === activeTabId);
    if (activeIdx < 0) return;
    const prevDoc = tabs[activeIdx].doc;
    const nextTabs = [...tabs];
    nextTabs[activeIdx] = { ...nextTabs[activeIdx], doc };
    const prevEntry = history[activeTabId] ?? { back: [], forward: [] };
    const nextHistory = {
      ...history,
      [activeTabId]: {
        back: prevDoc ? pushHistory(prevEntry.back, prevDoc) : prevEntry.back,
        forward: [], // 새 navigation → forward 비움
      },
    };
    set({ tabs: nextTabs, history: nextHistory });
    persist(nextTabs, activeTabId);
  },

  navigateActive: (doc) => {
    // replaceActive와 본질적으로 동일 — alias
    get().replaceActive(doc);
  },

  openTab: (doc, opts) => {
    const { tabs, activeTabId } = get();
    const existingIdx = findTabByDoc(tabs, doc);
    if (existingIdx >= 0) {
      const existing = tabs[existingIdx];
      if (!opts?.background && activeTabId !== existing.id) {
        set({ activeTabId: existing.id });
        persist(tabs, existing.id);
      }
      return;
    }
    const id = newTabId();
    const next = [...tabs, { id, doc }];
    const nextActive = opts?.background ? activeTabId : id;
    set({ tabs: next, activeTabId: nextActive });
    persist(next, nextActive);
  },

  openBlankTab: () => {
    const { tabs } = get();
    const id = newTabId();
    const next = [...tabs, { id, doc: null }];
    set({ tabs: next, activeTabId: id });
    persist(next, id);
  },

  // ── close ──
  closeTab: (tabId) => {
    const { tabs, activeTabId, history } = get();
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx < 0) return;
    const nextTabs = tabs.filter((t) => t.id !== tabId);
    const nextHistory = { ...history };
    delete nextHistory[tabId];
    let nextActive = activeTabId;
    if (activeTabId === tabId) {
      nextActive = pickNextActive(tabs, idx);
    }
    set({ tabs: nextTabs, activeTabId: nextActive, history: nextHistory });
    persist(nextTabs, nextActive);
  },

  closeOthers: (tabId) => {
    const { tabs, history } = get();
    const target = tabs.find((t) => t.id === tabId);
    if (!target) return;
    const nextHistory: Record<string, HistoryEntry> = {};
    if (history[tabId]) nextHistory[tabId] = history[tabId];
    set({ tabs: [target], activeTabId: tabId, history: nextHistory });
    persist([target], tabId);
  },

  closeRight: (tabId) => {
    const { tabs, activeTabId, history } = get();
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx < 0) return;
    const kept = tabs.slice(0, idx + 1);
    const removed = tabs.slice(idx + 1);
    const keptIds = new Set(kept.map((t) => t.id));
    const nextHistory: Record<string, HistoryEntry> = {};
    for (const k of Object.keys(history)) {
      if (keptIds.has(k)) nextHistory[k] = history[k];
    }
    let nextActive = activeTabId;
    if (activeTabId && removed.some((t) => t.id === activeTabId)) {
      nextActive = tabId;
    }
    set({ tabs: kept, activeTabId: nextActive, history: nextHistory });
    persist(kept, nextActive);
  },

  closeAll: () => {
    set({ tabs: [], activeTabId: null, history: {} });
    persist([], null);
  },

  // ── active / order ──
  setActiveTab: (tabId) => {
    const { tabs } = get();
    if (!tabs.some((t) => t.id === tabId)) return;
    set({ activeTabId: tabId });
    persist(tabs, tabId);
  },

  reorderTabs: (orderedIds) => {
    const { tabs, activeTabId } = get();
    const map = new Map(tabs.map((t) => [t.id, t]));
    const next: MainTab[] = [];
    for (const id of orderedIds) {
      const t = map.get(id);
      if (t) next.push(t);
    }
    // 누락된 탭이 있으면 끝에 보존 (defensive)
    for (const t of tabs) {
      if (!orderedIds.includes(t.id)) next.push(t);
    }
    set({ tabs: next });
    persist(next, activeTabId);
  },

  // ── history ──
  back: () => {
    const { tabs, activeTabId, history } = get();
    if (!activeTabId) return;
    const entry = history[activeTabId];
    if (!entry || entry.back.length === 0) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    if (idx < 0) return;
    const currentDoc = tabs[idx].doc;
    const prev = entry.back[entry.back.length - 1];
    const nextBack = entry.back.slice(0, -1);
    const nextForward = currentDoc
      ? pushHistory(entry.forward, currentDoc)
      : entry.forward;
    const nextTabs = [...tabs];
    nextTabs[idx] = { ...nextTabs[idx], doc: prev };
    const nextHistory = {
      ...history,
      [activeTabId]: { back: nextBack, forward: nextForward },
    };
    set({ tabs: nextTabs, history: nextHistory });
    persist(nextTabs, activeTabId);
  },

  forward: () => {
    const { tabs, activeTabId, history } = get();
    if (!activeTabId) return;
    const entry = history[activeTabId];
    if (!entry || entry.forward.length === 0) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    if (idx < 0) return;
    const currentDoc = tabs[idx].doc;
    const nextDoc = entry.forward[entry.forward.length - 1];
    const nextForward = entry.forward.slice(0, -1);
    const nextBack = currentDoc
      ? pushHistory(entry.back, currentDoc)
      : entry.back;
    const nextTabs = [...tabs];
    nextTabs[idx] = { ...nextTabs[idx], doc: nextDoc };
    const nextHistory = {
      ...history,
      [activeTabId]: { back: nextBack, forward: nextForward },
    };
    set({ tabs: nextTabs, history: nextHistory });
    persist(nextTabs, activeTabId);
  },

  // ── 마이그레이션 / 정리 ──
  hydrateLegacyMainDoc: () => {
    const { tabs } = get();
    if (tabs.length > 0) {
      // 이미 새 store에 탭이 있으면 legacy 무시 + 키 정리
      try {
        localStorage.removeItem(LEGACY_MAINDOC_KEY);
      } catch {}
      return;
    }
    try {
      const raw = localStorage.getItem(LEGACY_MAINDOC_KEY);
      if (!raw) return;
      const legacy = JSON.parse(raw) as MainDoc | null;
      localStorage.removeItem(LEGACY_MAINDOC_KEY);
      if (!legacy || !legacy.section || !legacy.itemId) return;
      const id = newTabId();
      const next: MainTab[] = [{ id, doc: legacy }];
      set({ tabs: next, activeTabId: id });
      persist(next, id);
    } catch {
      // 파싱 실패 등 — 무시
    }
  },

  pruneStaleTabs: (validate) => {
    const { tabs, activeTabId, history } = get();
    const kept: MainTab[] = [];
    let removed = 0;
    for (const t of tabs) {
      if (t.doc === null || validate(t.doc)) {
        kept.push(t);
      } else {
        removed += 1;
      }
    }
    if (removed === 0) return 0;
    const keptIds = new Set(kept.map((t) => t.id));
    const nextHistory: Record<string, HistoryEntry> = {};
    for (const k of Object.keys(history)) {
      if (keptIds.has(k)) nextHistory[k] = history[k];
    }
    let nextActive = activeTabId;
    if (activeTabId && !keptIds.has(activeTabId)) {
      nextActive = kept[kept.length - 1]?.id ?? null;
    }
    set({ tabs: kept, activeTabId: nextActive, history: nextHistory });
    persist(kept, nextActive);
    return removed;
  },
}));
