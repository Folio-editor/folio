import { useCallback, useEffect } from 'react';
import { useQuery } from '@powersync/react';
import { toast } from 'sonner';
import {
  PenSquare,
  ScrollText,
  SearchCheck,
  SpellCheck,
} from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/apiClient';
import { getRegisteredEditor } from '../../../../lib/activeEditorRegistry';
import { analytics, charCountBucket } from '../../../../lib/analytics';
import { useAgentChatStore } from '../../../../stores/agentChatStore';
import { useAuthStore } from '../../../../stores/authStore';
import { useWalletStore } from '../../../../stores/walletStore';
import { useAiSessionStore } from '../../../../stores/aiSessionStore';
import { useDecryptedEpisode } from '../../../../hooks/useDecryptedEpisode';
import { useAiContextPayload } from '../../../../hooks/useAiContextPayload';
import { useNetworkStatus } from '../../../../hooks/useNetworkStatus';
import { AgentChatPanel } from '../../../../features/agent/AgentChatPanel';
import { describeAiError, INSUFFICIENT_CREDITS_PREFIX } from '../errors';
import { setPendingFirstPrompt } from './pendingPrompt';
import { ReviewInputScreen } from './Review';
import { SpellcheckInputScreen, SpellcheckResultScreen } from './Spellcheck';
import { SummarizeInputScreen, SummarizeResultScreen } from './Summarize';
import { CreateInputScreen, CreateStreamingScreen } from './Create';
import type { AiTabContentProps, EpisodeInfo } from './types';

/* ── AI 탭: 단일 전역 세션 기반 화면 전환 ── */

