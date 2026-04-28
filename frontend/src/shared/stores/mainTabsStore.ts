// ============================================================
// mainTabsStore — 메인 패널 다중 탭 (작품별 탭 세트 분리 보존)
// ============================================================
// 모델:
// - tabs: 모든 작품의 탭이 평면 배열로 누적, 각 탭은 workId 필드 보유
// - currentWorkId: AuthenticatedApp이 selectedWorkId 변경 시 동기화 (메모리 전용)
// - activeTabIdByWork: workId → 그 작품의 활성 탭 id (null = 활성 해제 = 홈)
// - 화면에는 currentWorkId 컨텍스트의 탭만 노출 (getCurrentTabs)
// - 작품 전환 시 다른 작품의 탭은 그대로 남아 다시 진입하면 복원됨
// - 영속: tabs + activeTabIdByWork (currentWorkId, history는 메모리)
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
  activeTabIdByWork: Record<string, string | null>;
}

interface MainTabsState {
  /** 현재 활성 작품 — AuthenticatedApp 이 selectedWorkId 변경 시 동기화. null = 작품 미선택. */
  currentWorkId: string | null;
  /** 모든 작품의 탭이 평면 배열. 화면에는 currentWorkId 컨텍스트의 탭만 노출. */
  tabs: MainTab[];
  /** workId → 그 작품의 활성 탭 id. null = 활성 해제 (홈 화면 노출). */
  activeTabIdByWork: Record<string, string | null>;
  /** 메모리 전용 — tabId → 그 탭의 back/forward 스택 */
  history: Record<string, HistoryEntry>;

  // ── queries (현재 작품 컨텍스트 기준) ──
  /** 현재 작품의 탭 배열 (UI 노출용). currentWorkId null 이면 빈 배열. */
  getCurrentTabs: () => MainTab[];
  /** 현재 작품의 활성 탭 id (없으면 null). */
  getCurrentActiveTabId: () => string | null;
  getActiveTab: () => MainTab | null;
  getActiveDoc: () => MainDoc | null;
  canBack: () => boolean;
  canForward: () => boolean;

  // ── 작품 컨텍스트 ──
  setCurrentWorkId: (workId: string | null) => void;
  /** 현재 작품의 활성 탭만 해제 (탭 자체는 보존). 홈 아이콘 클릭용. */
  clearActive: () => void;
  /** 특정 작품의 모든 탭을 제거. 작품 삭제용. */
  closeWorkTabs: (workId: string) => void;

  // ── navigation actions (currentWorkId 컨텍스트로 동작) ──
  /** 활성 탭 doc 교체 + history.back push. 동일 doc 다른 탭 있으면 점프. 활성 없으면 새 탭. */
  replaceActive: (doc: MainDoc) => void;
  /** 새 탭에 doc 열기. 중복 시 점프. background=true면 활성 전환 X. */
  openTab: (doc: MainDoc, opts?: { background?: boolean }) => void;
  /** 빈 탭(welcome) 생성 */
  openBlankTab: () => void;
  /** 활성 탭의 doc만 변경 (history.back push) — 빈 탭 채우기 case 포함 */
  navigateActive: (doc: MainDoc) => void;

  // ── close ──
  closeTab: (tabId: string) => void;
  closeOthers: (tabId: string) => void;
  closeRight: (tabId: string) => void;
  /** 현재 작품의 탭만 모두 닫음. 다른 작품 탭은 보존. */
  closeAll: () => void;

  // ── active / order ──
  setActiveTab: (tabId: string) => void;
  reorderTabs: (orderedIds: string[]) => void;

  // ── history ──
  back: () => void;
  forward: () => void;

  // ── 마이그레이션 / 정리 ──
  hydrateLegacyMainDoc: () => void;
  pruneStaleTabs: (validate: (doc: MainDoc) => boolean) => number;
}

function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tabs: [], activeTabIdByWork: {} };
    const parsed = JSON.parse(raw) as Partial<PersistedState> & {
      activeTabId?: string | null;
    };
    if (!Array.isArray(parsed.tabs)) return { tabs: [], activeTabIdByWork: {} };
    // 새 형식: 모든 탭이 workId 필드 보유
    const valid = parsed.tabs.every(
      (t) =>
        t &&
        typeof (t as MainTab).id === 'string' &&
        'workId' in (t as MainTab),
    );
    if (!valid) {
      // 구 형식 감지 → 무효화 (탭 모델이 작품별로 바뀜, 안전한 reset)
      // eslint-disable-next-line no-console
      console.warn(
        '[mainTabsStore] 구 형식 localStorage 감지 — 새 작품별 탭 모델로 reset 합니다.',
      );
      return { tabs: [], activeTabIdByWork: {} };
    }
    const activeTabIdByWork =
      parsed.activeTabIdByWork && typeof parsed.activeTabIdByWork === 'object'
        ? (parsed.activeTabIdByWork as Record<string, string | null>)
        : {};
    return { tabs: parsed.tabs as MainTab[], activeTabIdByWork };
  } catch {
    return { tabs: [], activeTabIdByWork: {} };
  }
}

