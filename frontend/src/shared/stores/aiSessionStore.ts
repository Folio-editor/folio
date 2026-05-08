import { create } from 'zustand';

export type AiScreen = 'menu' | 'draft-input' | 'draft-view' | 'review-input' | 'review-result' | 'spellcheck-input' | 'spellcheck-result' | 'history-view' | 'review-history-view' | 'spellcheck-history-view';

/**
 * AiScreen → 사용자에게 노출되는 도구명. 우측 패널 공통 헤더가
 * `AI 도구 > <도구명>` breadcrumb 으로 통합 표시할 때 사용.
 * `menu` 는 null — sub-screen이 아니므로 breadcrumb 없음.
 */
export function getAiToolName(screen: AiScreen): string | null {
  switch (screen) {
    case 'draft-input':
    case 'draft-view':
    case 'history-view':
      return '초안 생성';
    case 'review-input':
    case 'review-result':
    case 'review-history-view':
      return '원고 검수';
    case 'spellcheck-input':
    case 'spellcheck-result':
    case 'spellcheck-history-view':
      return '맞춤법 검사';
    case 'menu':
    default:
      return null;
  }
}
export type DraftState = 'idle' | 'streaming' | 'done' | 'error';
export type ReviewState = 'idle' | 'loading' | 'done' | 'error';
export type SpellcheckState = 'idle' | 'loading' | 'done' | 'error';

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

export interface ReviewIssue {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  lines: number[];
  location: string;
  description: string;
  reference: string;
  suggestion: string;
}

export interface ReviewResult {
  issues: ReviewIssue[];
  summary: string;
  score: number;
}

export interface ReviewHistoryEntry {
  id: string;
  workId: string;
  episode: DraftEpisodeInfo;
  result: ReviewResult;
  createdAt: number;
}

export interface SpellcheckIssue {
  type: 'typo' | 'spacing' | 'punctuation';
  line: number;
  original: string;
  suggestion: string;
  reason: string;
}

export interface SpellcheckResult {
  issues: SpellcheckIssue[];
  summary: string;
}

export interface SpellcheckHistoryEntry {
  id: string;
  workId: string;
  episode: DraftEpisodeInfo;
  result: SpellcheckResult;
  createdAt: number;
}

const HISTORY_KEY = 'folio:ai-draft-history';
const REVIEW_HISTORY_KEY = 'folio:ai-review-history';
const SPELLCHECK_HISTORY_KEY = 'folio:ai-spellcheck-history';
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

