/**
 * Agent 채팅 패널 (Phase 4 §N).
 *
 * - 시나리오 선택 + thread 선택/생성
 * - 사용자/AI 메시지 표시
 * - 영수증 link, abort 배너, suggestion 카드
 * - 자동 sync/async 라우팅
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, MessageSquarePlus, Send } from 'lucide-react';

import {
  createAgentThread,
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
    try {
      const r = await createAgentThread(workId, 'auto');
      const tid = r.threadId;
      setActiveThread(workId, tid);
      const refreshed = await listAgentThreads(workId);
      setThreads(workId, refreshed);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`thread 생성 실패: ${msg}`);
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
        <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${bubble}`}>
          {text}
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 헤더 — 시나리오 자동 분류, 사용자는 새 스레드만 만들 수 있다 */}
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="flex-1 text-[11px] text-muted-foreground">
          Agent 자동 모드 — 메시지 의도를 직접 파악합니다
        </span>
        <button
          type="button"
          onClick={handleNewThread}
          className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-accent"
          title="새 스레드"
        >
          <MessageSquarePlus size={14} />
          새 스레드
        </button>
      </div>

      {/* 스레드 셀렉터 */}
      {threads.length > 0 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/40 bg-muted/30 p-1">
          {threads.slice(0, 8).map((t) => (
            <button
              key={t.thread_id}
              onClick={() => setActiveThread(workId, t.thread_id)}
              className={`shrink-0 rounded px-2 py-1 text-xs ${
                t.thread_id === activeThreadId
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-accent'
              }`}
              title={t.thread_id}
            >
              {t.title || `대화 · ${t.thread_id.slice(0, 6)}`}
            </button>
          ))}
        </div>
      )}

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
            [새 스레드] 를 클릭해 대화를 시작하세요.
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
                <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-sidebar-accent px-3 py-2 text-sm text-sidebar-accent-foreground">
                  {text}
                  <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-current opacity-60" />
                </div>
              </div>
            ) : null,
          )}
        {lastResponse && (
          <ResponseFooter resp={lastResponse} />
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

      {/* 입력 */}
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
          rows={2}
          maxLength={8000}
          placeholder="메시지 입력 — agent 가 의도 자동 분류 (Ctrl+Enter 전송)"
          disabled={!activeThreadId || sending}
          className="flex-1 resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!activeThreadId || sending || !message.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
          title="전송 (Ctrl+Enter)"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
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
        <span className="truncate font-mono text-muted-foreground">{lastLabel}</span>
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
        <div className="space-y-0.5 border-t border-border/40 px-3 py-1 font-mono text-[10px] text-muted-foreground">
          {steps.map((l, i) => (
            <div key={`${l.seq}-${i}`}>{labelStep(l)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function labelStep(l: AgentStreamStepEvent): string {
  if (l.step_type === 'tool_call') return `🔧 ${l.tool_name ?? '(tool)'}`;
  if (l.step_type === 'planner_call')
    return `💭 sonnet (in ${l.input_tokens}/out ${l.output_tokens}) · +${l.user_tokens} 크레딧`;
  if (l.step_type === 'worker_call')
    return `🛠 haiku (in ${l.input_tokens}/out ${l.output_tokens}) · +${l.user_tokens} 크레딧`;
  if (l.step_type === 'compression') return '📦 대화 압축';
  return `${l.step_type} · ${l.actor}`;
}

// (구) StreamProgress — ProgressHeader 로 대체됨. 미사용 코드 제거.

function ResponseFooter({ resp }: { resp: AgentRunResponse }) {
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
            <SuggestionPreview
              key={s.id}
              s={s}
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

function SuggestionPreview({
  s,
  busy,
  onApprove,
  onReject,
}: {
  s: AgentSuggestion;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const p = s.payload as Record<string, unknown>;
  const labels: Record<string, string> = {
    character: '인물 추가',
    character_update: '인물 수정',
    character_delete: '인물 삭제',
    world_note: '세계관 추가',
    world_note_update: '세계관 수정',
    world_note_delete: '세계관 삭제',
    plot_revision: '플롯 수정',
    plot_create: '플롯 추가',
    plot_tree: '챕터 + 하위 플롯',
    plot_delete: '플롯 삭제',
    episode_draft: '회차 초안',
    episode_update: '회차 수정',
    episode_delete: '회차 삭제',
  };
  return (
    <div className="rounded border border-border bg-background p-2 text-xs">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {labels[s.entity_type] ?? s.entity_type}
        </span>
        <span className="font-medium">{s.suggested_name}</span>
        {s.status !== 'pending' && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            {s.status === 'confirmed' ? '✓ 승인됨 (자동 작성)' : '거절'}
          </span>
        )}
      </div>
      <div className="space-y-0.5 text-[11px]">
        {s.entity_type === 'episode_draft' && (
          <>
            <div>
              <strong>제목:</strong> {String(p.title ?? '')}
            </div>
            <div className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-muted/30 p-2 text-[11px]">
              {String(p.content ?? '')}
            </div>
          </>
        )}
        {s.entity_type === 'world_note' && (
          <>
            <div>
              <strong>이름:</strong> {String(p.name ?? '')}
            </div>
            <div className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/30 p-2">
              {String(p.content ?? '')}
            </div>
          </>
        )}
        {s.entity_type === 'character' && (
          <>
            {(['name', 'role', 'gender', 'age', 'appearance', 'personality', 'notes'] as const).map(
              (k) => {
                const v = p[k];
                if (!v) return null;
                return (
                  <div key={k}>
                    <strong>{k}:</strong> {String(v)}
                  </div>
                );
              },
            )}
          </>
        )}
        {s.entity_type === 'plot_tree' && (
          <div className="space-y-1">
            <div>
              <strong>📁 {String((p.root as Record<string, unknown>)?.title ?? s.suggested_name)}</strong>
            </div>
            {Boolean((p.root as Record<string, unknown>)?.content) && (
              <div className="rounded bg-muted/30 p-2 text-[11px] whitespace-pre-wrap">
                {String((p.root as Record<string, unknown>).content)}
              </div>
            )}
            <div className="ml-3 space-y-1 border-l border-border/60 pl-2">
              {Array.isArray(p.children) &&
                (p.children as Array<Record<string, unknown>>).map((c, i) => (
                  <div key={i}>
                    <div className="text-[11px]">
                      └ <strong>{String(c.title ?? `(자식 ${i + 1})`)}</strong>
                    </div>
                    {Boolean(c.content) && (
                      <div className="ml-3 rounded bg-muted/20 p-1.5 text-[10px] whitespace-pre-wrap">
                        {String(c.content)}
                      </div>
                    )}
                  </div>
                ))}
            </div>
            <div className="text-[10px] text-muted-foreground">
              승인 시 부모 + 자식 {Array.isArray(p.children) ? p.children.length : 0}개 한꺼번에 작성됩니다.
            </div>
          </div>
        )}
        {(s.entity_type === 'character_update' ||
          s.entity_type === 'world_note_update' ||
          s.entity_type === 'episode_update' ||
          s.entity_type === 'plot_revision') && (
          <pre className="max-h-40 overflow-auto rounded bg-muted/30 p-2 text-[10px]">
            {JSON.stringify(p, null, 2)}
          </pre>
        )}
        {(s.entity_type === 'character_delete' ||
          s.entity_type === 'world_note_delete' ||
          s.entity_type === 'episode_delete') && (
          <div className="rounded bg-red-500/10 p-2 text-[11px] text-red-600">
            ⚠ 삭제 — {String(p.reason ?? '(사유 없음)')}
          </div>
        )}
      </div>
      {s.status === 'pending' && (
        <div className="mt-2 flex justify-end gap-1">
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-accent disabled:opacity-50"
          >
            거절
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={busy}
            className="rounded bg-primary px-2 py-0.5 text-[10px] text-primary-foreground disabled:opacity-50"
          >
            ✓ 승인 (자동 작성)
          </button>
        </div>
      )}
    </div>
  );
}
