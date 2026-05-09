/**
 * Agent 채팅 패널 (Phase 4 §N).
 *
 * - 시나리오 선택 + thread 선택/생성
 * - 사용자/AI 메시지 표시
 * - 영수증 link, abort 배너, suggestion 카드
 * - 자동 sync/async 라우팅
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';

import {
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
import { apiClient } from '../../lib/apiClient';
import { useAgentChatStore } from '../../stores/agentChatStore';
import { useAuthStore } from '../../stores/authStore';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

// 게이지 가시화용 — 실제 한도가 아닌 표시 기준 (1 thread 누적 500 크레딧 ≈ 4,000원).
const SESSION_CREDIT_DISPLAY_MAX = 500;
const EMPTY_THREADS: AgentThreadSummary[] = [];

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
  const [sessionTokens, setSessionTokens] = useState(0);     // thread 내 누적 사용자 토큰 (영수증 합산)
  const scrollRef = useRef<HTMLDivElement>(null);

  // ─── thread 목록 로드 ───
  useEffect(() => {
    if (!eligible) return;
    listAgentThreads(workId)
      .then((rows) => setThreads(workId, rows))
      .catch((e) => setError(`목록 조회 실패: ${e?.message ?? e}`));
  }, [eligible, workId, setThreads]);

  // ─── 활성 thread 상세 로드 ───
  useEffect(() => {
    if (!eligible) return;
    if (!activeThreadId) {
      setThread(null);
      setSessionTokens(0);
      return;
    }
    setLoading(true);
    setSessionTokens(0);   // thread 변경 시 카운터 리셋 (백엔드 누적은 영수증으로 추적)
    getAgentThread(activeThreadId)
      .then((d) => setThread(d))
      .catch((e) => setError(`thread 조회 실패: ${e?.message ?? e}`))
      .finally(() => setLoading(false));
  }, [eligible, activeThreadId]);

  // ─── 자동 스크롤 ───
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread?.messages.length, lastResponse]);

  const tokensUsed = sessionTokens;
  const ratio = Math.min(1, tokensUsed / SESSION_CREDIT_DISPLAY_MAX);
  const tokenColor =
    ratio > 0.8 ? 'bg-red-500' : ratio > 0.5 ? 'bg-yellow-500' : 'bg-zinc-400';

  async function handleNewThread() {
    setError(null);
    setHistoryOpen(false);
    try {
      const r = await createAgentThread(workId, 'auto');
      const tid = r.threadId;
      setActiveThread(workId, tid);
      const refreshed = await listAgentThreads(workId);
      setThreads(workId, refreshed);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
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

  async function handleSend() {
    if (!message.trim() || !activeThreadId || sending) return;
    setError(null);
    const text = message.trim();
    setMessage('');
    setSending(true);
    setStreaming(true);
    setStreamSteps([]);
    setLiveAssistantTurns([]);
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
                setError(`태스크 실패 — ${evt.error_type}: ${evt.error_message}`);
                return true;
              }
            },
            () => resolve(),
            (err) => reject(err),
          )
          .catch(reject);
      });
      if (doneHolder.evt) {
        setLastResponse(doneHolder.evt);
        const used = doneHolder.evt.budget?.user_tokens ?? 0;
        if (used > 0) setSessionTokens((prev) => prev + used);
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
      setError(`전송 실패: ${msg}`);
    } finally {
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
    const bubble =
      role === 'user'
        ? 'bg-primary text-primary-foreground'
        : 'bg-sidebar-accent text-sidebar-accent-foreground';
    return (
      <div key={idx} className={`flex flex-col ${align} gap-1`}>
        <div className="text-[10px] text-muted-foreground">{role === 'user' ? '나' : 'Agent'}</div>
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
      {/* 헤더 — 단일 트리거 (현재 대화 제목 ▼). 드롭다운 안에 [+ 새 대화] + 히스토리 + 항목별 X 삭제. */}
      <div className="relative flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1 text-left text-xs hover:border-border hover:bg-accent"
          title="대화 목록 / 새 대화"
        >
          <span className="truncate font-medium">
            {activeTitle ?? '+ 새 대화 시작'}
          </span>
          {historyOpen
            ? <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
            : <ChevronRight size={12} className="shrink-0 text-muted-foreground" />}
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
              {/* + 새 대화 — 드롭다운 첫 항목 (한 번 클릭으로 즉시 생성·전환) */}
              <button
                type="button"
                onClick={() => void handleNewThread()}
                className="flex w-full items-center gap-2 border-b border-border/60 bg-muted/40 px-2 py-2 text-left text-xs font-medium text-primary hover:bg-accent"
              >
                <Plus size={14} className="shrink-0" />
                새 대화 시작
              </button>
              {threads.length === 0 && (
                <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                  이전 대화가 없습니다.
                </div>
              )}
              {threads.map((t) => (
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
              ))}
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
            상단 제목 영역을 눌러 [새 대화 시작] 으로 진입하세요.
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
                <div className="text-[10px] text-muted-foreground">Agent</div>
                <div className="max-w-[85%] rounded-lg bg-sidebar-accent px-3 py-2 text-sm text-sidebar-accent-foreground">
                  <ChatMarkdown text={text} variant="assistant" />
                  <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-current opacity-60" />
                </div>
              </div>
            ) : null,
          )}
        {lastResponse && (
          <ResponseFooter resp={lastResponse} workId={workId} />
        )}
        {error && <div className="rounded bg-red-500/10 p-2 text-xs text-red-500">{error}</div>}
      </div>

      {/* 토큰 게이지 */}
      <div className="shrink-0 border-t border-border/40 px-3 py-1">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>이 스레드 누적 차감</span>
          <span>{tokensUsed.toLocaleString()} 크레딧</span>
        </div>
        <div className="mt-0.5 h-1 w-full rounded bg-muted">
          <div
            className={`h-1 rounded ${tokenColor}`}
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
      </div>

      {/* 입력 — 작가가 긴 지시문 작성 시 시야 확보 위해 textarea 4행 + min-h. */}
      <div className="flex shrink-0 items-end gap-2 border-t border-border p-2">
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
          placeholder="메시지 입력 — agent 가 의도 자동 분류 (Ctrl+Enter 전송)"
          disabled={!activeThreadId || sending}
          className="min-h-24 flex-1 resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!activeThreadId || sending || !message.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
          title="전송 (Ctrl+Enter)"
          aria-label="메시지 전송"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2.4} />}
        </button>
      </div>
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

