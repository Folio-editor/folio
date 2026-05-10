import { create } from 'zustand';

export type AiScreen =
  | 'menu'
  | 'draft-input' | 'draft-view' | 'history-view'
  | 'review-input' | 'review-result' | 'review-history-view'
  | 'spellcheck-input' | 'spellcheck-result' | 'spellcheck-history-view'
  | 'summarize-input' | 'summarize-result' | 'summarize-history-view'
  | 'create-input' | 'create-streaming';

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
    case 'summarize-input':
    case 'summarize-result':
    case 'summarize-history-view':
      return '회차 요약 생성';
    case 'create-input':
    case 'create-streaming':
      return '문서 생성';
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

export type SummarizeState = 'idle' | 'loading' | 'done' | 'error';

/**
 * AI `/v1/quick/summarize` 응답 — summarize_episode 도구의 12-필드 양식.
 * 백엔드가 episode_summary 테이블에 자동 UPSERT 한 뒤 동일 payload 를 반환.
 * 필드명은 ai/app/mcp/tools/episode_plaintext.py:summarize_episode 와 1:1 일치.
 */
export interface SummarizeResult {
  oneline_summary: string;
  summary: string;
  pov_character: string | null;
  present_characters: string[];
  present_locations: string[];
  key_events: { order: number; event: string }[];
  time_progression: string | null;
  tone: string | null;
  cliffhanger: string | null;
  foreshadow_planted: { name: string; description: string }[];
  foreshadow_paid_off: { name: string }[];
  keywords: string[];
  cached?: boolean;
  generation_count?: number;
}

export interface SummarizeHistoryEntry {
  id: string;
  workId: string;
  episode: DraftEpisodeInfo;
  result: SummarizeResult;
  createdAt: number;
}

/**
 * propose_* 도구의 input_json 누적 buffer 에서 사용자에게 노출할 본문 string 필드를 추출.
 *
 * Anthropic SDK 가 매 SSE input_json_delta 로 raw partial_json chunk 를 보내면 누적된 buffer
 * 가 아직 valid JSON 이 아닐 수 있다. 그래서 정규식으로 known field 의 string 값 부분만 잘라내
 * JSON escape 만 풀어 평문화한다 — 마지막 escape (\\, \\u 등) 가 미완성이면 안전 fallback.
 */
const STREAMING_FIELDS_RE =
  /"(content|intro|new_outline|summary|appearance|personality|long_summary)"\s*:\s*"((?:[^"\\]|\\.)*)/;

function extractStreamingField(buffer: string): { field: string; text: string } | null {
  const m = buffer.match(STREAMING_FIELDS_RE);
  if (!m) return null;
  const field = m[1];
  const raw = m[2];
  // JSON 의 string escape (\n, \t, \", \\, \uXXXX) 풀기 — 끝이 미완성이면 자르고 재시도.
  const tryParse = (s: string): string | null => {
    try {
      return JSON.parse('"' + s + '"');
    } catch {
      return null;
    }
  };
  let text = tryParse(raw);
  if (text === null) {
    // 마지막 \\ 또는 \\u0~3자 미완성 escape 잘라내기 후 재시도
    const safe = raw
      .replace(/\\u[0-9a-fA-F]{0,3}$/, '')
      .replace(/\\$/, '');
    text = tryParse(safe) ?? safe;
  }
  return { field, text };
}

/**
 * 문서 생성 카드 — 자유 프롬프트 → agent auto 시나리오 1회 실행.
 * 스트리밍 텍스트 + 도구 호출 표시 → 완료 시 propose_* 제안 큐로 적재 →
 * 사용자가 카드 안에서 [적용]/[거절] 결정.
 */
export type CreateState = 'idle' | 'streaming' | 'done' | 'error';

/** SSE step 이벤트 — agent.ts AgentStreamStepEvent 와 동일 (의존성 줄이려고 인라인 정의) */
export interface CreateStepEvent {
  step_type: 'tool_call' | 'planner_call' | 'worker_call' | 'compression' | string;
  tool_name?: string | null;
  user_tokens?: number;
  iterations?: number;
  cum_user_tokens?: number;
  seq?: number;
}

const HISTORY_KEY = 'folio:ai-draft-history';
const REVIEW_HISTORY_KEY = 'folio:ai-review-history';
const SPELLCHECK_HISTORY_KEY = 'folio:ai-spellcheck-history';
const SUMMARIZE_HISTORY_KEY = 'folio:ai-summarize-history';
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

