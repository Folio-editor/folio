/**
 * Agent 채팅 패널 (Phase 4 §N).
 *
 * - 시나리오 선택 + thread 선택/생성
 * - 사용자/AI 메시지 표시
 * - 영수증 link, abort 배너, suggestion 카드
 * - 자동 sync/async 라우팅
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileArchive,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import {
  compressAgentThread,
  createAgentThread,
  deleteAgentThread,
  getAgentThread,
  listAgentThreads,
  listSuggestions,
  patchSuggestion,
  type AgentMessage,
  type AgentRunResponse,
  type AgentStreamEvent,
  type AgentStreamStepEvent,
  type AgentSuggestion,
  type AgentThreadDetail,
  type AgentThreadSummary,
} from '../../api/agent';
import { SuggestionBodyPreview, entityLabel, useDecryptedSuggestion } from './suggestionPreview';
import { ChatMarkdown } from './ChatMarkdown';
import { toolLabel } from './toolLabels';
import { apiClient } from '../../lib/apiClient';
import { analytics, charCountBucket, countBucket, durationBucket } from '../../lib/analytics';
import { useAgentChatStore } from '../../stores/agentChatStore';
import { useAuthStore } from '../../stores/authStore';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

const EMPTY_THREADS: AgentThreadSummary[] = [];

// ─── 컨텍스트 윈도우 가시화 (Sonnet 4.x: 200K 입력 한도) ──────────
// 백엔드 ai/app/agent/session.py 의 동일 임계값과 정합.
// iterative 압축 패턴 — planner loop 안 매 iter 자동 압축 시도 → 임계 일찍 발동.
const CTX_AUTO_COMPRESS = 60_000;      // 자동 압축 발동선
const CTX_WARN = 120_000;              // 오렌지 경고
const CTX_CRITICAL = 170_000;          // 빨강 critical
const CTX_HARD_LIMIT = 200_000;        // Anthropic 절대 한도
const CHARS_PER_TOKEN = 3.5;           // 한국어 보수적 추정치 — 백엔드와 동일

function estimateTokens(messages: AgentMessage[] | undefined | null): number {
  if (!messages || messages.length === 0) return 0;
  try {
    return Math.round(JSON.stringify(messages).length / CHARS_PER_TOKEN);
  } catch {
    return 0;
  }
}

function analyticsReasonCode(err: unknown): string {
  if (err instanceof Error && err.name) return err.name;
  return 'unknown';
}

interface Props {
  workId: string;
}

export function AgentChatPanel({ workId }: Props) {
  // 자격 체크 (오프라인·게스트·미로그인은 호출 자체 차단)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isGuest = useAuthStore((s) => s.isGuest);
  const isOnline = useNetworkStatus();
  const eligible = isAuthenticated && !isGuest && isOnline;

  // Phase 4 — 시나리오 자동 분류. 항상 'auto' 사용.
  const activeThreadId = useAgentChatStore((s) => s.activeThreadByWork[workId] ?? null);
  const setActiveThread = useAgentChatStore((s) => s.setActiveThread);
  const threads = useAgentChatStore((s) => s.threadsByWork[workId] ?? EMPTY_THREADS);
  const setThreads = useAgentChatStore((s) => s.setThreads);

  const [thread, setThread] = useState<AgentThreadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [lastResponse, setLastResponse] = useState<AgentRunResponse | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamSteps, setStreamSteps] = useState<AgentStreamStepEvent[]>([]);
  // text_delta 실시간 누적 — 현재 진행 중 assistant 응답 (assistant_start 마다 새 string 추가)
  const [liveAssistantTurns, setLiveAssistantTurns] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [compressNotice, setCompressNotice] = useState<string | null>(null);
  // 제안 카드 검토 오버레이 — 입력창 자리에 카드 1개씩 좌우 페이지네이션으로 표시.
  const [reviewState, setReviewState] = useState<{
    suggestions: AgentSuggestion[];
    idx: number;
    busyId: string | null;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const openedTrackedRef = useRef(false);
  // 활성 SSE 스트림의 AbortController — 사용자 중단 시 fetch 취소.
  // 백엔드 Spring SseEmitter 가 client disconnect 감지 → AI server 까지 EOF 전파 →
  // Anthropic stream cancel. 클라 측은 finally 블록이 streaming/sending 정리.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!eligible || openedTrackedRef.current) return;
    openedTrackedRef.current = true;
    void analytics.track('ai_chat_opened', {
      entry_source: 'right_panel',
    });
  }, [eligible]);

  // ─── thread 목록 로드 ───
  useEffect(() => {
    if (!eligible) return;
    listAgentThreads(workId)
      .then((rows) => setThreads(workId, rows))
      .catch((e) => setError(`목록 조회 실패: ${e?.message ?? e}`));
  }, [eligible, workId, setThreads]);

  // ─── 활성 thread 상세 로드 ───
  // thread 전환 시 이전 thread 의 transient state (응답 푸터 / 진행 step / live 텍스트 /
  // 검토 오버레이 / 에러 / 압축 알림) 모두 초기화. 안 하면 새 thread 가 로드돼도 화면엔
  // 이전 thread 의 흔적이 남아 "전환이 안 된 듯" 보인다.
  useEffect(() => {
    if (!eligible) return;
    setLastResponse(null);
    setStreamSteps([]);
    setLiveAssistantTurns([]);
    setReviewState(null);
    setError(null);
    setCompressNotice(null);
    if (!activeThreadId) {
      setThread(null);
      return;
    }
    setLoading(true);
    getAgentThread(activeThreadId)
      .then((d) => setThread(d))
      .catch((e) => setError(`thread 조회 실패: ${e?.message ?? e}`))
      .finally(() => setLoading(false));
  }, [eligible, activeThreadId]);

  // ─── 자동 스크롤 ───
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread?.messages.length, lastResponse]);

  // ─── 컨텍스트 윈도우 추정 (입력 누적 토큰) ───
  const estimatedCtxTokens = useMemo(
    () => estimateTokens(thread?.messages),
    [thread?.messages],
  );
  const ctxRatio = Math.min(1, estimatedCtxTokens / CTX_HARD_LIMIT);
  const ctxPercent = Math.round(ctxRatio * 100);
  const ctxColor =
    estimatedCtxTokens >= CTX_CRITICAL
      ? 'bg-red-500'
      : estimatedCtxTokens >= CTX_WARN
        ? 'bg-orange-500'
        : estimatedCtxTokens >= CTX_AUTO_COMPRESS
          ? 'bg-yellow-500'
          : 'bg-emerald-500';
  const ctxLabel =
    estimatedCtxTokens >= CTX_CRITICAL
      ? '한도 임박 — 즉시 압축 권장'
      : estimatedCtxTokens >= CTX_WARN
        ? '경고 — 곧 자동 압축'
        : estimatedCtxTokens >= CTX_AUTO_COMPRESS
          ? '자동 압축 임계 진입'
          : '여유';

  async function handleNewThread() {
    setError(null);
    setHistoryOpen(false);
    try {
      const r = await createAgentThread(workId, 'auto');
      const tid = r.thread_id;
      if (!tid) {
        void analytics.track('ai_chat_thread_create_failed', {
          reason_code: 'missing_thread_id',
        });
        setError('새 대화 생성 실패: 응답에 thread_id 누락');
        return;
      }
      setActiveThread(workId, tid);
      void analytics.track('ai_chat_thread_created', {
        scenario: 'auto',
      });
      const refreshed = await listAgentThreads(workId);
      setThreads(workId, refreshed);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      void analytics.track('ai_chat_thread_create_failed', {
        reason_code: analyticsReasonCode(e),
      });
      setError(`새 대화 생성 실패: ${msg}`);
    }
  }

  async function handleDeleteThread(threadId: string) {
    setError(null);
    try {
      await deleteAgentThread(threadId);
      // 활성 thread 가 삭제됐으면 비우고 thread 자체 캐시도 클리어 (다음 thread 활성화는 사용자 선택)
      if (threadId === activeThreadId) {
        setActiveThread(workId, null);
        setThread(null);
      }
      const refreshed = await listAgentThreads(workId);
      setThreads(workId, refreshed);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`대화 삭제 실패: ${msg}`);
    }
  }

  async function openReview(suggestionIds: string[]) {
    if (suggestionIds.length === 0) return;
    setError(null);
    try {
      // 방금 만든 제안들 — 'pending' 상태부터 fetch (이미 처리된 것도 보이게 하려면 status 생략)
      const all = await listSuggestions();
      const map = new Map(all.map((s) => [s.id, s]));
      const matched = suggestionIds
        .map((id) => map.get(id))
        .filter((s): s is AgentSuggestion => !!s);
      if (matched.length === 0) {
        setError('제안을 불러올 수 없습니다 — 이미 삭제됐거나 접근 권한이 없습니다.');
        return;
      }
      setReviewState({ suggestions: matched, idx: 0, busyId: null });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`제안 조회 실패: ${msg}`);
    }
  }

  function closeReview() {
    setReviewState(null);
  }

  function reviewNavigate(delta: number) {
    setReviewState((prev) => {
      if (!prev) return prev;
      const nextIdx = Math.max(0, Math.min(prev.suggestions.length - 1, prev.idx + delta));
      return { ...prev, idx: nextIdx };
    });
  }

  async function reviewAct(
    id: string,
    status: 'confirmed' | 'rejected',
    selectedIndices?: number[],
  ) {
    setReviewState((prev) => (prev ? { ...prev, busyId: id } : prev));
    try {
      await patchSuggestion(id, status, undefined, selectedIndices);
      // 처리된 카드는 deck 에서 즉시 제거 — 3개 처리하면 모두 사라짐.
      // (확인된 내역은 작업물 탭의 SuggestionInbox 에서 confirmed/rejected 필터로 조회 가능)
      setReviewState((prev) => {
        if (!prev) return prev;
        const filtered = prev.suggestions.filter((s) => s.id !== id);
        if (filtered.length === 0) {
          return null;    // 전부 처리됨 → 자동 닫기
        }
        // 현재 위치 기준으로 다음 카드 표시 (이미 제거됐으니 idx 조정)
        const nextIdx = Math.min(prev.idx, filtered.length - 1);
        return { suggestions: filtered, idx: nextIdx, busyId: null };
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`제안 처리 실패: ${msg}`);
      setReviewState((prev) => (prev ? { ...prev, busyId: null } : prev));
    }
  }

  async function handleCompress() {
    if (!activeThreadId || compressing || sending) return;
    setCompressNotice(null);
    setError(null);
    setCompressing(true);
    try {
      const r = await compressAgentThread(activeThreadId);
      if (!r.compressed) {
        setCompressNotice(`압축 미실행 — ${r.reason ?? '대화량이 충분하지 않습니다'}`);
      } else {
        const beforeT = r.before.estimated_tokens.toLocaleString();
        const afterT = r.after.estimated_tokens.toLocaleString();
        setCompressNotice(
          `압축 완료 — ${r.before.messages_count}→${r.after.messages_count}건 · ${beforeT}→${afterT} 토큰`,
        );
      }
      const refreshed = await getAgentThread(activeThreadId);
      setThread(refreshed);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`대화 압축 실패: ${msg}`);
    } finally {
      setCompressing(false);
    }
  }

  function handleAbort() {
    const controller = abortRef.current;
    if (!controller) return;
    // 클라이언트 fetch 취소 → SSE eventLoop 자연 종료 → handleSend 의 finally 가 정리.
    // 백엔드 측은 SseEmitter 의 onCompletion / onError 가 처리 (Spring 기본 동작).
    controller.abort();
    setError('사용자 중단 — 부분 결과까지만 반영됩니다.');
  }

  async function handleSend() {
    if (!message.trim() || !activeThreadId || sending) return;
    setError(null);
    const text = message.trim();
    setMessage('');
    setSending(true);
    setStreaming(true);
    setStreamSteps([]);
    setLiveAssistantTurns([]);
    const startedAt = Date.now();
    let failureTracked = false;
    void analytics.track('ai_chat_message_sent', {
      message_char_count_bucket: charCountBucket(text.length),
    });
    const doneHolder: { evt: AgentRunResponse | null } = { evt: null };
    try {
      await new Promise<void>((resolve, reject) => {
        apiClient
          .streamSSE(
            `/agent/threads/${activeThreadId}/messages/stream`,
            { message: text },
            (parsed: unknown) => {
              const evt = parsed as AgentStreamEvent;
              if (evt.type === 'step') {
                setStreamSteps((prev) => [...prev.slice(-9), evt]);
              } else if (evt.type === 'assistant_start') {
                setLiveAssistantTurns((prev) => [...prev, '']);
              } else if (evt.type === 'text_delta') {
                setLiveAssistantTurns((prev) => {
                  if (prev.length === 0) return [evt.text];
                  const next = prev.slice();
                  next[next.length - 1] = next[next.length - 1] + evt.text;
                  return next;
                });
              } else if (evt.type === 'assistant_end') {
                // 현재 turn 종료 — 다음 step / 다음 assistant_start 까지 그대로 유지
              } else if (evt.type === 'done') {
                doneHolder.evt = evt as unknown as AgentRunResponse;
                return true;
              } else if (evt.type === 'error') {
                failureTracked = true;
                void analytics.track('ai_chat_message_failed', {
                  reason_code: evt.error_type,
                });
                setError(`태스크 실패 — ${evt.error_type}: ${evt.error_message}`);
                return true;
              }
            },
            () => resolve(),
            (err) => reject(err),
          )
          .then((controller) => {
            // streamSSE 가 반환하는 AbortController 보관 — 중단 버튼이 abort() 호출
            abortRef.current = controller;
          })
          .catch(reject);
      });
      if (doneHolder.evt) {
        setLastResponse(doneHolder.evt);
        void analytics.track('ai_chat_message_succeeded', {
          duration_bucket: durationBucket(Date.now() - startedAt),
          suggestion_count_bucket: countBucket(doneHolder.evt.suggestion_ids.length),
          status: doneHolder.evt.status,
        });
      } else if (!failureTracked) {
        failureTracked = true;
        void analytics.track('ai_chat_message_failed', {
          reason_code: 'stream_disconnected',
        });
      }
      const refreshed = await getAgentThread(activeThreadId);
      setThread(refreshed);
      // 첫 메시지 후 자동 title 부여를 반영하기 위해 thread 목록 재조회
      try {
        const list = await listAgentThreads(workId);
        setThreads(workId, list);
      } catch {
        /* 무시 */
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // 사용자 abort 는 fetch AbortError → 별도 에러 메시지 띄우지 않음 (handleAbort 가 이미 안내).
      const isAbort =
        (e instanceof DOMException && e.name === 'AbortError') ||
        msg.toLowerCase().includes('abort');
      if (isAbort) {
        void analytics.track('ai_chat_message_aborted', {
          duration_bucket: durationBucket(Date.now() - startedAt),
        });
      } else {
        void analytics.track('ai_chat_message_failed', {
          reason_code: analyticsReasonCode(e),
        });
        setError(`전송 실패: ${msg}`);
      }
      // abort 직후에도 partial 상태 반영 위해 thread 재조회 — 실패해도 조용히
      try {
        const refreshed = await getAgentThread(activeThreadId);
        setThread(refreshed);
      } catch {
        /* 무시 */
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      setSending(false);
    }
  }

  function renderMessage(m: AgentMessage, idx: number) {
    const role = m.role;
    // tool_result 만 담긴 user 메시지 (Anthropic API 가 요구하는 합성 turn) → 렌더 안 함
    if (role === 'user' && isToolResultOnly(m.content)) return null;
    // assistant 메시지에서 tool_use 블록은 진행 중 StreamProgress 가 표시했음 — 텍스트만 추출
    const text = extractText(m.content);
    if (!text.trim()) return null;     // 텍스트 없는 (tool_use 만) 메시지도 숨김

    const align = role === 'user' ? 'items-end' : 'items-start';

    // ★ 본문 turn 강조 — assistant 메시지에 propose_episode_draft tool_use 가 있으면 본문 카드.
    // C-2: 모델이 본문을 자연어로 출력 후 propose 호출. 그 turn 의 message 가 본문.
    const draftToolUse = role === 'assistant' ? extractDraftToolUse(m.content) : null;
    if (draftToolUse) {
      return (
        <div key={idx} className={`flex flex-col ${align} gap-1`}>
          <div className="text-[10px] text-muted-foreground">Folio · 회차 초안</div>
          <div className="w-full max-w-[95%] rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5 shadow-sm">
            <div className="mb-1.5 flex items-center gap-1.5">
              {/* PenSquare 가 import 안 돼있으면 아이콘 생략 — 단순 텍스트 헤더로 */}
              <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
                ✏️ 회차 초안{draftToolUse.title ? ` — ${draftToolUse.title}` : ''}
              </span>
            </div>
            <div className="max-h-[60vh] overflow-y-auto text-sm leading-relaxed text-foreground">
              <ChatMarkdown text={text} variant="assistant" />
            </div>
          </div>
        </div>
      );
    }

    const bubble =
      role === 'user'
        ? 'bg-primary text-primary-foreground'
        : 'bg-sidebar-accent text-sidebar-accent-foreground';
    return (
      <div key={idx} className={`flex flex-col ${align} gap-1`}>
        <div className="text-[10px] text-muted-foreground">{role === 'user' ? '나' : 'Folio'}</div>
        <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${bubble}`}>
          {role === 'user' ? (
            <span className="whitespace-pre-wrap">{text}</span>
          ) : (
            <ChatMarkdown text={text} variant="assistant" />
          )}
        </div>
      </div>
    );
  }

  if (!eligible) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
        {!isOnline
          ? '오프라인 상태에서는 Agent 를 사용할 수 없습니다.'
          : isGuest
            ? '게스트 모드에서는 Agent 를 사용할 수 없습니다. 로그인 후 이용해주세요.'
            : '로그인이 필요합니다.'}
      </div>
    );
  }

  const activeThread = threads.find((t) => t.thread_id === activeThreadId) ?? null;
  const activeTitle = activeThread?.title || (activeThreadId ? `대화 · ${activeThreadId.slice(0, 6)}` : null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 헤더 — [현재 대화 제목 ▼ 드롭다운] + [+ 새 대화 버튼 (1클릭 생성·전환)].
          드롭다운은 히스토리 전환·삭제 전용. 새 대화 생성은 우측 버튼이 단일 진입점. */}
      <div className="relative flex items-center gap-1 border-b border-border/60 px-3 py-2">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1 text-left text-xs hover:border-border hover:bg-accent"
          title="이전 대화 목록"
        >
          <span className="truncate font-medium">
            {activeTitle ?? '대화를 시작해주세요'}
          </span>
          {historyOpen
            ? <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
            : <ChevronRight size={12} className="shrink-0 text-muted-foreground" />}
        </button>
        <button
          type="button"
          onClick={() => void handleNewThread()}
          title="새 대화 시작 (즉시 생성·전환)"
          aria-label="새 대화 시작"
          className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-primary hover:bg-accent"
        >
          <Plus size={12} strokeWidth={2.4} />
          새 대화
        </button>
        {historyOpen && (
          <>
            {/* 바깥 클릭 dismiss — 키보드 접근성 위해 button 으로 */}
            <button
              type="button"
              aria-label="대화 목록 닫기"
              tabIndex={-1}
              onClick={() => setHistoryOpen(false)}
              className="fixed inset-0 z-10 cursor-default bg-transparent"
            />
            <div className="absolute left-3 top-full z-20 mt-1 w-[calc(100%-1.5rem)] max-h-80 overflow-y-auto rounded-md border border-border bg-background shadow-lg">
              {threads.length === 0 ? (
                <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                  이전 대화가 없습니다. 우측 [+ 새 대화] 버튼으로 시작하세요.
                </div>
              ) : (
                threads.map((t) => (
                  <ThreadHistoryItem
                    key={t.thread_id}
                    thread={t}
                    active={t.thread_id === activeThreadId}
                    onSelect={() => {
                      setActiveThread(workId, t.thread_id);
                      setHistoryOpen(false);
                    }}
                    onDelete={() => void handleDeleteThread(t.thread_id)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* 진행 trace — collapsible 헤더 (streaming 동안 표시) */}
      {streaming && <ProgressHeader steps={streamSteps} />}

      {/* 메시지 영역 */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> 불러오는 중...
          </div>
        )}
        {!activeThreadId && !loading && (
          <div className="text-center text-xs text-muted-foreground">
            우측 상단 [+ 새 대화] 버튼을 눌러 시작하세요.
          </div>
        )}
        {thread?.summary_so_far && (
          <div className="rounded border border-dashed border-border/60 bg-muted/30 p-2 text-[11px] text-muted-foreground">
            <strong>이전 대화 요약</strong>
            <div className="mt-1 whitespace-pre-wrap">{thread.summary_so_far}</div>
          </div>
        )}
        {thread?.messages.map(renderMessage)}
        {streaming &&
          liveAssistantTurns.map((text, i) =>
            text.trim() ? (
              <div key={`live-${i}`} className="flex flex-col items-start gap-1">
                <div className="text-[10px] text-muted-foreground">Folio</div>
                <div className="max-w-[85%] rounded-lg bg-sidebar-accent px-3 py-2 text-sm text-sidebar-accent-foreground">
                  <ChatMarkdown text={text} variant="assistant" />
                  <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-current opacity-60" />
                </div>
              </div>
            ) : null,
          )}
        {lastResponse && (
          <ResponseFooter resp={lastResponse} onReview={(ids) => void openReview(ids)} />
        )}
        {error && <div className="rounded bg-red-500/10 p-2 text-xs text-red-500">{error}</div>}
      </div>

      {/* 제안 검토 오버레이 — 활성 시 입력창 자리를 차지. 좌우 페이지네이션으로 카드 1건씩 검토. */}
      {reviewState ? (
        <ReviewOverlay
          state={reviewState}
          onPrev={() => reviewNavigate(-1)}
          onNext={() => reviewNavigate(1)}
          onApprove={(id, selectedIndices) => void reviewAct(id, 'confirmed', selectedIndices)}
          onReject={(id) => void reviewAct(id, 'rejected')}
          onClose={closeReview}
        />
      ) : (
      <div className="flex shrink-0 items-stretch gap-2 border-t border-border p-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void handleSend();
            }
          }}
          rows={4}
          maxLength={8000}
          placeholder={
            sending
              ? 'Agent 작업 중 — 우측 ■ 버튼으로 중지'
              : '메시지 입력 — agent 가 의도 자동 분류 (Ctrl+Enter 전송)'
          }
          disabled={!activeThreadId || sending}
          className="min-h-24 flex-1 resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="flex shrink-0 flex-col items-center justify-between gap-1 py-0.5">
          {/* 상단 — 대화 압축 버튼 (전송 버튼 위 빈 공간) */}
          <button
            type="button"
            onClick={() => void handleCompress()}
            disabled={!activeThreadId || compressing || sending}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title="대화 수동 압축 — 이전 메시지를 요약으로 치환"
            aria-label="대화 압축"
          >
            {compressing
              ? <Loader2 size={14} className="animate-spin" />
              : <FileArchive size={14} />}
          </button>
          {/* 하단 — 전송 / 중지 */}
          {sending ? (
            <button
              type="button"
              onClick={handleAbort}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600"
              title="Agent 중지"
              aria-label="Agent 중지"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                <rect x="2" y="2" width="10" height="10" rx="1.5" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!activeThreadId || !message.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
              title="전송 (Ctrl+Enter)"
              aria-label="메시지 전송"
            >
              <ArrowUp size={18} strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>
      )}

      {/* 대화 컨텍스트 한도 게이지 — 입력창 하단. 자동 압축(50%) / 경고(75%) / 한도(100%) 눈금. */}
      {activeThreadId && (
        <div className="shrink-0 border-t border-border/40 px-3 pb-2 pt-1.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>대화 컨텍스트 — {ctxLabel}</span>
            <span className="tabular-nums">{ctxPercent}%</span>
          </div>
          <div className="relative mt-1 h-1.5 w-full rounded bg-muted">
            <div
              className={`h-1.5 rounded ${ctxColor} transition-all`}
              style={{ width: `${Math.min(100, ctxRatio * 100)}%` }}
            />
            {[CTX_AUTO_COMPRESS, CTX_WARN, CTX_CRITICAL].map((mark) => (
              <span
                key={mark}
                className="absolute -top-0.5 h-2.5 w-px bg-border"
                style={{ left: `${(mark / CTX_HARD_LIMIT) * 100}%` }}
                title={`${Math.round((mark / CTX_HARD_LIMIT) * 100)}%`}
              />
            ))}
          </div>
          {compressNotice && (
            <div className="mt-1 rounded bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-700">
              {compressNotice}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────── 드롭다운 히스토리 항목 (삭제 확인 inline) ───────

function ThreadHistoryItem({
  thread,
  active,
  onSelect,
  onDelete,
}: {
  thread: AgentThreadSummary;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const title = thread.title || `대화 · ${thread.thread_id.slice(0, 6)}`;
  const date = thread.last_activity_at
    ? new Date(thread.last_activity_at).toLocaleDateString()
    : '';

  if (confirmingDelete) {
    return (
      <div
        className={`flex items-center gap-1 px-2 py-1.5 text-xs ${
          active ? 'bg-accent/60' : ''
        }`}
      >
        <span className="flex-1 truncate text-[11px] text-red-600">
          삭제할까요? '{title.slice(0, 20)}'
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmingDelete(false);
          }}
          className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-accent"
        >
          취소
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmingDelete(false);
            onDelete();
          }}
          className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] text-white hover:bg-red-600"
        >
          삭제
        </button>
      </div>
    );
  }

  return (
    <div
      className={`group flex items-center gap-1 hover:bg-accent ${
        active ? 'bg-accent/60' : ''
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className={`flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-xs ${
          active ? 'font-medium' : ''
        }`}
      >
        <span className="truncate flex-1">{title}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{date}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmingDelete(true);
        }}
        className="mr-1 hidden h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-500 group-hover:flex"
        title="대화 삭제"
        aria-label="대화 삭제"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ─────── helpers ───────

function extractText(content: unknown): string {
  // text 블록만 뽑아냄. tool_use / tool_result 는 채팅창에서 숨긴다 (StreamProgress 가 진행 중 표시).
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (item && typeof item === 'object') {
          const o = item as { type?: string; text?: string };
          if (o.type === 'text') return o.text ?? '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function isToolResultOnly(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  if (content.length === 0) return false;
  return content.every((item) => {
    if (!item || typeof item !== 'object') return false;
    return (item as { type?: string }).type === 'tool_result';
  });
}

/** assistant 메시지 content 에서 propose_episode_draft tool_use block 추출 — 본문 카드 강조용. */
function extractDraftToolUse(content: unknown): { title: string } | null {
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const o = item as { type?: string; name?: string; input?: unknown };
    if (o.type === 'tool_use' && o.name === 'propose_episode_draft') {
      const input = o.input as { title?: unknown } | null | undefined;
      const title = input && typeof input.title === 'string' ? input.title : '';
      return { title };
    }
  }
  return null;
}

function ProgressHeader({ steps }: { steps: AgentStreamStepEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const last = steps[steps.length - 1];
  const cumTokens = last?.cum_user_tokens ?? 0;
  const iters = last?.iterations ?? 0;
  const lastLabel = last ? labelStep(last) : '대기 중...';
  return (
    <div className="shrink-0 border-b border-border/60 bg-muted/30 text-[11px]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50"
        title={expanded ? '접기' : '펼치기'}
      >
        <Loader2 size={12} className="animate-spin text-muted-foreground" />
        <span className="truncate text-muted-foreground">{lastLabel}</span>
        <span className="ml-auto shrink-0 text-[10px] opacity-60">
          step {iters} · {cumTokens} 크레딧
        </span>
        {expanded ? (
          <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
        )}
      </button>
      {expanded && steps.length > 0 && (
        <div className="space-y-0.5 border-t border-border/40 px-3 py-1 text-[10px] text-muted-foreground">
          {steps.map((l, i) => (
            <div key={`${l.seq}-${i}`}>{labelStep(l)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// 도구 ID → 작가용 한글 라벨 매핑은 toolLabels.ts 로 분리 (CreateStreamingScreen 와 공유).

function labelStep(l: AgentStreamStepEvent): string {
  if (l.step_type === 'tool_call') return `🔧 ${toolLabel(l.tool_name)}`;
  if (l.step_type === 'planner_call')
    return `💭 답변 구상 중 · +${l.user_tokens} 크레딧`;
  if (l.step_type === 'worker_call')
    return `🛠 보조 에이전트 분석 중 · +${l.user_tokens} 크레딧`;
  if (l.step_type === 'compression') return '📦 이전 대화 압축 중';
  return '⚙ 처리 중';
}

// (구) StreamProgress — ProgressHeader 로 대체됨. 미사용 코드 제거.

function ResponseFooter({
  resp,
  onReview,
}: {
  resp: AgentRunResponse;
  onReview: (suggestionIds: string[]) => void;
}) {
  const aborted = resp.budget?.abort;
  const charged = resp.receipt?.charged ?? 0;

  return (
    <div className="self-start w-full max-w-[85%] space-y-1">
      {aborted && (
        <div className="rounded bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-600">
          [한도 도달: {aborted}] 부분 결과만 반환되었습니다.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        <span>📄 차감 {charged} 크레딧</span>
        {resp.receipt?.balance != null && <span>· 잔액 {resp.receipt.balance}</span>}
        {resp.duration_ms && <span>· {Math.round(resp.duration_ms / 100) / 10}s</span>}
        {resp.suggestion_ids.length > 0 && (
          <button
            type="button"
            onClick={() => onReview(resp.suggestion_ids)}
            className="rounded border border-primary bg-primary/10 px-2 py-0.5 font-medium text-primary hover:bg-primary/20"
            title="제안을 카드로 하나씩 검토"
          >
            제안 {resp.suggestion_ids.length}건 검토하기 →
          </button>
        )}
      </div>
    </div>
  );
}

// ─────── 제안 검토 오버레이 (입력창 자리, 좌우 페이지네이션) ───────

interface ReviewState {
  suggestions: AgentSuggestion[];
  idx: number;
  busyId: string | null;
}

function ReviewOverlay({
  state,
  onPrev,
  onNext,
  onApprove,
  onReject,
  onClose,
}: {
  state: ReviewState;
  onPrev: () => void;
  onNext: () => void;
  /** spelling_batch 일 때 selectedIndices 가 전달됨. 다른 entity_type 은 undefined. */
  onApprove: (id: string, selectedIndices?: number[]) => void;
  onReject: (id: string) => void;
  onClose: () => void;
}) {
  const total = state.suggestions.length;
  const current = state.suggestions[state.idx];
  const decoded = useDecryptedSuggestion(current);
  const busy = state.busyId === current.id;
  const atFirst = state.idx === 0;
  const atLast = state.idx === total - 1;
  const isPending = current.status === 'pending';
  const isReviewIssue = current.entity_type === 'review_issue';
  const isSpellingFix = current.entity_type === 'spelling_fix';
  const isSpellingBatch = current.entity_type === 'spelling_batch';
  // 본문 영역 접기 토글 — 한 줄 헤더만 보이게 (입력창 공간 확보).
  // 카드 전환 시 (idx 변경) 자동으로 펼침으로 복귀.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(false);
  }, [current.id]);

  // spelling_batch 의 체크 상태를 부모에서 직접 관리 — 외부 footer 액션 버튼이 같은 state 사용.
  // 카드 전환 시 (idx 변경) 새 spelling_batch 의 fixes 길이만큼 모두 체크된 상태로 리셋.
  const batchFixCount = useMemo(() => {
    if (!isSpellingBatch) return 0;
    const fixes = (current.payload as { fixes?: unknown[] } | undefined)?.fixes;
    return Array.isArray(fixes) ? fixes.length : 0;
  }, [current.id, current.payload, isSpellingBatch]);
  const [batchChecked, setBatchChecked] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (isSpellingBatch) {
      setBatchChecked(new Set(Array.from({ length: batchFixCount }, (_, i) => i)));
    } else {
      setBatchChecked(new Set());
    }
    // current.id 만 deps — 같은 batch 카드 안에서 사용자가 체크 토글한 건 보존
  }, [current.id, batchFixCount, isSpellingBatch]);

  const statusLabel = current.status === 'confirmed'
    ? isReviewIssue ? '✓ 확인됨' : isSpellingFix ? '✓ 적용됨' : isSpellingBatch ? '✓ 적용됨' : '✓ 승인 (자동 작성됨)'
    : current.status === 'rejected'
      ? isReviewIssue || isSpellingFix || isSpellingBatch ? '무시' : '거절'
      : null;

  const rejectLabel = isReviewIssue || isSpellingBatch ? '무시' : isSpellingFix ? '무시' : '거절';
  const approveLabel = isReviewIssue
    ? '확인'
    : isSpellingFix
      ? '적용'
      : isSpellingBatch
        ? `적용 (${batchChecked.size})`
        : '승인 (자동 작성)';
  const approveDisabled = busy || (isSpellingBatch && batchChecked.size === 0);
  const approveTitle = isReviewIssue
    ? '확인 처리 (본문 자동 수정 안 함 — 작가가 직접 수정)'
    : isSpellingFix
      ? '승인 시 본문에 즉시 자동 치환 (PowerSync sync)'
      : isSpellingBatch
        ? `체크된 ${batchChecked.size}건만 본문에 일괄 자동 치환`
        : '승인 시 본문에 자동 작성됩니다';

  return (
    <div className="flex shrink-0 flex-col border-t border-primary/30 bg-card shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      {/* 헤더 — 카운터·entity 칩·닫기 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-1.5">
        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary tabular-nums">
          {state.idx + 1} / {total}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {entityLabel(current.entity_type)}
        </span>
        {decoded.ready ? (
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{decoded.suggested_name}</span>
        ) : (
          <span className="h-3 min-w-0 flex-1 animate-pulse rounded bg-muted/60" />
        )}
        {statusLabel && (
          <span className="shrink-0 text-[10px] text-muted-foreground">{statusLabel}</span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          title={collapsed ? '본문 펼치기' : '본문 접기 (한 줄로)'}
          aria-label={collapsed ? '펼치기' : '접기'}
        >
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          title="검토 닫기 (입력창으로 돌아가기)"
          aria-label="검토 닫기"
        >
          <X size={14} />
        </button>
      </div>

      {/* 본문 — 스크롤 가능 영역. 내장 [거절/승인] 버튼은 hideActions 로 숨김 — footer 가 통합 제공.
          spelling_batch 는 controlledChecked 로 체크 상태를 부모와 공유 → footer 의 [적용 (N)] 버튼이 같은 selection 사용.
          collapsed 면 본문 영역 숨김 — 헤더 + 푸터 액션 버튼만 표시되어 한 줄에 가까운 컴팩트 UI. */}
      {!collapsed && (
        <div className="max-h-[26vh] min-h-0 overflow-y-auto px-3 py-1.5">
          <SuggestionBodyPreview
            s={current}
            workId={current.work_id}
            busy={busy}
            onApprove={(selectedIndices) => onApprove(current.id, selectedIndices)}
            onReject={() => onReject(current.id)}
            hideActions
            batchChecked={isSpellingBatch ? batchChecked : undefined}
            onBatchCheckedChange={isSpellingBatch ? setBatchChecked : undefined}
          />
        </div>
      )}

      {/* 푸터 — 좌우 페이지네이션(아이콘 only) + 액션. 컴팩트 디자인 */}
      <div className="flex shrink-0 items-center gap-1 border-t border-border/50 px-2 py-1">
        <button
          type="button"
          onClick={onPrev}
          disabled={atFirst}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
          title="이전 제안"
          aria-label="이전 제안"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={atLast}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
          title="다음 제안"
          aria-label="다음 제안"
        >
          <ChevronRight size={14} />
        </button>
        <div className="flex-1" />
        {isPending && (
          <>
            <button
              type="button"
              onClick={() => onReject(current.id)}
              disabled={busy}
              className="flex h-6 items-center gap-0.5 rounded border border-border px-2 text-[11px] hover:bg-accent disabled:opacity-50"
              title={
                isReviewIssue
                  ? '이 발견을 무시'
                  : isSpellingFix
                    ? '이 수정을 무시'
                    : isSpellingBatch
                      ? '이 묶음 전체 무시'
                      : '이 제안을 거절'
              }
            >
              <X size={11} /> {rejectLabel}
            </button>
            <button
              type="button"
              onClick={() =>
                onApprove(
                  current.id,
                  isSpellingBatch
                    ? Array.from(batchChecked).sort((a, b) => a - b)
                    : undefined,
                )
              }
              disabled={approveDisabled}
              className={
                isReviewIssue
                  ? 'flex h-6 items-center gap-0.5 rounded border border-border px-2 text-[11px] hover:bg-accent disabled:opacity-50'
                  : 'flex h-6 items-center gap-0.5 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
              }
              title={approveTitle}
            >
              <Check size={11} /> {approveLabel}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