function persist(
  tabs: MainTab[],
  activeTabIdByWork: Record<string, string | null>,
): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tabs, activeTabIdByWork } satisfies PersistedState),
    );
  } catch {
    // storage quota 등 — 무시
  }
}

function newTabId(): string {
  return crypto.randomUUID();
}

function sameDoc(a: MainDoc | null, b: MainDoc | null): boolean {
  if (!a || !b) return a === b;
  return a.section === b.section && a.itemId === b.itemId;
}

/** 작품 컨텍스트 안에서만 동일 doc 탭 검색 */
function findTabByDocInWork(
  tabs: MainTab[],
  doc: MainDoc,
  workId: string,
): number {
  return tabs.findIndex((t) => t.workId === workId && sameDoc(t.doc, doc));
}

function pushHistory(stack: MainDoc[], doc: MainDoc): MainDoc[] {
  const next = [...stack, doc];
  if (next.length > HISTORY_LIMIT) return next.slice(next.length - HISTORY_LIMIT);
  return next;
}

/** 활성 탭 닫을 때 다음 활성 후보 — 같은 작품 내에서 우측 → 좌측 → null */
function pickNextActiveInWork(
  tabs: MainTab[],
  workId: string,
  closingTabId: string,
): string | null {
  const inWork = tabs.filter((t) => t.workId === workId);
  const idx = inWork.findIndex((t) => t.id === closingTabId);
  if (idx < 0) return null;
  if (idx < inWork.length - 1) return inWork[idx + 1].id;
  if (idx > 0) return inWork[idx - 1].id;
  return null;
}

function warnNoWorkContext(action: string): void {
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      `[mainTabsStore] ${action} 호출됐으나 currentWorkId가 null — no-op.`,
    );
  }
}

const initial = loadPersisted();