/** 백엔드 도구 ID → 작가용 한글 라벨. 미정의 도구는 가드 fallback ('도구 실행 중'). */
const TOOL_LABELS: Record<string, string> = {
  // 조회 (read-only)
  list_plots: '플롯 목록 조회 중',
  get_plot: '플롯 상세 조회 중',
  list_characters: '인물 목록 조회 중',
  get_character: '인물 상세 조회 중',
  list_world_notes: '세계관 목록 조회 중',
  get_world_note: '세계관 상세 조회 중',
  list_episodes: '회차 목록 조회 중',
  list_all_oneline_summaries: '회차 한 줄 요약 모음 조회 중',
  list_episode_summaries: '회차 요약 목록 조회 중',
  get_episode_summary: '회차 요약 조회 중',
  fetch_episode_plaintext: '회차 본문 가져오는 중',
  // 검색 / 분석
  search_episode_summaries: '회차 요약 검색 중',
  search_episode_chunks: '본문 청크 검색 중',
  query_episodes_by_chunks: '본문 자유 검색 중',
  find_relevant_episodes: '관련 회차 탐색 중',
  track_foreshadow: '복선 추적 분석 중',
  character_arc: '인물 행적 분석 중',
  timeline_scan: '시간선 점검 중',
  summarize_episode: '회차 요약 생성 중',
  analyze_episode: '회차 심층 분석 중',
  request_episode_summary_backfill: '전체 요약 백필 요청 중',
  // 보조 에이전트
  invoke_haiku_worker: '보조 에이전트 작업 중',
  // 쓰기 제안 (작가 승인 큐)
  propose_character: '인물 등록 제안 작성 중',
  propose_character_update: '인물 수정 제안 작성 중',
  propose_character_delete: '인물 삭제 제안 작성 중',
  propose_world_note: '세계관 등록 제안 작성 중',
  propose_world_note_update: '세계관 수정 제안 작성 중',
  propose_world_note_delete: '세계관 삭제 제안 작성 중',
  propose_plot_create: '플롯 추가 제안 작성 중',
  propose_plot_tree: '챕터 트리 추가 제안 작성 중',
  propose_plot_revision: '플롯 재작성 제안 작성 중',
  propose_plot_delete: '플롯 삭제 제안 작성 중',
  propose_episode_draft: '회차 초안 작성 중',
  propose_episode_update: '회차 수정 제안 작성 중',
  propose_episode_delete: '회차 삭제 제안 작성 중',
};

