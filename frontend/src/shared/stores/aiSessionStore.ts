import { create } from 'zustand';

export type AiScreen = 'menu' | 'draft-input' | 'draft-view' | 'review' | 'history-view';
export type DraftState = 'idle' | 'streaming' | 'done' | 'error';

export interface DraftEpisodeInfo {
  id: string;
  workId: string;
  title: string;
  sortOrder: number;
}

export interface DraftHistoryEntry {
  id: string;
  episode: DraftEpisodeInfo;
  storyline: string;
  userPrompt: string;
  model: string;
  result: string;
  createdAt: number; // Date.now()
}

const HISTORY_KEY = 'folio:ai-draft-history';
const MAX_HISTORY = 10;

function loadHistory(): DraftHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: DraftHistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
}

interface AiSessionStore {
  // 화면 상태
  screen: AiScreen;

  // 초안 생성 상태
  draftState: DraftState;
  draftResult: string;
  draftError: string;

  // 입력 폼
  storyline: string;
  userPrompt: string;
  model: string;

  // 생성 대상 에피소드 (생성 시점에 캡처)
  targetEpisode: DraftEpisodeInfo | null;

  // 스트리밍 제어
  activeAbort: AbortController | null;
  isStreaming: boolean;

  // 히스토리
  history: DraftHistoryEntry[];
  viewingHistoryId: string | null;

  // 액션
  setScreen: (screen: AiScreen) => void;
  setStoryline: (v: string) => void;
  setUserPrompt: (v: string) => void;
  setModel: (v: string) => void;

  startGeneration: (episode: DraftEpisodeInfo) => void;
  appendChunk: (chunk: string) => void;
  finishGeneration: () => void;
  failGeneration: (error: string) => void;
  stopGeneration: () => void;
  setAbort: (controller: AbortController | null) => void;
  resetSession: () => void;

  viewHistory: (id: string) => void;
  deleteHistory: (id: string) => void;
}

export const useAiSessionStore = create<AiSessionStore>((set, get) => ({
  screen: 'menu',
  draftState: 'idle',
  draftResult: '',
  draftError: '',
  storyline: '',
  userPrompt: '',
  model: 'sonnet',
  targetEpisode: null,
  activeAbort: null,
  isStreaming: false,
  history: loadHistory(),
  viewingHistoryId: null,

  setScreen: (screen) => set({ screen, viewingHistoryId: null }),
  setStoryline: (storyline) => set({ storyline }),
  setUserPrompt: (userPrompt) => set({ userPrompt }),
  setModel: (model) => set({ model }),

  startGeneration: (episode) =>
    set({
      screen: 'draft-view',
      draftState: 'streaming',
      draftResult: '',
      draftError: '',
      targetEpisode: episode,
      isStreaming: true,
      viewingHistoryId: null,
    }),

  appendChunk: (chunk) =>
    set((s) => ({ draftResult: s.draftResult + chunk })),

  finishGeneration: () => {
    const { draftResult, targetEpisode, storyline, userPrompt, model, history } = get();
    if (draftResult && targetEpisode) {
      const entry: DraftHistoryEntry = {
        id: crypto.randomUUID(),
        episode: targetEpisode,
        storyline,
        userPrompt,
        model,
        result: draftResult,
        createdAt: Date.now(),
      };
      const updated = [entry, ...history].slice(0, MAX_HISTORY);
      saveHistory(updated);
      set({ draftState: 'done', isStreaming: false, activeAbort: null, history: updated });
    } else {
      set({ draftState: 'done', isStreaming: false, activeAbort: null });
    }
  },

  failGeneration: (error) =>
    set({ draftState: 'error', draftError: error, isStreaming: false, activeAbort: null }),

  stopGeneration: () => {
    const { activeAbort, draftResult, targetEpisode, storyline, userPrompt, model, history } = get();
    activeAbort?.abort();
    // 중단 시에도 결과가 있으면 히스토리에 저장
    if (draftResult && targetEpisode) {
      const entry: DraftHistoryEntry = {
        id: crypto.randomUUID(),
        episode: targetEpisode,
        storyline,
        userPrompt,
        model,
        result: draftResult,
        createdAt: Date.now(),
      };
      const updated = [entry, ...history].slice(0, MAX_HISTORY);
      saveHistory(updated);
      set({ draftState: 'done', isStreaming: false, activeAbort: null, history: updated });
    } else {
      set({ draftState: 'done', isStreaming: false, activeAbort: null });
    }
  },

  setAbort: (controller) => set({ activeAbort: controller }),

  resetSession: () => {
    const { activeAbort } = get();
    activeAbort?.abort();
    set({
      screen: 'menu',
      draftState: 'idle',
      draftResult: '',
      draftError: '',
      storyline: '',
      userPrompt: '',
      model: 'sonnet',
      targetEpisode: null,
      activeAbort: null,
      isStreaming: false,
      viewingHistoryId: null,
    });
  },

  viewHistory: (id) => {
    const entry = get().history.find((h) => h.id === id);
    if (!entry) return;
    set({
      screen: 'history-view',
      viewingHistoryId: id,
      draftResult: entry.result,
      draftState: 'done',
      draftError: '',
      targetEpisode: entry.episode,
      storyline: entry.storyline,
      userPrompt: entry.userPrompt,
      model: entry.model,
    });
  },

  deleteHistory: (id) => {
    const updated = get().history.filter((h) => h.id !== id);
    saveHistory(updated);
    set((s) => ({
      history: updated,
      // 삭제한 항목을 보고 있었으면 메뉴로 복귀
      ...(s.viewingHistoryId === id ? { screen: 'menu' as const, viewingHistoryId: null } : {}),
    }));
  },
}));