export function AiTabContent({ selectedWorkId, mainSection, mainItemId }: AiTabContentProps) {
  const isEpisode = mainSection === 'episode' && mainItemId != null;

  // AI 기능 사용 가능 조건: 로그인된 정식 사용자 + 온라인.
  // 게스트(로컬 SQLite-only) / 오프라인 / 미로그인은 AI 호출 시 402/404/네트워크 에러로 이어진다.
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isGuest = useAuthStore((s) => s.isGuest);
  const isOnline = useNetworkStatus();
  const aiEligible = isAuthenticated && !isGuest && isOnline;

  // Phase 4 — Agent 모드 토글 (store 기반, 헤더 와 공유). 작업물 큐는 inbox 탭으로 별도 분리됨.
  const agentMode = useAgentChatStore((s) =>
    selectedWorkId ? s.agentModeByWork[selectedWorkId] ?? false : false,
  );
  const setAgentMode = useAgentChatStore((s) => s.setAgentMode);

  // 자격 상실 시 agent 모드 자동 OFF (오프라인 전환·로그아웃 등)
  useEffect(() => {
    if (!aiEligible && agentMode && selectedWorkId) {
      setAgentMode(selectedWorkId, false);
    }
  }, [aiEligible, agentMode, selectedWorkId, setAgentMode]);

  // 전역 AI 세션 스토어 — pinned episode 우선
  const pinnedEpisodeId = useAiSessionStore((s) => s.pinnedEpisodeId);
  const unpinnedFromEpisodeId = useAiSessionStore((s) => s.unpinnedFromEpisodeId);
  const setPinnedEpisodeId = useAiSessionStore((s) => s.setPinnedEpisodeId);
  const clearPinnedEpisodeId = useAiSessionStore((s) => s.clearPinnedEpisodeId);

  // 자동 등록 + 자동 전환: 사용자가 좌측 사이드바에서 원고를 선택하면(=mainItemId 변경)
  // 카드의 검수/맞춤법/요약 대상 원고도 부드럽게 따라간다. X 버튼으로 직전에 해제한
  // 원고에 그대로 머무는 경우만 자동 재pin 차단(사용자 명시 의지 존중).
  useEffect(() => {
    if (!isEpisode || !mainItemId) return;
    if (mainItemId === pinnedEpisodeId) return;          // 이미 동기화됨
    if (mainItemId === unpinnedFromEpisodeId) return;    // 직전에 X 로 해제한 그 원고 — 자동 재pin 차단
    setPinnedEpisodeId(mainItemId);                      // 사이드바 선택 → 즉시 카드 대상 전환
  }, [isEpisode, mainItemId, pinnedEpisodeId, unpinnedFromEpisodeId, setPinnedEpisodeId]);

  // 쿼리 대상 = pin된 episode (없으면 빈 결과)
  const queryEpisodeId = pinnedEpisodeId;
  const { data: episodeRows = [] } = useQuery<EpisodeInfo>(
    queryEpisodeId
      ? `SELECT id, title, content, work_id, sort_order FROM episode WHERE id = ?`
      : `SELECT '' as id, '' as title, null as content, '' as work_id, 0 as sort_order WHERE 0`,
    queryEpisodeId ? [queryEpisodeId] : [],
  );
  const rawPinnedEpisode = episodeRows[0] ?? null;

  // AI 호출 시 본문은 반드시 평문이어야 한다 (LLM은 v1: 암호문을 못 읽음).
  // useDecryptedEpisode가 KEK + work_key로 복호화한 title/content를 반환하므로,
  // rawPinnedEpisode (PowerSync 원시값) 대신 이 값을 사용한다. title도 v1: ciphertext일 수 있음.
  const decryptedEpisodeId = pinnedEpisodeId ?? '';
  const { data: decryptedEpisode } = useDecryptedEpisode(decryptedEpisodeId);
  const decryptedContent = decryptedEpisode?.content ?? null;
  const decryptStatus = decryptedEpisode?.decryptStatus;
  const pinnedEpisode: EpisodeInfo | null = rawPinnedEpisode
    ? {
        ...rawPinnedEpisode,
        title: decryptedEpisode?.title ?? '',
        content: decryptedContent,
      }
    : null;
  // 등록된 원고가 있는지 (UI 표시 분기) — pin id는 있지만 DB에서 사라진 케이스 가드
  const hasPinned = !!rawPinnedEpisode;

  // PR5 — AI 서버는 더 이상 v1: 암호문 컬럼을 직접 SELECT하지 않는다.
  // 클라이언트가 KEK + work_key로 평문화한 RAG 컨텍스트를 호출 직전 조립해
  // 페이로드로 동봉한다. 페이로드는 AI 서버 메모리에서만 사용되며 영속화/로깅되지 않는다.
  const aiContextWorkId = pinnedEpisode?.work_id ?? null;
  const aiContextEpisodeNum = (pinnedEpisode?.sort_order ?? 0) + 1;
  const {
    payload: aiContextPayload,
    isLoading: aiContextLoading,
    hasUndecrypted: aiContextHasUndecrypted,
  } = useAiContextPayload(aiContextWorkId, aiContextEpisodeNum);

  const screen = useAiSessionStore((s) => s.screen);
  const draftState = useAiSessionStore((s) => s.draftState);
  const draftResult = useAiSessionStore((s) => s.draftResult);
  const draftError = useAiSessionStore((s) => s.draftError);
  const storyline = useAiSessionStore((s) => s.storyline);
  const userPrompt = useAiSessionStore((s) => s.userPrompt);
  const model = useAiSessionStore((s) => s.model);
  const targetEpisode = useAiSessionStore((s) => s.targetEpisode);
  const isStreaming = useAiSessionStore((s) => s.isStreaming);

  const setScreen = useAiSessionStore((s) => s.setScreen);
  const setStoryline = useAiSessionStore((s) => s.setStoryline);
  const setUserPrompt = useAiSessionStore((s) => s.setUserPrompt);
  const setModel = useAiSessionStore((s) => s.setModel);
  const startGeneration = useAiSessionStore((s) => s.startGeneration);
  const appendChunk = useAiSessionStore((s) => s.appendChunk);
  const finishGeneration = useAiSessionStore((s) => s.finishGeneration);
  const failGeneration = useAiSessionStore((s) => s.failGeneration);
  const stopGeneration = useAiSessionStore((s) => s.stopGeneration);
  const setAbort = useAiSessionStore((s) => s.setAbort);

  const refreshWalletAfterUsage = useWalletStore((s) => s.refreshAfterUsage);

  // Phase 7: handleGenerate (legacy /ai/drafts SSE streaming → 본문 직접 적용) 제거됨.
  // 모든 생성형 작업은 CreateInputScreen → agent thread (auto) 흐름으로 통합되었으며,
  // 결과는 extraction_suggestion 큐로 적재 후 사용자가 [적용]/[거절] 결정.

  // Phase 7: legacy review state actions 제거됨.
  // 검수는 handleReview 가 agent thread (consistency_check) 호출 + create-streaming 결과 표시.
  const startSpellcheck = useAiSessionStore((s) => s.startSpellcheck);
  const finishSpellcheck = useAiSessionStore((s) => s.finishSpellcheck);
  const failSpellcheck = useAiSessionStore((s) => s.failSpellcheck);

  // 원고 검수 — agent thread (consistency_check) 1회 실행. 좌측 사이드바에서 선택한 단일 회차
  // (pinnedEpisode) + focus prompt 자동 조립. 맞춤법/요약 카드와 동일한 진입 패턴 (UI 통일성).
  // 결과는 propose_review_issue + spelling_batch 큐로 적재 → create-streaming 화면이 인라인 검토.
  const reviewFocusPrompt = useAiSessionStore((s) => s.reviewFocusPrompt);
  const startCreateAction = useAiSessionStore((s) => s.startCreate);
  const failCreateAction = useAiSessionStore((s) => s.failCreate);
  const createState = useAiSessionStore((s) => s.createState);

  const handleReview = useCallback(async () => {
    if (!selectedWorkId || !pinnedEpisode) return;
    // ★ 더블 클릭 / 동시 호출 가드 — 진행 중 stream 이 있으면 무시. 없으면 두 번째 호출이 첫 번째
    //   thread 의 setPendingFirstPrompt 를 덮어써 첫 SSE 가 prompt 없이 무한 대기.
    if (createState === 'streaming') return;
    // 검수 prompt 자동 조립 — 단일 회차 + 중점 사항.
    const targetLabel = pinnedEpisode.title?.trim() || '(제목 없음)';
    const focusBlock = reviewFocusPrompt.trim()
      ? `\n중점 사항: ${reviewFocusPrompt.trim()}`
      : '';
    const fullPrompt =
      `[검수 대상] ${targetLabel}\n` +
      `해당 회차의 본문/요약을 살펴 의미 모순(인물·복선·시간선·설정)과 맞춤법 오류를 함께 점검해줘.${focusBlock}`;

    void analytics.track('ai_review_requested', {
      doc_type: 'episode',
      char_count_bucket: charCountBucket(1000),
    });

    try {
      const r = await (await import('../../../../api/agent')).createAgentThread(
        selectedWorkId,
        'consistency_check',
      );
      const tid = r?.thread_id;
      if (!tid) throw new Error('thread_id 누락');
      // create-streaming 화면이 takePendingFirstPrompt 로 SSE 시작 — 같은 인프라 재사용.
      // origin='review-input' 명시 — '다시 만들기' / breadcrumb 가 검수 화면으로 정확히 라우팅.
      startCreateAction(tid, 'review-input');
      setPendingFirstPrompt(tid, fullPrompt);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      failCreateAction(`검수 시작 실패: ${msg}`);
      const display = msg.startsWith(INSUFFICIENT_CREDITS_PREFIX)
        ? msg.slice(INSUFFICIENT_CREDITS_PREFIX.length)
        : msg;
      toast.error('검수 시작 실패', { description: display });
      void analytics.track('ai_review_failed', {
        doc_type: 'episode',
        reason_code: e instanceof ApiError ? String(e.status) : 'unknown',
      });
    }
  }, [selectedWorkId, pinnedEpisode, reviewFocusPrompt, startCreateAction, failCreateAction, createState]);

  const handleSpellcheck = useCallback(async (mode: 'episode' | 'selection' = 'episode') => {
    if (!pinnedEpisode) return;
    if (!decryptedContent || (decryptStatus !== 'plain' && decryptStatus !== 'decrypted')) {
      toast.error('본문을 불러오지 못했습니다', {
        description: decryptStatus === 'no-kek'
          ? '복호화 정보가 없어 본문을 복호화할 수 없습니다. 다시 로그인한 뒤 시도해주세요.'
          : '본문 복호화가 끝난 뒤 다시 시도해주세요.',
      });
      return;
    }
    if (aiContextLoading || !aiContextPayload) {
      toast.error('AI 컨텍스트 준비 중', {
        description: '본문과 설정 정보 준비가 끝난 뒤 다시 시도해주세요.',
      });
      return;
    }
    if (aiContextHasUndecrypted) {
      toast.error('복호화된 자료를 준비하지 못했습니다', {
        description: '다시 로그인하거나 작품을 다시 불러온 뒤 시도해주세요.',
      });
      return;
    }

    // 선택 영역 모드: 등록된 에디터에서 현재 선택을 추출
    let selectionRange: { from: number; to: number } | null = null;
    let contentToSend: string = decryptedContent;
    if (mode === 'selection') {
      const editor = getRegisteredEditor(pinnedEpisode.id);
      if (!editor) {
        toast.error('본문 에디터가 열려 있지 않습니다', {
          description: '대상 회차를 본문에 열고 영역을 선택한 뒤 시도해주세요.',
        });
        return;
      }
      const sel = editor.state.selection;
      if (sel.empty) {
        toast.error('선택된 영역이 없습니다', {
          description: '본문에서 검사할 텍스트를 드래그로 선택해주세요.',
        });
        return;
      }
      // PM doc 위치 → 평문(블록 사이 \n)으로 추출. spellcheck.py 의 plain text 폴백 경로가 처리.
      const selectedText = editor.state.doc.textBetween(sel.from, sel.to, '\n', '\n');
      if (!selectedText.trim()) {
        toast.error('선택된 영역에 텍스트가 없습니다');
        return;
      }
      selectionRange = { from: sel.from, to: sel.to };
      contentToSend = selectedText;
    }

    const episode: import('../../../../stores/aiSessionStore').DraftEpisodeInfo = {
      id: pinnedEpisode.id,
      workId: pinnedEpisode.work_id,
      title: pinnedEpisode.title,
      sortOrder: pinnedEpisode.sort_order,
    };

    startSpellcheck(episode, selectionRange);

    try {
      // 카드 모드 = 큐 적재 통합 endpoint (/ai/quick/spellcheck) — issues + suggestion_id 반환.
      // suggestion_id 가 있으면 SuggestionInbox / 카드 인라인 표시에서 [적용]/[거절] 가능.
      // 응답 필드는 기존 SpellcheckResult 와 호환 (issues, summary, usage). suggestion_id 는 부가.
      const data = await apiClient.post<
        import('../../../../stores/aiSessionStore').SpellcheckResult & {
          suggestion_id?: string | null;
          suggestion_error?: string;
        }
      >('/ai/quick/spellcheck', {
        workId: episode.workId,
        episodeId: episode.id,
        content: contentToSend,
        context: aiContextPayload,
      });
      const spellcheckResult = data ?? { issues: [], summary: '맞춤법 검사가 완료되었습니다.' };
      finishSpellcheck(spellcheckResult);
      refreshWalletAfterUsage();
      // 큐 적재 알림 — 0건이면 무관, 적재 실패 시 inline UI 만 사용.
      if (data?.suggestion_id) {
        toast.success(`맞춤법 ${spellcheckResult.issues.length}건 발견`, {
          description: '작업물 탭의 [작업 보관함] 에서 묶음 적용도 가능합니다.',
        });
      } else if (data?.suggestion_error) {
        toast.warning('큐 적재 실패 — 인라인 적용은 정상 동작', {
          description: data.suggestion_error,
        });
      }
    } catch (err) {
      const message = describeAiError(err, 'AI 서버 오류가 발생했습니다.');
      failSpellcheck(message);
      refreshWalletAfterUsage();
      const display = message.startsWith(INSUFFICIENT_CREDITS_PREFIX)
        ? message.slice(INSUFFICIENT_CREDITS_PREFIX.length)
        : message;
      toast.error('맞춤법 검사 실패', { description: display });
    }
  }, [pinnedEpisode, decryptedContent, decryptStatus, aiContextPayload, aiContextLoading, aiContextHasUndecrypted, startSpellcheck, finishSpellcheck, failSpellcheck, refreshWalletAfterUsage]);

  // 회차 요약 생성 — Sonnet 우회, AI 측이 본문 직접 fetch (decrypt 검사 불필요).
  const startSummarize = useAiSessionStore((s) => s.startSummarize);
  const finishSummarize = useAiSessionStore((s) => s.finishSummarize);
  const failSummarize = useAiSessionStore((s) => s.failSummarize);

  const handleSummarize = useCallback(async () => {
    if (!pinnedEpisode) return;
    const episode: import('../../../../stores/aiSessionStore').DraftEpisodeInfo = {
      id: pinnedEpisode.id,
      workId: pinnedEpisode.work_id,
      title: pinnedEpisode.title,
      sortOrder: pinnedEpisode.sort_order,
    };

    startSummarize(episode);

    try {
      const data = await apiClient.post<import('../../../../stores/aiSessionStore').SummarizeResult>(
        '/ai/quick/summarize',
        {
          workId: episode.workId,
          sortOrder: episode.sortOrder,
          forceRegenerate: false,
        },
      );
      if (!data) {
        throw new Error('빈 응답');
      }
      finishSummarize(data);
      refreshWalletAfterUsage();
    } catch (err) {
      const message = describeAiError(err, 'AI 서버 오류가 발생했습니다.');
      failSummarize(message);
      refreshWalletAfterUsage();
      const display = message.startsWith(INSUFFICIENT_CREDITS_PREFIX)
        ? message.slice(INSUFFICIENT_CREDITS_PREFIX.length)
        : message;
      toast.error('회차 요약 생성 실패', { description: display });
    }
  }, [pinnedEpisode, startSummarize, finishSummarize, failSummarize, refreshWalletAfterUsage]);

  // Phase 7: legacy 직접 streaming/직접 review 흐름 라우팅 제거됨.
  // (draft-input/draft-view/history-view/review-result/review-history-view 화면들은 도달 불가)
  // 모든 생성형 작업은 create-input → create-streaming 으로, 검수는 review-input → create-streaming 으로.

  if (screen === 'review-input') {
    return (
      <ReviewInputScreen
        episode={pinnedEpisode}
        hasPinned={hasPinned}
        canRegisterCurrent={isEpisode && !!mainItemId && mainItemId !== pinnedEpisodeId}
        onClearPinned={clearPinnedEpisodeId}
        onRegisterCurrent={() => {
          if (mainItemId) setPinnedEpisodeId(mainItemId);
        }}
        selectedWorkId={selectedWorkId}
        onStartReview={handleReview}
        onBack={() => setScreen('menu')}
      />
    );
  }

  // 메뉴 화면
  const ineligibleReason = !isOnline
    ? '오프라인 상태입니다. 네트워크에 연결한 뒤 사용해주세요.'
    : isGuest
      ? '게스트 모드에서는 AI 기능을 사용할 수 없습니다. 로그인 후 이용해주세요.'
      : !isAuthenticated
        ? '로그인이 필요합니다.'
        : null;

  return (
    <>
      {ineligibleReason && (
        <div className="shrink-0 border-b border-border/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
          ⚠ {ineligibleReason}
        </div>
      )}
      {/* Agent 토글은 RightPanelHeader 로 이동. 작업물(제안 큐) 은 우측 패널의 'inbox' 탭으로 별도 분리. */}
      {aiEligible && agentMode && selectedWorkId && (
        <AgentChatPanel workId={selectedWorkId} />
      )}
      {aiEligible && !agentMode && (
        <>
      {screen === 'spellcheck-history-view' && (
        <SpellcheckResultScreen
          onBack={() => setScreen('spellcheck-input')}
          isHistoryView
        />
      )}
      {screen === 'spellcheck-result' && (
        <SpellcheckResultScreen
          onBack={() => setScreen('spellcheck-input')}
        />
      )}
      {screen === 'create-input' && (
        <CreateInputScreen
          selectedWorkId={selectedWorkId}
        />
      )}
      {screen === 'create-streaming' && (
        <CreateStreamingScreen />
      )}
      {screen === 'summarize-history-view' && (
        <SummarizeResultScreen
          onBack={() => setScreen('summarize-input')}
          isHistoryView
        />
      )}
      {screen === 'summarize-result' && (
        <SummarizeResultScreen
          onBack={() => setScreen('summarize-input')}
        />
      )}
      {screen === 'summarize-input' && (
        <SummarizeInputScreen
          episode={pinnedEpisode}
          hasPinned={hasPinned}
          canRegisterCurrent={isEpisode && !!mainItemId && mainItemId !== pinnedEpisodeId}
          onClearPinned={clearPinnedEpisodeId}
          onRegisterCurrent={() => {
            if (mainItemId) setPinnedEpisodeId(mainItemId);
          }}
          selectedWorkId={selectedWorkId}
          onStartSummarize={handleSummarize}
        />
      )}
      {screen === 'spellcheck-input' && (
        <SpellcheckInputScreen
          episode={pinnedEpisode}
          hasPinned={hasPinned}
          canRegisterCurrent={isEpisode && !!mainItemId && mainItemId !== pinnedEpisodeId}
          onClearPinned={clearPinnedEpisodeId}
          onRegisterCurrent={() => {
            if (mainItemId) setPinnedEpisodeId(mainItemId);
          }}
          selectedWorkId={selectedWorkId}
          onStartSpellcheck={handleSpellcheck}
        />
      )}
      {screen === 'menu' && (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <button
        type="button"
        onClick={() => setScreen('create-input')}
        className="flex min-h-[5.5rem] items-start gap-3 rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-ring hover:bg-accent/30"
      >
        <PenSquare size={20} className="mt-0.5 shrink-0 text-primary" strokeWidth={1.5} />
        <div>
          <p className="text-sm font-medium text-foreground">문서 생성</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            회차 초안·인물·세계관·플롯 등 원하는 문서를 자유 프롬프트로 생성합니다.
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={() => setScreen('review-input')}
        className="flex min-h-[5.5rem] items-start gap-3 rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-ring hover:bg-accent/30"
      >
        <SearchCheck size={20} className="mt-0.5 shrink-0 text-primary" strokeWidth={1.5} />
        <div>
          <p className="text-sm font-medium text-foreground">원고 검수</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            설정집과 이전 맥락을 대조하여 모순·복선·시간선 등 의미 오류를 검출합니다.
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={() => setScreen('spellcheck-input')}
        className="flex min-h-[5.5rem] items-start gap-3 rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-ring hover:bg-accent/30"
      >
        <SpellCheck size={20} className="mt-0.5 shrink-0 text-primary" strokeWidth={1.5} />
        <div>
          <p className="text-sm font-medium text-foreground">맞춤법 검사</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            맞춤법, 띄어쓰기, 오탈자, 문장부호만 따로 확인합니다.
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={() => setScreen('summarize-input')}
        className="flex min-h-[5.5rem] items-start gap-3 rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-ring hover:bg-accent/30"
      >
        <ScrollText size={20} className="mt-0.5 shrink-0 text-primary" strokeWidth={1.5} />
        <div>
          <p className="text-sm font-medium text-foreground">회차 요약 생성</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            회차 본문에서 한 줄 요약·등장인물·핵심 사건·복선 등 12개 항목을 자동 추출합니다.
          </p>
        </div>
      </button>
    </div>
      )}
        </>
      )}
    </>
  );
}

/* ── AI 대상 원고 박스 (초안/검수 공통) ── */