function toolLabel(toolName: string | null | undefined): string {
  if (!toolName) return '도구 실행 중';
  return TOOL_LABELS[toolName] ?? `${toolName} 실행 중`;
}

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

function ResponseFooter({ resp, workId }: { resp: AgentRunResponse; workId: string }) {
  const aborted = resp.budget?.abort;
  const charged = resp.receipt?.charged ?? 0;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AgentSuggestion[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadPreview() {
    if (resp.suggestion_ids.length === 0) return;
    setPreviewOpen((v) => !v);
    if (suggestions != null) return;
    try {
      const all = await listSuggestions();    // pending 만 fetch — 방금 만든 것들
      const map = new Map(all.map((s) => [s.id, s]));
      const matched = resp.suggestion_ids
        .map((id) => map.get(id))
        .filter((s): s is AgentSuggestion => !!s);
      setSuggestions(matched);
    } catch {
      setSuggestions([]);
    }
  }

  async function approve(id: string) {
    setBusyId(id);
    try {
      await patchSuggestion(id, 'confirmed');
      setSuggestions((prev) =>
        prev ? prev.map((s) => (s.id === id ? { ...s, status: 'confirmed' as const } : s)) : prev,
      );
    } finally {
      setBusyId(null);
    }
  }
  async function reject(id: string) {
    setBusyId(id);
    try {
      await patchSuggestion(id, 'rejected');
      setSuggestions((prev) =>
        prev ? prev.map((s) => (s.id === id ? { ...s, status: 'rejected' as const } : s)) : prev,
      );
    } finally {
      setBusyId(null);
    }
  }

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
            onClick={loadPreview}
            className="rounded border border-border px-1.5 py-0.5 hover:bg-accent"
          >
            제안 {resp.suggestion_ids.length}건 {previewOpen ? '접기' : '미리보기'}
          </button>
        )}
      </div>
      {previewOpen && suggestions && (
        <div className="space-y-1">
          {suggestions.map((s) => (
            <SuggestionInlineCard
              key={s.id}
              s={s}
              workId={workId}
              busy={busyId === s.id}
              onApprove={() => approve(s.id)}
              onReject={() => reject(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────── 채팅창 응답 직후 미리보기 카드 (suggested_name v1: 복호화 포함) ───────

function SuggestionInlineCard({
  s,
  workId,
  busy,
  onApprove,
  onReject,
}: {
  s: AgentSuggestion;
  workId: string;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const decoded = useDecryptedSuggestion(s);
  return (
    <div className="rounded border border-border bg-background p-2 text-xs">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {entityLabel(s.entity_type)}
        </span>
        <span className="font-medium">{decoded.suggested_name}</span>
        {s.status !== 'pending' && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            {s.status === 'confirmed' ? '✓ 승인됨 (자동 작성)' : '거절'}
          </span>
        )}
      </div>
      <SuggestionBodyPreview
        s={s}
        workId={workId}
        busy={busy}
        onApprove={onApprove}
        onReject={onReject}
      />
    </div>
  );
}