export const useMainTabsStore = create<MainTabsState>((set, get) => ({
  currentWorkId: null,
  tabs: initial.tabs,
  activeTabIdByWork: initial.activeTabIdByWork,
  history: {},

  // ── queries ──
  getCurrentTabs: () => {
    const { tabs, currentWorkId } = get();
    if (!currentWorkId) return [];
    return tabs.filter((t) => t.workId === currentWorkId);
  },
  getCurrentActiveTabId: () => {
    const { activeTabIdByWork, currentWorkId } = get();
    if (!currentWorkId) return null;
    return activeTabIdByWork[currentWorkId] ?? null;
  },
  getActiveTab: () => {
    const activeId = get().getCurrentActiveTabId();
    if (!activeId) return null;
    return get().tabs.find((t) => t.id === activeId) ?? null;
  },
  getActiveDoc: () => {
    const tab = get().getActiveTab();
    return tab?.doc ?? null;
  },
  canBack: () => {
    const activeId = get().getCurrentActiveTabId();
    if (!activeId) return false;
    return (get().history[activeId]?.back.length ?? 0) > 0;
  },
  canForward: () => {
    const activeId = get().getCurrentActiveTabId();
    if (!activeId) return false;
    return (get().history[activeId]?.forward.length ?? 0) > 0;
  },

  // ── 작품 컨텍스트 ──
  setCurrentWorkId: (workId) => {
    const { currentWorkId } = get();
    if (currentWorkId === workId) return;
    set({ currentWorkId: workId });
    // 영속화 대상 아님 — 메모리 전용. selectedWorkId(컴포넌트 state)가 진실의 원천.
  },

  clearActive: () => {
    const { currentWorkId, activeTabIdByWork, tabs } = get();
    if (!currentWorkId) return;
    if (activeTabIdByWork[currentWorkId] === null) return;
    const nextMap = { ...activeTabIdByWork, [currentWorkId]: null };
    set({ activeTabIdByWork: nextMap });
    persist(tabs, nextMap);
  },

  closeWorkTabs: (workId) => {
    const { tabs, activeTabIdByWork, history } = get();
    const removed = tabs.filter((t) => t.workId === workId);
    if (removed.length === 0 && !(workId in activeTabIdByWork)) return;
    const nextTabs = tabs.filter((t) => t.workId !== workId);
    const nextMap = { ...activeTabIdByWork };
    delete nextMap[workId];
    const nextHistory = { ...history };
    for (const t of removed) delete nextHistory[t.id];
    set({ tabs: nextTabs, activeTabIdByWork: nextMap, history: nextHistory });
    persist(nextTabs, nextMap);
  },

  // ── navigation ──
  replaceActive: (doc) => {
    const { tabs, activeTabIdByWork, currentWorkId, history } = get();
    if (!currentWorkId) {
      warnNoWorkContext('replaceActive');
      return;
    }
    const activeTabId = activeTabIdByWork[currentWorkId] ?? null;

    // 동일 doc이 같은 작품의 다른 탭에 이미 존재 → 그 탭으로 점프
    const existingIdx = findTabByDocInWork(tabs, doc, currentWorkId);
    if (existingIdx >= 0) {
      const existing = tabs[existingIdx];
      if (existing.id === activeTabId) return; // 활성 탭과 동일 → no-op
      const nextMap = { ...activeTabIdByWork, [currentWorkId]: existing.id };
      set({ activeTabIdByWork: nextMap });
      persist(tabs, nextMap);
      return;
    }

    // 활성 탭 없으면 새 탭
    if (!activeTabId) {
      const id = newTabId();
      const next = [...tabs, { id, doc, workId: currentWorkId }];
      const nextMap = { ...activeTabIdByWork, [currentWorkId]: id };
      set({ tabs: next, activeTabIdByWork: nextMap });
      persist(next, nextMap);
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
        forward: [],
      },
    };
    set({ tabs: nextTabs, history: nextHistory });
    persist(nextTabs, activeTabIdByWork);
  },

  navigateActive: (doc) => {
    get().replaceActive(doc);
  },

  openTab: (doc, opts) => {
    const { tabs, activeTabIdByWork, currentWorkId } = get();
    if (!currentWorkId) {
      warnNoWorkContext('openTab');
      return;
    }
    const activeTabId = activeTabIdByWork[currentWorkId] ?? null;
    const existingIdx = findTabByDocInWork(tabs, doc, currentWorkId);
    if (existingIdx >= 0) {
      const existing = tabs[existingIdx];
      if (!opts?.background && activeTabId !== existing.id) {
        const nextMap = { ...activeTabIdByWork, [currentWorkId]: existing.id };
        set({ activeTabIdByWork: nextMap });
        persist(tabs, nextMap);
      }
      return;
    }
    const id = newTabId();
    const next = [...tabs, { id, doc, workId: currentWorkId }];
    const nextActive = opts?.background ? activeTabId : id;
    const nextMap = { ...activeTabIdByWork, [currentWorkId]: nextActive };
    set({ tabs: next, activeTabIdByWork: nextMap });
    persist(next, nextMap);
  },

  openBlankTab: () => {
    const { tabs, activeTabIdByWork, currentWorkId } = get();
    if (!currentWorkId) {
      warnNoWorkContext('openBlankTab');
      return;
    }
    const id = newTabId();
    const next = [...tabs, { id, doc: null, workId: currentWorkId }];
    const nextMap = { ...activeTabIdByWork, [currentWorkId]: id };
    set({ tabs: next, activeTabIdByWork: nextMap });
    persist(next, nextMap);
  },

  // ── close ──
  closeTab: (tabId) => {
    const { tabs, activeTabIdByWork, history } = get();
    const target = tabs.find((t) => t.id === tabId);
    if (!target) return;
    const workId = target.workId;
    const nextTabs = tabs.filter((t) => t.id !== tabId);
    const nextHistory = { ...history };
    delete nextHistory[tabId];
    const nextMap = { ...activeTabIdByWork };
    if (workId !== null && nextMap[workId] === tabId) {
      nextMap[workId] = pickNextActiveInWork(tabs, workId, tabId);
    }
    set({ tabs: nextTabs, activeTabIdByWork: nextMap, history: nextHistory });
    persist(nextTabs, nextMap);
  },

  closeOthers: (tabId) => {
    const { tabs, activeTabIdByWork, history } = get();
    const target = tabs.find((t) => t.id === tabId);
    if (!target) return;
    const workId = target.workId;
    // 같은 작품의 다른 탭만 닫음 — 다른 작품 탭은 보존
    const removed = tabs.filter((t) => t.workId === workId && t.id !== tabId);
    const nextTabs = tabs.filter((t) => t.workId !== workId || t.id === tabId);
    const nextHistory = { ...history };
    for (const t of removed) delete nextHistory[t.id];
    const nextMap = { ...activeTabIdByWork };
    if (workId !== null) nextMap[workId] = tabId;
    set({ tabs: nextTabs, activeTabIdByWork: nextMap, history: nextHistory });
    persist(nextTabs, nextMap);
  },

  closeRight: (tabId) => {
    const { tabs, activeTabIdByWork, history } = get();
    const target = tabs.find((t) => t.id === tabId);
    if (!target) return;
    const workId = target.workId;
    // 같은 작품 내에서 그 탭의 오른쪽만 닫음
    const inWork = tabs.filter((t) => t.workId === workId);
    const idxInWork = inWork.findIndex((t) => t.id === tabId);
    if (idxInWork < 0) return;
    const removedIds = new Set(
      inWork.slice(idxInWork + 1).map((t) => t.id),
    );
    if (removedIds.size === 0) return;
    const nextTabs = tabs.filter((t) => !removedIds.has(t.id));
    const nextHistory = { ...history };
    for (const id of removedIds) delete nextHistory[id];
    const nextMap = { ...activeTabIdByWork };
    if (workId !== null && nextMap[workId] && removedIds.has(nextMap[workId]!)) {
      nextMap[workId] = tabId;
    }
    set({ tabs: nextTabs, activeTabIdByWork: nextMap, history: nextHistory });
    persist(nextTabs, nextMap);
  },

  closeAll: () => {
    // 의미 변경: 현재 작품의 탭만 닫음. 모든 작품 청소가 필요하면 closeWorkTabs를 작품별로 호출.
    const { currentWorkId } = get();
    if (!currentWorkId) return;
    get().closeWorkTabs(currentWorkId);
  },

  // ── active / order ──
  setActiveTab: (tabId) => {
    const { tabs, activeTabIdByWork } = get();
    const target = tabs.find((t) => t.id === tabId);
    if (!target || target.workId === null) return;
    const workId = target.workId;
    if (activeTabIdByWork[workId] === tabId) return;
    const nextMap = { ...activeTabIdByWork, [workId]: tabId };
    set({ activeTabIdByWork: nextMap });
    persist(tabs, nextMap);
  },

  reorderTabs: (orderedIds) => {
    // orderedIds 는 현재 작품 탭의 새 순서. 다른 작품 탭은 위치 보존.
    const { tabs, activeTabIdByWork, currentWorkId } = get();
    if (!currentWorkId) return;
    const orderedSet = new Set(orderedIds);
    const inWorkMap = new Map(
      tabs.filter((t) => t.workId === currentWorkId).map((t) => [t.id, t]),
    );
    const nextInWork: MainTab[] = [];
    for (const id of orderedIds) {
      const t = inWorkMap.get(id);
      if (t) nextInWork.push(t);
    }
    // 누락된 같은 작품 탭은 끝에 보존 (defensive)
    for (const [id, t] of inWorkMap.entries()) {
      if (!orderedSet.has(id)) nextInWork.push(t);
    }
    // 다른 작품 탭은 원 위치 그대로, 현재 작품 탭만 새 순서로 stitch back
    const inWorkIter = nextInWork[Symbol.iterator]();
    const next: MainTab[] = tabs.map((t) =>
      t.workId === currentWorkId ? inWorkIter.next().value ?? t : t,
    );
    set({ tabs: next });
    persist(next, activeTabIdByWork);
  },

  // ── history ──
  back: () => {
    const { tabs, history, currentWorkId, activeTabIdByWork } = get();
    if (!currentWorkId) return;
    const activeTabId = activeTabIdByWork[currentWorkId] ?? null;
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
    persist(nextTabs, activeTabIdByWork);
  },

  forward: () => {
    const { tabs, history, currentWorkId, activeTabIdByWork } = get();
    if (!currentWorkId) return;
    const activeTabId = activeTabIdByWork[currentWorkId] ?? null;
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
    persist(nextTabs, activeTabIdByWork);
  },

  // ── 마이그레이션 / 정리 ──
  hydrateLegacyMainDoc: () => {
    const { tabs, currentWorkId, activeTabIdByWork } = get();
    if (tabs.length > 0) {
      // 이미 새 store에 탭이 있으면 legacy 무시 + 키 정리
      try {
        localStorage.removeItem(LEGACY_MAINDOC_KEY);
      } catch {}
      return;
    }
    if (!currentWorkId) {
      // 작품 컨텍스트 없으면 legacy doc을 어느 작품에도 귀속 못 함 → 그냥 키만 정리
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
      const next: MainTab[] = [{ id, doc: legacy, workId: currentWorkId }];
      const nextMap = { ...activeTabIdByWork, [currentWorkId]: id };
      set({ tabs: next, activeTabIdByWork: nextMap });
      persist(next, nextMap);
    } catch {
      // 파싱 실패 등 — 무시
    }
  },

  pruneStaleTabs: (validate) => {
    const { tabs, activeTabIdByWork, history } = get();
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
    // 작품별 활성 탭이 제거됐으면 그 작품에서 마지막 남은 탭으로 대체 (없으면 null)
    const nextMap: Record<string, string | null> = { ...activeTabIdByWork };
    for (const workId of Object.keys(nextMap)) {
      const cur = nextMap[workId];
      if (cur && !keptIds.has(cur)) {
        const lastInWork = [...kept].reverse().find((t) => t.workId === workId);
        nextMap[workId] = lastInWork?.id ?? null;
      }
    }
    set({ tabs: kept, activeTabIdByWork: nextMap, history: nextHistory });
    persist(kept, nextMap);
    return removed;
  },
}));
