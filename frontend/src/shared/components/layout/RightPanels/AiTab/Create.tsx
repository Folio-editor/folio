import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Info,
  Loader2,
  PenSquare,
  Square,
  X,
} from 'lucide-react';
import { analytics, charCountBucket } from '../../../../lib/analytics';
import { useAiSessionStore } from '../../../../stores/aiSessionStore';
import { useResizableTopHandle } from '../../../../hooks/useResizableTopHandle';
import { ChatMarkdown } from '../../../../features/agent/ChatMarkdown';
import {
  SuggestionBodyPreview,
  entityLabel,
  useDecryptedSuggestion,
} from '../../../../features/agent/suggestionPreview';
import { toolLabel } from '../../../../features/agent/toolLabels';
import type { AgentSuggestion } from '../../../../api/agent';
import { CardlessInput, CARDLESS_INPUT_CLASS } from './CardlessInput';

/* ── 문서 생성: 입력 화면 (자유 프롬프트 + 참고 회차 선택) ── */

export function CreateInputScreen({
  selectedWorkId,
}: {
  selectedWorkId: string | null;
}) {
  const prompt = useAiSessionStore((s) => s.createPrompt);
  const setPrompt = useAiSessionStore((s) => s.setCreatePrompt);
  const referencePrompt = useAiSessionStore((s) => s.createReferencePrompt);
  const setReferencePrompt = useAiSessionStore((s) => s.setCreateReferencePrompt);
  const startCreate = useAiSessionStore((s) => s.startCreate);
  const startCreateStream = useAiSessionStore((s) => s.startCreateStream);
  const failCreate = useAiSessionStore((s) => s.failCreate);
  const setScreen = useAiSessionStore((s) => s.setScreen);

  const [submitting, setSubmitting] = useState(false);

  const canSubmit = !!selectedWorkId && prompt.trim().length >= 4 && !submitting;

  async function handleSubmit() {
    if (!selectedWorkId || !canSubmit) return;
    setSubmitting(true);
    void analytics.track('ai_create_requested', {
      prompt_char_count_bucket: charCountBucket(prompt.trim().length),
      reference_char_count_bucket: charCountBucket(referencePrompt.trim().length),
    });
    try {
      // agent 'card_auto' 시나리오로 thread 생성 — 'auto' 와 동작 동일 (모든 도구 + 의도 자동 분류).
      // 별도 식별자로 분리해 list_threads (채팅 모드 목록) 에 카드 단발 세션이 노출 안 되도록 함.
      const r = await (await import('../../../../api/agent')).createAgentThread(selectedWorkId, 'card_auto');
      const tid = r?.thread_id;
      if (!tid) throw new Error('thread_id 누락');
      // 참고 자료 자유 프롬프트 — agent 가 list_episodes / list_world_notes / list_characters 등으로 alf 자체 해석
      const refBlock = referencePrompt.trim()
        ? `[참고 자료]\n${referencePrompt.trim()}\n\n`
        : '';
      const fullPrompt = refBlock + prompt.trim();
      startCreate(tid, 'create-input');
      // SSE 는 store 가 보유 — 컴포넌트 lifecycle 과 무관하게 스트림이 계속 흐른다.
      // CreateStreamingScreen 이 unmount 되어도 chunk 가 store 에 누적되므로 화면 복귀 시 진행 상태 복원.
      startCreateStream(tid, fullPrompt);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      failCreate(`대화 생성 실패: ${msg}`);
      void analytics.track('ai_create_failed', {
        reason_code: 'thread_create_failed',
      });
      setScreen('create-input');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <CardlessInput
          label={<>어떤 문서를 만들까요? <span className="text-danger">*</span></>}
          help="만들고 싶은 문서를 자유롭게 적어주세요."
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            maxLength={2000}
            placeholder="만들고 싶은 문서를 자유롭게 적어주세요."
            className={CARDLESS_INPUT_CLASS}
          />
        </CardlessInput>

        <CardlessInput
          label="참고 자료 지시 (선택)"
          help="참고할 회차 범위나 문서명을 적으면 AI 가 자동으로 찾아 참고합니다."
        >
          <textarea
            value={referencePrompt}
            onChange={(e) => setReferencePrompt(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="참고할 회차 범위나 문서명을 적어주세요."
            className={CARDLESS_INPUT_CLASS}
          />
        </CardlessInput>

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          className="flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <PenSquare size={14} strokeWidth={1.75} />
          {submitting ? '생성 시작 중...' : '생성 시작'}
        </button>
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          자세한 사용법은 우측 상단 <span className="font-medium">?</span> 도움말을 참고하세요.
        </p>
      </div>
    </div>
  );
}


/* ── (legacy) 참고 회차 picker — 현재 미사용. 다회차 선택 UI 복귀 가능성 대비 보존. ── */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ReferenceEpisodePicker({
  workId,
  selected,
  onChange,
}: {
  workId: string | null;
  selected: number[];
  onChange: (orders: number[]) => void;
}) {
  // PowerSync 로 episode 목록 — sort_order 만 선택 picker 로 노출. 본문/제목 평문은 필요 X.
  const episodesQuery = useQuery<{ id: string; sort_order: number; title: string | null }>(
    workId
      ? `SELECT id, sort_order, title FROM episode WHERE work_id = ? AND status != 'trashed' ORDER BY sort_order DESC LIMIT 20`
      : `SELECT id, sort_order, title FROM episode WHERE 1=0`,
    workId ? [workId] : [],
  );
  const rows = episodesQuery.data ?? [];
  const [open, setOpen] = useState(false);

  function toggle(order: number) {
    if (selected.includes(order)) onChange(selected.filter((n) => n !== order));
    else onChange([...selected, order]);
  }

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          참고 회차 (선택)
        </span>
        {selected.length > 0 && (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {selected.length}
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {open ? '접기' : '펼치기'}
        </span>
      </button>
      {open && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded border border-border/40 bg-muted/20 p-1.5">
          {rows.length === 0 ? (
            <p className="p-2 text-center text-[11px] text-muted-foreground">
              회차가 없습니다.
            </p>
          ) : (
            <div className="flex flex-col">
              {rows.map((ep) => (
                <label
                  key={ep.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(ep.sort_order)}
                    onChange={() => toggle(ep.sort_order)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="font-medium">{ep.title?.trim() || '(제목 없음)'}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 문서 생성: 스트리밍 화면 (SSE 표시 → 완료 시 제안 큐) ── */

export function CreateStreamingScreen() {
  const threadId = useAiSessionStore((s) => s.createThreadId);
  const state = useAiSessionStore((s) => s.createState);
  const steps = useAiSessionStore((s) => s.createSteps);
  const suggestionIds = useAiSessionStore((s) => s.createSuggestionIds);
  const error = useAiSessionStore((s) => s.createError);
  const toolStream = useAiSessionStore((s) => s.createToolStream);

  const turns = useAiSessionStore((s) => s.createTurns);

  const setScreen = useAiSessionStore((s) => s.setScreen);
  const resetCreate = useAiSessionStore((s) => s.resetCreate);
  const abortCreateStream = useAiSessionStore((s) => s.abortCreateStream);

  // SSE 는 store 가 보유 — 본 컴포넌트의 mount/unmount 와 무관하게 스트림 유지.
  // 사용자 명시 "중지" 시에만 abortCreateStream 호출.
  function handleAbort() {
    abortCreateStream();
  }

  function handleStartOver() {
    // origin 도구의 input 화면으로 복귀 — 검수에서 시작했으면 review-input, 문서 생성에서 시작했으면 create-input.
    const origin = useAiSessionStore.getState().createOriginScreen;
    resetCreate();
    setScreen(origin ?? 'create-input');
  }

  // turn 분류 — thinking 들은 진행바에 통합, body 만 카드, wrap 은 plain text
  const thinkingTurns = turns.filter((t) => t.kind === 'thinking');
  const bodyTurns = turns.filter((t) => t.kind === 'body');
  const wrapTurns = turns.filter((t) => t.kind === 'wrap');
  const lastThinking = thinkingTurns[thinkingTurns.length - 1];
  // 진행 중 응답 카드 — 깜빡임 방지를 위해 텍스트가 있는 마지막 thinking turn 을 유지.
  // 도구 호출 직후 빈 thinking turn 이 새로 시작되어도 (text 0자) 카드가 사라지지 않고
  // 직전 turn 의 텍스트를 계속 보여주다가, 새 turn 에 text_delta 가 도착하면 그 내용으로
  // 자연스럽게 교체. propose_episode_draft 발화 시 turn.kind='body' 로 승격되어 아래
  // body 카드가 자리를 이어받음 (이때만 사라짐).
  const lastTurnWithText = thinkingTurns
    .slice()
    .reverse()
    .find((t) => t.text.trim().length > 0);
  // 카드 헤더에 표시할 도구명 — 가장 최근 step 의 tool_name (현재 진행 상태 반영).
  const lastToolStep = steps
    .slice()
    .reverse()
    .find((s) => s.step_type === 'tool_call' && s.tool_name);
  const activeToolLabel = lastToolStep?.tool_name
    ? toolLabel(lastToolStep.tool_name)
    : null;
  const showActiveStreamCard =
    state === 'streaming' &&
    bodyTurns.length === 0 &&
    lastTurnWithText != null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {/* 진행 표시 — 도구 호출 step + 현재 사고 응답 통합 (덮어쓰기 + 펼침) */}
        {(state === 'streaming' || thinkingTurns.length > 0) && (
          <CreateProgressHeader
            steps={steps}
            thinkingTurns={thinkingTurns}
            lastThinking={lastThinking}
            streaming={state === 'streaming'}
          />
        )}

        {/* 진행 중 응답 카드 — turn 전환되어도 카드 자체는 mount 유지, 내용만 latest text 로 교체.
            깜빡임 차단: lastTurnWithText 는 thinkingTurns 중 텍스트 있는 마지막 항목 (빈 turn skip).
            도구 라벨은 별도 — 가장 최근 tool_call step 의 이름 (현재 진행 상태 즉시 반영). */}
        {showActiveStreamCard && lastTurnWithText && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 shadow-sm">
            <div className="mb-1.5 flex items-center gap-1.5">
              <PenSquare size={12} className="shrink-0 text-primary" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
                응답 중
              </span>
              {activeToolLabel && (
                <span className="truncate text-[10px] text-muted-foreground/70">
                  🔧 {activeToolLabel}
                </span>
              )}
            </div>
            <div
              ref={(el) => {
                if (el) el.scrollTop = el.scrollHeight;
              }}
              className="max-h-[50vh] overflow-y-auto text-sm leading-relaxed text-foreground"
            >
              <ChatMarkdown text={lastTurnWithText.text} variant="assistant" />
              <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-current opacity-60" />
            </div>
          </div>
        )}

        {/* 본문 카드 — body turn 만 강조 카드로. propose_episode_draft 호출된 turn. */}
        {bodyTurns.map((turn, i) => {
          const isLastBody = i === bodyTurns.length - 1;
          // streaming 중이고 마지막 body turn 이며 wrap 아직 안 시작했으면 cursor
          const showCursor = state === 'streaming' && isLastBody && wrapTurns.length === 0;
          return (
            <div
              key={`body-${i}`}
              className="rounded-md border border-primary/40 bg-primary/5 p-3 shadow-sm"
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <PenSquare size={12} className="shrink-0 text-primary" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
                  본문
                </span>
                {turn.toolNames.length > 0 && (
                  <span className="truncate text-[10px] text-muted-foreground/70">
                    🔧 {turn.toolNames.map(toolLabel).join(' · ')}
                  </span>
                )}
              </div>
              <div
                ref={(el) => {
                  if (el && showCursor) el.scrollTop = el.scrollHeight;
                }}
                className="max-h-[50vh] overflow-y-auto text-sm leading-relaxed text-foreground"
              >
                <ChatMarkdown text={turn.text} variant="assistant" />
                {showCursor && (
                  <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-current opacity-60" />
                )}
              </div>
            </div>
          );
        })}

        {/* fallback — 모델이 prompt 무시하고 propose 의 input.content 에 본문 채운 경우 */}
        {bodyTurns.length === 0 && toolStream?.text && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 shadow-sm">
            <div className="mb-1.5 flex items-center gap-1.5">
              <PenSquare size={12} className="shrink-0 text-primary" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
                본문
              </span>
            </div>
            <div className="max-h-[50vh] overflow-y-auto text-sm leading-relaxed text-foreground">
              <ChatMarkdown text={toolStream.text} variant="assistant" />
            </div>
          </div>
        )}

        {/* 마무리 텍스트 — 카드 X, plain text */}
        {wrapTurns.map((turn, i) => (
          turn.text.trim() && (
            <div key={`wrap-${i}`} className="px-1 text-xs leading-relaxed text-muted-foreground">
              <ChatMarkdown text={turn.text} variant="assistant" />
            </div>
          )
        ))}

        {/* 에러 */}
        {state === 'error' && (
          <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-xs text-danger">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span className="leading-relaxed">{error || '생성에 실패했습니다.'}</span>
          </div>
        )}

        {/* 완료 시 — 본문 카드(propose_episode_draft) 가 없으면 "AI 결과" 카드로 노출.
            ★ lastThinking (마지막 turn) 이 아니라 lastTurnWithText (텍스트 있는 마지막 turn) 사용.
            AI 가 검수 보고서 출력 → propose_review_issue tool_use → 종료 순서로 응답하면
            마지막 thinking turn 은 propose 호출만 들어있는 빈 turn 이 된다 (text=''). 그대로 두면
            'done' 전환 직후 카드가 증발 — streaming 중엔 lastTurnWithText 폴백으로 보이다가
            state 가 'done' 되는 순간 사라지는 버그가 났다. 캐싱된 직전 텍스트로 복원. */}
        {state === 'done' &&
          bodyTurns.length === 0 &&
          (lastTurnWithText?.text.trim() ?? '') !== '' && (
            <div className="rounded-md border border-border bg-muted/30 p-3 shadow-sm">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Info size={12} className="shrink-0 text-muted-foreground" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  AI 결과
                </span>
              </div>
              <div className="max-h-[50vh] overflow-y-auto text-sm leading-relaxed text-foreground">
                <ChatMarkdown text={lastTurnWithText!.text.trim()} variant="assistant" />
              </div>
            </div>
          )}
      </div>

      {/* 제안 검토 dock — 패널 하단 (액션 버튼 위). 페이지네이션 + SuggestionBodyPreview.
          state === 'done' 이면 무조건 mount 해서 dock 이 직접 fetch — suggestion_ids 가
          빈 채로 도착해도 source_thread_id 매칭으로 카드 복원 가능. */}
      {state === 'done' && (
        <CreateSuggestionsDock
          suggestionIds={suggestionIds}
          threadId={threadId ?? null}
        />
      )}

      {/* 하단 액션 — streaming 중엔 중지 / done|error 시 다시 만들기 */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border p-2">
        {state === 'streaming' ? (
          <button
            type="button"
            onClick={handleAbort}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-accent"
          >
            <Square size={12} strokeWidth={2} />
            중지
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStartOver}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-accent"
          >
            <ArrowLeft size={12} strokeWidth={2} />
            다시 만들기
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 진행 표시줄 — thinking turn 들과 도구 호출 step 을 통합. collapsible.
 *
 * - 접힌 상태 (default): 가장 최근 thinking text + 가장 최근 도구 호출 라벨 (덮어쓰기)
 * - 펼친 상태: thinking turn 별로 누적 표시 (사고 히스토리)
 *
 * 사용자 요구: 사고 응답 카드 누적 X. 진행 중 정보만 표시 + 필요 시 펼침.
 */
function CreateProgressHeader({
  steps,
  thinkingTurns,
  lastThinking,
  streaming,
}: {
  steps: CreateStreamStepLite[];
  thinkingTurns: { kind: 'thinking' | 'body' | 'wrap'; text: string; toolNames: string[] }[];
  lastThinking: { kind: 'thinking' | 'body' | 'wrap'; text: string; toolNames: string[] } | undefined;
  streaming: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const lastStep = steps[steps.length - 1];
  const lastStepLabel = lastStep
    ? labelCreateStep(lastStep)
    : (streaming ? '의도를 분석 중...' : '');
  // 접힌 상태에 표시할 한 줄 사고 — 마지막 thinking turn 의 text 끝부분 (긴 text 는 잘라서 표시)
  const lastThinkingPreview = (lastThinking?.text ?? '').replace(/\s+/g, ' ').trim().slice(-80);

  return (
    <div className="rounded-md bg-muted/40 text-[11px]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/60"
      >
        {streaming ? (
          <Loader2 size={12} className="shrink-0 animate-spin text-primary" />
        ) : (
          <Check size={12} className="shrink-0 text-emerald-600" />
        )}
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {lastStepLabel}
          {lastThinkingPreview && (
            <span className="ml-2 text-muted-foreground/70">· {lastThinkingPreview}</span>
          )}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground/70 tabular-nums">
          step {lastStep?.iterations ?? 0} · {lastStep?.cum_user_tokens ?? 0} 크레딧
        </span>
        {expanded ? (
          <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
        )}
      </button>
      {expanded && thinkingTurns.length > 0 && (
        <div className="border-t border-border/40 px-3 py-2 space-y-2">
          {thinkingTurns.map((turn, i) => (
            (turn.text.trim() || turn.toolNames.length > 0) && (
              <div key={i} className="text-[11px] text-muted-foreground">
                {turn.toolNames.length > 0 && (
                  <div className="mb-0.5 text-[10px] text-muted-foreground/60">
                    🔧 {turn.toolNames.map(toolLabel).join(' · ')}
                  </div>
                )}
                {turn.text.trim() && (
                  <div className="leading-relaxed">{turn.text.trim()}</div>
                )}
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}

function labelCreateStep(s: CreateStreamStepLite | undefined): string {
  if (!s) return '대기 중...';
  // 도구명/시스템 명칭 raw 노출 금지 — toolLabel 매핑 미존재 시 일반 라벨로 마스킹.
  if (s.step_type === 'tool_call') return `🔧 ${toolLabel(s.tool_name)}`;
  if (s.step_type === 'planner_call') return '💭 답변 구상 중';
  if (s.step_type === 'worker_call') return '🛠 보조 에이전트 분석 중';
  if (s.step_type === 'compression') return '📦 이전 대화 압축 중';
  return '⚙ 처리 중';
}

interface CreateStreamStepLite {
  step_type: string;
  tool_name?: string | null;
  user_tokens?: number;
  iterations?: number;
  cum_user_tokens?: number;
  seq?: number;
}

/**
 * 완료 후 제안 검토 dock — AgentChatPanel 의 ReviewOverlay 와 동일 패턴.
 * - 좌우 페이지네이션으로 카드 1건씩 표시
 * - SuggestionBodyPreview 로 entity 별 풍부한 미리보기 (spelling_batch 체크리스트 포함)
 * - 푸터에 거절/적용 액션 통합 (spelling_batch 는 체크된 N건만 적용)
 * - 패널 하단에 sticky 로 위치 — 액션 버튼(다시 만들기) 위.
 *
 * 매칭 전략 (다중 fallback — backend race / done 이벤트 누락에도 강건):
 *   1) suggestion_ids 가 done 이벤트에 실려 도착 → 그 ID set 매칭 (가장 정확)
 *   2) source_thread_id === threadId 매칭 (이번 run 의 모든 propose 자동 수집)
 *   3) 둘의 union — 어느 한쪽이라도 식별되는 카드 모두 포함
 *   4) 모두 실패 → status=all 로 폴백 재조회 + 동일 매칭
 */
function CreateSuggestionsDock({
  suggestionIds,
  threadId,
}: {
  suggestionIds: string[];
  threadId: string | null;
}) {
  const [suggestions, setSuggestions] = useState<AgentSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setSuggestions([]);
    setIdx(0);
    if (suggestionIds.length === 0 && !threadId) {
      // 식별 단서 자체가 없음 — 폴백 매칭도 불가
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;

    const matchAny = (rows: AgentSuggestion[]): AgentSuggestion[] => {
      const wantedIds = new Set(suggestionIds);
      return rows.filter(
        (s) => wantedIds.has(s.id) || (threadId != null && s.source_thread_id === threadId),
      );
    };
    const sortByOrder = (rows: AgentSuggestion[]) => {
      // suggestion_ids 입력 순서 우선, 그 외는 created_at ASC (에이전트 호출 순)
      const order = new Map(suggestionIds.map((id, i) => [id, i]));
      return [...rows].sort((a, b) => {
        const oa = order.get(a.id);
        const ob = order.get(b.id);
        if (oa != null && ob != null) return oa - ob;
        if (oa != null) return -1;
        if (ob != null) return 1;
        return (a.created_at ?? '').localeCompare(b.created_at ?? '');
      });
    };

    void (async () => {
      try {
        const api = await import('../../../../api/agent');
        // 1차: pending 만 (방금 생성된 제안은 거의 항상 pending)
        let all = await api.listSuggestions('pending');
        let matched = matchAny(all);
        if (matched.length === 0) {
          // 2차: 전체 status — 이미 confirmed/rejected 처리된 케이스 방어
          all = await api.listSuggestions();
          matched = matchAny(all);
        }
        if (!cancelled) setSuggestions(sortByOrder(matched));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [suggestionIds, threadId]);

  async function act(
    id: string,
    status: 'confirmed' | 'rejected',
    selectedIndices?: number[],
  ) {
    setBusyId(id);
    try {
      const api = await import('../../../../api/agent');
      await api.patchSuggestion(id, status, undefined, selectedIndices);
      // 처리된 카드는 deck 에서 즉시 제거 — 3개 처리하면 dock 자체 사라짐.
      // (확인된 내역은 작업물 탭의 SuggestionInbox 에서 status 필터로 조회 가능)
      setSuggestions((prev) => {
        const filtered = prev.filter((s) => s.id !== id);
        if (filtered.length === 0) {
          setIdx(0);
          return filtered;
        }
        // 현재 위치 기준 다음 카드 표시 (이미 제거됐으니 idx 조정)
        setIdx((cur) => Math.min(cur, filtered.length - 1));
        return filtered;
      });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" />
        제안 불러오는 중...
      </div>
    );
  }

  // 제안이 없으면 dock 자체를 그리지 않는다 — AI 결과 카드가 메인 영역을 차지하므로
  // 추가 empty state 카드는 중복/노이즈.
  if (suggestions.length === 0) {
    return null;
  }

  const current = suggestions[idx];
  if (!current) return null;
  return (
    <CreateSuggestionsDockOverlay
      suggestions={suggestions}
      idx={idx}
      busy={busyId === current.id}
      onPrev={() => setIdx((i) => Math.max(0, i - 1))}
      onNext={() => setIdx((i) => Math.min(suggestions.length - 1, i + 1))}
      onApprove={(selectedIndices) => void act(current.id, 'confirmed', selectedIndices)}
      onReject={() => void act(current.id, 'rejected')}
    />
  );
}

/** dock 안의 단일 카드 — AgentChatPanel.ReviewOverlay 와 동일 레이아웃. */
function CreateSuggestionsDockOverlay({
  suggestions,
  idx,
  busy,
  onPrev,
  onNext,
  onApprove,
  onReject,
}: {
  suggestions: AgentSuggestion[];
  idx: number;
  busy: boolean;
  onPrev: () => void;
  onNext: () => void;
  onApprove: (selectedIndices?: number[]) => void;
  onReject: () => void;
}) {
  const total = suggestions.length;
  const current = suggestions[idx];
  const decoded = useDecryptedSuggestion(current);
  const atFirst = idx === 0;
  const atLast = idx === total - 1;
  const isPending = current.status === 'pending';
  const isReviewIssue = current.entity_type === 'review_issue';
  const isSpellingFix = current.entity_type === 'spelling_fix';
  const isSpellingBatch = current.entity_type === 'spelling_batch';
  // 본문 영역 접기 토글 — 한 줄 헤더만 보이게 (액션 버튼 공간 확보).
  // 카드 전환 시 (idx/id 변경) 자동으로 펼침으로 복귀.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(false);
  }, [current.id]);

  // 상단 드래그 핸들로 본문 높이 조절 — 초기 26vh.
  const { height: bodyHeight, onPointerDown: onResizeHandlePointerDown } =
    useResizableTopHandle();

  // spelling_batch 체크리스트 상태 — 카드 전환 시 모두 체크된 상태로 리셋
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, batchFixCount, isSpellingBatch]);

  const statusLabel =
    current.status === 'confirmed'
      ? isReviewIssue ? '✓ 확인됨' : isSpellingFix || isSpellingBatch ? '✓ 적용됨' : '✓ 승인'
      : current.status === 'rejected'
        ? isReviewIssue || isSpellingFix || isSpellingBatch ? '무시' : '거절'
        : null;

  const rejectLabel = isReviewIssue || isSpellingFix || isSpellingBatch ? '무시' : '거절';
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
      ? '승인 시 본문에 즉시 자동 치환'
      : isSpellingBatch
        ? `체크된 ${batchChecked.size}건만 본문에 일괄 자동 치환`
        : '승인 시 본문에 자동 작성됩니다';

  return (
    <div className="flex shrink-0 flex-col border-t border-primary/30 bg-card shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      {/* 상단 리사이즈 핸들 — 위/아래 드래그로 본문 영역 높이 조절 */}
      <div
        onPointerDown={onResizeHandlePointerDown}
        className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center bg-primary/5 hover:bg-primary/20"
        title="드래그해서 높이 조절"
        aria-label="제안 카드 높이 조절"
        role="separator"
      >
        <div className="h-0.5 w-10 rounded-full bg-border group-hover:bg-primary/60" />
      </div>
      {/* 헤더 — 카운터 · entity · 제목 · 상태 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-1.5">
        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary tabular-nums">
          {idx + 1} / {total}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {entityLabel(current.entity_type)}
        </span>
        {decoded.ready ? (
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
            {decoded.suggested_name}
          </span>
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
      </div>

      {/* 본문 — entity 별 풍부 미리보기. footer 가 액션 통합 → hideActions.
          collapsed 면 본문 영역 숨김 — 헤더 + 푸터만 보이는 한 줄 컴팩트 UI. */}
      {!collapsed && (
        <div
          style={{ height: bodyHeight }}
          className="min-h-0 overflow-y-auto px-3 py-1.5"
        >
          <SuggestionBodyPreview
            s={current}
            workId={current.work_id}
            busy={busy}
            onApprove={(selectedIndices) => onApprove(selectedIndices)}
            onReject={onReject}
            hideActions
            batchChecked={isSpellingBatch ? batchChecked : undefined}
            onBatchCheckedChange={isSpellingBatch ? setBatchChecked : undefined}
          />
        </div>
      )}

      {/* 푸터 — 좌우 페이지네이션 + 액션 */}
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
              onClick={onReject}
              disabled={busy}
              className="flex h-6 items-center gap-0.5 rounded border border-border px-2 text-[11px] hover:bg-accent disabled:opacity-50"
            >
              <X size={11} /> {rejectLabel}
            </button>
            <button
              type="button"
              onClick={() =>
                onApprove(
                  isSpellingBatch ? Array.from(batchChecked).sort((a, b) => a - b) : undefined,
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