function loadReviewHistory(): ReviewHistoryEntry[] {
  try {
    const raw = localStorage.getItem(REVIEW_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReviewHistory(entries: ReviewHistoryEntry[]) {
  localStorage.setItem(REVIEW_HISTORY_KEY, JSON.stringify(entries));
}

function loadSpellcheckHistory(): SpellcheckHistoryEntry[] {
  try {
    const raw = localStorage.getItem(SPELLCHECK_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSpellcheckHistory(entries: SpellcheckHistoryEntry[]) {
  localStorage.setItem(SPELLCHECK_HISTORY_KEY, JSON.stringify(entries));
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

  /**
   * AI 작업의 등록된 대상 episode id.
   * 메인 탭이 다른 문서로 바뀌어도 유지된다 — 사용자가 명시적으로
   * 다른 원고를 등록(자동 등록 또는 setPinnedEpisodeId)하지 않는 한 변경 없음.
   * null: 등록 해제 상태.
   */
  pinnedEpisodeId: string | null;
  /**
   * X 버튼으로 명시적으로 해제한 episode id. 같은 원고가 mainItemId로
   * 유지되는 동안 useEffect가 다시 자동 pin하지 못하도록 가드.
   * mainItemId가 다른 원고로 바뀌면 자동 pin이 정상 동작.
   */
  unpinnedFromEpisodeId: string | null;

  // 생성 대상 에피소드 (생성 시점에 캡처)
  targetEpisode: DraftEpisodeInfo | null;

  // 스트리밍 제어
  activeAbort: AbortController | null;
  isStreaming: boolean;

  // 히스토리
  history: DraftHistoryEntry[];
  viewingHistoryId: string | null;

  // 검수 상태
  reviewState: ReviewState;
  reviewResult: ReviewResult | null;
  reviewError: string;
  reviewTargetEpisode: DraftEpisodeInfo | null;

  // 검수 히스토리
  reviewHistory: ReviewHistoryEntry[];
  viewingReviewHistoryId: string | null;

  spellcheckState: SpellcheckState;
  spellcheckResult: SpellcheckResult | null;
  spellcheckError: string;
  spellcheckTargetEpisode: DraftEpisodeInfo | null;
  spellcheckHistory: SpellcheckHistoryEntry[];
  viewingSpellcheckHistoryId: string | null;
  spellcheckAppliedIssues: number[];
  /** 본문 하이라이트 extension 의 캐시 무효화용 카운터. result/applied/hover 변경 시 increment. */
  spellcheckVersion: number;
  /** 카드 ↔ 본문 hover 동기화 — 사용자가 카드에 hover 한 issue 인덱스. */
  spellcheckHoveredIssue: number | null;
  /**
   * '선택 영역만 검사' 모드일 때 사용자가 드래그한 PM doc 위치 범위.
   * null = 회차 전체 검사 모드. 적용 핸들러와 하이라이트가 이 범위로 검색 scope 를 좁힌다.
   */
  spellcheckSelectionRange: { from: number; to: number } | null;

  // 액션
  setScreen: (screen: AiScreen) => void;
  setStoryline: (v: string) => void;
  setUserPrompt: (v: string) => void;
  setModel: (v: string) => void;
  /** AI 대상 원고 등록(또는 교체). unpinned 가드를 해제하고 새 episode를 pin. */
  setPinnedEpisodeId: (id: string) => void;
  /** X 버튼으로 등록 해제. 같은 mainItemId로의 자동 재pin을 막기 위해 unpinnedFromEpisodeId에 기록. */
  clearPinnedEpisodeId: () => void;

  startGeneration: (episode: DraftEpisodeInfo) => void;
  appendChunk: (chunk: string) => void;
  finishGeneration: () => void;
  failGeneration: (error: string) => void;
  stopGeneration: () => void;
  setAbort: (controller: AbortController | null) => void;
  resetSession: () => void;

  viewHistory: (id: string) => void;
  deleteHistory: (id: string) => void;

  // 검수 액션
  startReview: (episode: DraftEpisodeInfo) => void;
  finishReview: (result: ReviewResult) => void;
  failReview: (error: string) => void;
  viewReviewHistory: (id: string) => void;
  deleteReviewHistory: (id: string) => void;
  startSpellcheck: (episode: DraftEpisodeInfo, selectionRange?: { from: number; to: number } | null) => void;
  finishSpellcheck: (result: SpellcheckResult) => void;
  failSpellcheck: (error: string) => void;
  viewSpellcheckHistory: (id: string) => void;
  deleteSpellcheckHistory: (id: string) => void;
  markSpellcheckIssueApplied: (index: number) => void;
  setSpellcheckHoveredIssue: (index: number | null) => void;
}

export const useAiSessionStore = create<AiSessionStore>((set, get) => ({
  screen: 'menu',
  draftState: 'idle',
  draftResult: '',
  draftError: '',
  storyline: '',
  userPrompt: '',
  model: 'sonnet',
  pinnedEpisodeId: null,
  unpinnedFromEpisodeId: null,
  targetEpisode: null,
  activeAbort: null,
  isStreaming: false,
  history: loadHistory(),
  viewingHistoryId: null,

  reviewState: 'idle',
  reviewResult: null,
  reviewError: '',
  reviewTargetEpisode: null,
  reviewHistory: loadReviewHistory(),
  viewingReviewHistoryId: null,
  spellcheckState: 'idle',
  spellcheckResult: null,
  spellcheckError: '',
  spellcheckTargetEpisode: null,
  spellcheckHistory: loadSpellcheckHistory(),
  viewingSpellcheckHistoryId: null,
  spellcheckAppliedIssues: [],
  spellcheckVersion: 0,
  spellcheckHoveredIssue: null,
  spellcheckSelectionRange: null,

  setScreen: (screen) => set({ screen, viewingHistoryId: null, viewingReviewHistoryId: null, viewingSpellcheckHistoryId: null }),
  setStoryline: (storyline) => set({ storyline }),
  setUserPrompt: (userPrompt) => set({ userPrompt }),
  setModel: (model) => set({ model }),
  setPinnedEpisodeId: (id) =>
    set({ pinnedEpisodeId: id, unpinnedFromEpisodeId: null }),
  clearPinnedEpisodeId: () =>
    set((s) => ({
      pinnedEpisodeId: null,
      unpinnedFromEpisodeId: s.pinnedEpisodeId,
    })),

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
      pinnedEpisodeId: null,
      unpinnedFromEpisodeId: null,
      targetEpisode: null,
      activeAbort: null,
      isStreaming: false,
      viewingHistoryId: null,
      reviewState: 'idle',
      reviewResult: null,
      reviewError: '',
      reviewTargetEpisode: null,
      viewingReviewHistoryId: null,
      spellcheckState: 'idle',
      spellcheckResult: null,
      spellcheckError: '',
      spellcheckTargetEpisode: null,
      viewingSpellcheckHistoryId: null,
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
      // 삭제한 항목을 보고 있었으면 초안 입력 화면으로 복귀
      ...(s.viewingHistoryId === id ? { screen: 'draft-input' as const, viewingHistoryId: null } : {}),
    }));
  },

  // ── 검수 액션 ──

  startReview: (episode) =>
    set({
      screen: 'review-result',
      reviewState: 'loading',
      reviewResult: null,
      reviewError: '',
      reviewTargetEpisode: episode,
      viewingReviewHistoryId: null,
    }),

  finishReview: (result) => {
    const { reviewTargetEpisode, reviewHistory } = get();
    if (reviewTargetEpisode) {
      const entry: ReviewHistoryEntry = {
        id: crypto.randomUUID(),
        workId: reviewTargetEpisode.workId,
        episode: reviewTargetEpisode,
        result,
        createdAt: Date.now(),
      };
      // 같은 워크스페이스 기준 10개 제한
      const sameWork = reviewHistory.filter((h) => h.workId === entry.workId);
      const otherWork = reviewHistory.filter((h) => h.workId !== entry.workId);
      const updated = [entry, ...sameWork].slice(0, MAX_HISTORY);
      const all = [...updated, ...otherWork];
      saveReviewHistory(all);
      set({ reviewState: 'done', reviewResult: result, reviewHistory: all });
    } else {
      set({ reviewState: 'done', reviewResult: result });
    }
  },

  failReview: (error) =>
    set({ reviewState: 'error', reviewError: error }),

  viewReviewHistory: (id) => {
    const entry = get().reviewHistory.find((h) => h.id === id);
    if (!entry) return;
    set({
      screen: 'review-history-view',
      viewingReviewHistoryId: id,
      reviewResult: entry.result,
      reviewState: 'done',
      reviewError: '',
      reviewTargetEpisode: entry.episode,
    });
  },

  deleteReviewHistory: (id) => {
    const updated = get().reviewHistory.filter((h) => h.id !== id);
    saveReviewHistory(updated);
    set((s) => ({
      reviewHistory: updated,
      ...(s.viewingReviewHistoryId === id
        ? { screen: 'review-input' as const, viewingReviewHistoryId: null }
        : {}),
    }));
  },

  startSpellcheck: (episode, selectionRange = null) =>
    set((s) => ({
      screen: 'spellcheck-result',
      spellcheckState: 'loading',
      spellcheckResult: null,
      spellcheckError: '',
      spellcheckTargetEpisode: episode,
      viewingSpellcheckHistoryId: null,
      spellcheckAppliedIssues: [],
      spellcheckHoveredIssue: null,
      spellcheckSelectionRange: selectionRange,
      spellcheckVersion: s.spellcheckVersion + 1,
    })),

  finishSpellcheck: (result) => {
    const { spellcheckTargetEpisode, spellcheckHistory, spellcheckVersion } = get();
    if (spellcheckTargetEpisode) {
      const entry: SpellcheckHistoryEntry = {
        id: crypto.randomUUID(),
        workId: spellcheckTargetEpisode.workId,
        episode: spellcheckTargetEpisode,
        result,
        createdAt: Date.now(),
      };
      const sameWork = spellcheckHistory.filter((h) => h.workId === entry.workId);
      const otherWork = spellcheckHistory.filter((h) => h.workId !== entry.workId);
      const updated = [entry, ...sameWork].slice(0, MAX_HISTORY);
      const all = [...updated, ...otherWork];
      saveSpellcheckHistory(all);
      set({
        spellcheckState: 'done',
        spellcheckResult: result,
        spellcheckHistory: all,
        spellcheckAppliedIssues: [],
        spellcheckVersion: spellcheckVersion + 1,
      });
    } else {
      set({
        spellcheckState: 'done',
        spellcheckResult: result,
        spellcheckAppliedIssues: [],
        spellcheckVersion: spellcheckVersion + 1,
      });
    }
  },

  failSpellcheck: (error) =>
    set({ spellcheckState: 'error', spellcheckError: error }),

  viewSpellcheckHistory: (id) => {
    const entry = get().spellcheckHistory.find((h) => h.id === id);
    if (!entry) return;
    set((s) => ({
      screen: 'spellcheck-history-view',
      viewingSpellcheckHistoryId: id,
      spellcheckResult: entry.result,
      spellcheckState: 'done',
      spellcheckError: '',
      spellcheckTargetEpisode: entry.episode,
      spellcheckAppliedIssues: [],
      spellcheckHoveredIssue: null,
      spellcheckSelectionRange: null,
      spellcheckVersion: s.spellcheckVersion + 1,
    }));
  },

  markSpellcheckIssueApplied: (index) =>
    set((s) =>
      s.spellcheckAppliedIssues.includes(index)
        ? s
        : {
            spellcheckAppliedIssues: [...s.spellcheckAppliedIssues, index],
            spellcheckVersion: s.spellcheckVersion + 1,
          },
    ),

  setSpellcheckHoveredIssue: (index) =>
    set((s) =>
      s.spellcheckHoveredIssue === index
        ? s
        : { spellcheckHoveredIssue: index, spellcheckVersion: s.spellcheckVersion + 1 },
    ),

  deleteSpellcheckHistory: (id) => {
    const updated = get().spellcheckHistory.filter((h) => h.id !== id);
    saveSpellcheckHistory(updated);
    set((s) => ({
      spellcheckHistory: updated,
      ...(s.viewingSpellcheckHistoryId === id
        ? { screen: 'spellcheck-input' as const, viewingSpellcheckHistoryId: null }
        : {}),
    }));
  },
}));