function loadSummarizeHistory(): SummarizeHistoryEntry[] {
  try {
    const raw = localStorage.getItem(SUMMARIZE_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSummarizeHistory(entries: SummarizeHistoryEntry[]) {
  localStorage.setItem(SUMMARIZE_HISTORY_KEY, JSON.stringify(entries));
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

  // 원고 검수 — 다회차 + 자유 prompt (agent thread 호출 입력)
  reviewSortOrders: number[];
  reviewFocusPrompt: string;

  // 회차 요약 생성 상태
  summarizeState: SummarizeState;
  summarizeResult: SummarizeResult | null;
  summarizeError: string;
  summarizeTargetEpisode: DraftEpisodeInfo | null;
  summarizeHistory: SummarizeHistoryEntry[];
  viewingSummarizeHistoryId: string | null;

  // 문서 생성 상태 (자유 프롬프트 + agent 스트리밍 + 큐)
  createPrompt: string;                                 // 입력 폼 — 메인 지시사항
  createReferencePrompt: string;                        // 자유 프롬프트 — 참고 자료 지시 ("1~10화 참고", "세계관의 xx 참고" 등)
  createReferenceSortOrders: number[];                  // (deprecated 2026-05-10) 다회차 picker 폐기, 자유 프롬프트로 대체
  createState: CreateState;
  createThreadId: string | null;
  createLiveText: string;                               // 스트리밍 누적 텍스트
  createSteps: CreateStepEvent[];                       // 도구 호출 진행
  createSuggestionIds: string[];                        // 완료 시 적재된 propose_* 제안 id
  createError: string;
  // tool_use 의 본문 필드 (content/intro 등) 점진 streaming 누적 — 카드 모드에서 결과물 실시간 표시용.
  // buffer = SSE 로 받은 raw partial_json 누적, text = buffer 에서 추출한 known string 필드 평문.
  createToolStream: { toolName: string; field: string; text: string; buffer: string } | null;
  // turn 별 분리 — assistant_start 마다 새 turn, text_delta 누적, step 마다 toolNames 추가.
  // propose_episode_draft 호출 시 그 turn 의 kind='body' 로 마크 (본문 카드 강조).
  createTurns: { kind: 'thinking' | 'body' | 'wrap'; text: string; toolNames: string[] }[];

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

  // 원고 검수 입력 액션
  setReviewSortOrders: (orders: number[]) => void;
  setReviewFocusPrompt: (v: string) => void;

  // 회차 요약 생성 액션
  startSummarize: (episode: DraftEpisodeInfo) => void;
  finishSummarize: (result: SummarizeResult) => void;
  failSummarize: (error: string) => void;
  viewSummarizeHistory: (id: string) => void;
  deleteSummarizeHistory: (id: string) => void;

  // 문서 생성 액션
  setCreatePrompt: (v: string) => void;
  setCreateReferencePrompt: (v: string) => void;
  setCreateReferenceSortOrders: (orders: number[]) => void;
  startCreate: (threadId: string) => void;
  appendCreateChunk: (text: string) => void;
  addCreateStep: (step: CreateStepEvent) => void;
  startCreateToolStream: (toolName: string, field: string) => void;
  appendCreateToolChunk: (chunk: string) => void;
  /** SSE tool_input_delta 마다 raw partial_json 누적 + known field 추출 → text 갱신. */
  appendCreateToolPartial: (partialJson: string) => void;
  /** assistant_start — 새 turn 카드 시작 (kind='thinking' 으로 시작) */
  startCreateTurn: () => void;
  /** text_delta — 마지막 turn 의 text 누적 */
  appendCreateTurnText: (chunk: string) => void;
  /** step 의 tool_call — 마지막 turn 헤더에 도구 라벨 추가 */
  addCreateTurnTool: (toolName: string) => void;
  /** propose_episode_draft 등 본문 도구 호출 시 — 마지막 turn 을 'body' 로 마크 */
  markCreateTurnAsBody: () => void;
  finishCreate: (suggestionIds: string[]) => void;
  failCreate: (error: string) => void;
  resetCreate: () => void;
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

  reviewSortOrders: [],
  reviewFocusPrompt: '',

  summarizeState: 'idle',
  summarizeResult: null,
  summarizeError: '',
  summarizeTargetEpisode: null,
  summarizeHistory: loadSummarizeHistory(),
  viewingSummarizeHistoryId: null,

  createPrompt: '',
  createReferencePrompt: '',
  createReferenceSortOrders: [],
  createToolStream: null,
  createTurns: [],
  createState: 'idle',
  createThreadId: null,
  createLiveText: '',
  createSteps: [],
  createSuggestionIds: [],
  createError: '',

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

  // ── 원고 검수 입력 액션 ──

  setReviewSortOrders: (orders) =>
    set({ reviewSortOrders: [...orders].sort((a, b) => a - b) }),

  setReviewFocusPrompt: (v) => set({ reviewFocusPrompt: v }),

  // ── 회차 요약 생성 액션 ──

  startSummarize: (episode) =>
    set({
      screen: 'summarize-result',
      summarizeState: 'loading',
      summarizeResult: null,
      summarizeError: '',
      summarizeTargetEpisode: episode,
      viewingSummarizeHistoryId: null,
    }),

  finishSummarize: (result) => {
    const { summarizeTargetEpisode, summarizeHistory } = get();
    if (summarizeTargetEpisode) {
      const entry: SummarizeHistoryEntry = {
        id: crypto.randomUUID(),
        workId: summarizeTargetEpisode.workId,
        episode: summarizeTargetEpisode,
        result,
        createdAt: Date.now(),
      };
      const sameWork = summarizeHistory.filter((h) => h.workId === entry.workId);
      const otherWork = summarizeHistory.filter((h) => h.workId !== entry.workId);
      const updated = [entry, ...sameWork].slice(0, MAX_HISTORY);
      const all = [...updated, ...otherWork];
      saveSummarizeHistory(all);
      set({ summarizeState: 'done', summarizeResult: result, summarizeHistory: all });
    } else {
      set({ summarizeState: 'done', summarizeResult: result });
    }
  },

  failSummarize: (error) =>
    set({ summarizeState: 'error', summarizeError: error }),

  viewSummarizeHistory: (id) => {
    const entry = get().summarizeHistory.find((h) => h.id === id);
    if (!entry) return;
    set({
      screen: 'summarize-history-view',
      viewingSummarizeHistoryId: id,
      summarizeResult: entry.result,
      summarizeState: 'done',
      summarizeError: '',
      summarizeTargetEpisode: entry.episode,
    });
  },

  deleteSummarizeHistory: (id) => {
    const updated = get().summarizeHistory.filter((h) => h.id !== id);
    saveSummarizeHistory(updated);
    set((s) => ({
      summarizeHistory: updated,
      ...(s.viewingSummarizeHistoryId === id
        ? { screen: 'summarize-input' as const, viewingSummarizeHistoryId: null }
        : {}),
    }));
  },

  // ── 문서 생성 액션 ──

  setCreatePrompt: (v) => set({ createPrompt: v }),

  setCreateReferencePrompt: (v) => set({ createReferencePrompt: v }),

  setCreateReferenceSortOrders: (orders) =>
    set({ createReferenceSortOrders: [...orders].sort((a, b) => a - b) }),

  startCreate: (threadId) =>
    set({
      screen: 'create-streaming',
      createState: 'streaming',
      createThreadId: threadId,
      createLiveText: '',
      createSteps: [],
      createSuggestionIds: [],
      createError: '',
      createToolStream: null,
      createTurns: [],
    }),

  appendCreateChunk: (text) =>
    set((s) => ({ createLiveText: s.createLiveText + text })),

  addCreateStep: (step) =>
    set((s) => ({ createSteps: [...s.createSteps.slice(-9), step] })),

  startCreateToolStream: (toolName, field) =>
    set({ createToolStream: { toolName, field, text: '', buffer: '' } }),

  appendCreateToolChunk: (chunk) =>
    set((s) =>
      s.createToolStream
        ? { createToolStream: { ...s.createToolStream, text: s.createToolStream.text + chunk } }
        : s,
    ),

  appendCreateToolPartial: (partialJson) =>
    set((s) => {
      if (!s.createToolStream) return s;
      const buffer = s.createToolStream.buffer + partialJson;
      const extracted = extractStreamingField(buffer);
      return {
        createToolStream: {
          ...s.createToolStream,
          buffer,
          field: extracted?.field ?? s.createToolStream.field,
          text: extracted?.text ?? s.createToolStream.text,
        },
      };
    }),

  startCreateTurn: () =>
    set((s) => {
      // 직전 turn 이 body 였으면 다음 turn 은 wrap (마무리), 아니면 thinking (계속 분석)
      const last = s.createTurns[s.createTurns.length - 1];
      const newKind: 'thinking' | 'body' | 'wrap' = last?.kind === 'body' ? 'wrap' : 'thinking';
      return {
        createTurns: [...s.createTurns, { kind: newKind, text: '', toolNames: [] }],
      };
    }),

  appendCreateTurnText: (chunk) =>
    set((s) => {
      if (s.createTurns.length === 0) {
        // 안전장치 — assistant_start 가 누락되어 turn 이 없는 경우 새로 시작
        return { createTurns: [{ kind: 'thinking', text: chunk, toolNames: [] }] };
      }
      const last = s.createTurns[s.createTurns.length - 1];
      const updated = { ...last, text: last.text + chunk };
      return { createTurns: [...s.createTurns.slice(0, -1), updated] };
    }),

  addCreateTurnTool: (toolName) =>
    set((s) => {
      if (s.createTurns.length === 0) return s;
      const last = s.createTurns[s.createTurns.length - 1];
      if (last.toolNames.includes(toolName)) return s;     // 중복 방지
      const updated = { ...last, toolNames: [...last.toolNames, toolName] };
      return { createTurns: [...s.createTurns.slice(0, -1), updated] };
    }),

  markCreateTurnAsBody: () =>
    set((s) => {
      if (s.createTurns.length === 0) return s;
      const last = s.createTurns[s.createTurns.length - 1];
      if (last.kind === 'body') return s;
      const updated = { ...last, kind: 'body' as const };
      return { createTurns: [...s.createTurns.slice(0, -1), updated] };
    }),

  finishCreate: (suggestionIds) =>
    set({ createState: 'done', createSuggestionIds: suggestionIds }),

  failCreate: (error) => set({ createState: 'error', createError: error }),

  resetCreate: () =>
    set({
      createPrompt: '',
      createReferencePrompt: '',
      createReferenceSortOrders: [],
      createToolStream: null,
      createTurns: [],
      createState: 'idle',
      createThreadId: null,
      createLiveText: '',
      createSteps: [],
      createSuggestionIds: [],
      createError: '',
    }),
}));
