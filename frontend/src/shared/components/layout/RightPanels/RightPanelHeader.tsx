import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { useAiSessionStore, getAiToolName } from '../../../stores/aiSessionStore';
import { useReviewHighlightStore } from '../../../stores/reviewHighlightStore';
import { useAuthStore } from '../../../stores/authStore';
import { useAgentChatStore } from '../../../stores/agentChatStore';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import { useReviewHighlightAutoCleanup } from '../../../hooks/useReviewHighlightAutoCleanup';
import { RIGHT_TAB_HELP } from '../../../constants/tabHelpContent';
import { FloatingHelpCard } from '../../ui/FloatingHelpCard';
import { TABS } from './tabs';
import type { RightPanelTab } from '../../../types/workspace';
import { cn } from '../../../lib/cn';

/**
 * 우측 패널 상단 공통 헤더.
 * - 활성 탭 라벨 표시
 * - AI 탭 + sub-screen 진입 시 `AI 도구 > <도구명>` breadcrumb + 뒤로가기 버튼 통합
 *   (sub-screen 자체 헤더는 제거되어 공간 낭비/이중 라인 해소)
 * - DraftView 스트리밍 중에는 뒤로가기 차단 — 사용자는 액션바의 "중단" 버튼으로 명시 abort 후 이동
 * - Review 결과 화면에서 뒤로 갈 때는 메인 에디터 하이라이트도 함께 정리
 */
export function RightPanelHeader({
  activeTab,
  selectedWorkId,
}: {
  activeTab: RightPanelTab;
  selectedWorkId: string | null;
}) {
  // Review/Spelling 본문 하이라이트 자동 해제 — 탭 전환/메뉴 복귀/회차 변경 감지.
  useReviewHighlightAutoCleanup(activeTab);

  const aiScreen = useAiSessionStore((s) => s.screen);
  const aiIsStreaming = useAiSessionStore((s) => s.isStreaming);
  const setScreen = useAiSessionStore((s) => s.setScreen);
  const tabLabel = TABS.find((t) => t.key === activeTab)?.label ?? '';

  // ── 우측 탭별 컨텍스트 도움말 (좌측 SecondarySidebar 의 패턴 동일) ──
  const tabHelp = RIGHT_TAB_HELP[activeTab];
  const [helpOpen, setHelpOpen] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!tabHelp) {
      setHelpOpen(false);
      return;
    }
    const key = `folio.rightTabHelp.${activeTab}.shown`;
    if (localStorage.getItem(key)) {
      setHelpOpen(false);
      return;
    }
    setHelpOpen(true);
    localStorage.setItem(key, 'true');
  }, [activeTab, tabHelp]);

  // Agent 토글 / 섹션 — AI 탭 + 작품 선택 시 헤더에 노출
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isGuest = useAuthStore((s) => s.isGuest);
  const isOnline = useNetworkStatus();
  const aiEligible = isAuthenticated && !isGuest && isOnline;
  const agentMode = useAgentChatStore((s) =>
    selectedWorkId ? s.agentModeByWork[selectedWorkId] ?? false : false,
  );
  const setAgentMode = useAgentChatStore((s) => s.setAgentMode);

  const showAgentControls =
    activeTab === 'ai' && aiEligible && !!selectedWorkId && aiScreen === 'menu';

  // AI 탭 + sub-screen인 경우만 breadcrumb 노출.
  // create-streaming 은 4개 도구(문서생성/검수/맞춤법/요약)가 공유하는 인프라 — origin 화면의
  // 도구명을 표시해야 사용자가 어떤 도구를 쓰고 있는지 정확히 인지한다.
  const aiOriginScreen = useAiSessionStore((s) => s.createOriginScreen);
  const breadcrumbScreen =
    aiScreen === 'create-streaming' && aiOriginScreen ? aiOriginScreen : aiScreen;
  const subToolName = activeTab === 'ai' ? getAiToolName(breadcrumbScreen) : null;
  // DraftViewScreen 스트리밍 중에는 뒤로가기 차단
  const allowBack = !(activeTab === 'ai' && aiScreen === 'draft-view' && aiIsStreaming);

  const handleBack = () => {
    // Review 화면에서 메뉴로 돌아갈 때 메인 에디터 하이라이트 정리
    if (
      activeTab === 'ai' &&
      (aiScreen === 'review-result' || aiScreen === 'review-history-view')
    ) {
      useReviewHighlightStore.getState().clearIssues();
    }
    setScreen('menu');
  };

  // Agent 모드 ON 일 때 헤더 좌측 텍스트가 'AI 도구' → '채팅 모드' 로 전환
  const headerLabel =
    activeTab === 'ai' && showAgentControls && agentMode ? '채팅 모드' : tabLabel;

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
      {subToolName && allowBack && (
        <button
          type="button"
          onClick={handleBack}
          aria-label="AI 도구 메뉴로 돌아가기"
          title="AI 도구 메뉴로 돌아가기"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
        </button>
      )}
      <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-sidebar-foreground">
        <span className={subToolName ? 'shrink-0 text-muted-foreground' : ''}>
          {headerLabel}
        </span>
        {subToolName && (
          <>
            <ChevronRight
              size={12}
              strokeWidth={1.75}
              className="shrink-0 text-muted-foreground"
            />
            <span className="truncate">{subToolName}</span>
          </>
        )}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {showAgentControls && (
          <button
            type="button"
            role="switch"
            aria-checked={agentMode}
            onClick={() =>
              selectedWorkId && setAgentMode(selectedWorkId, !agentMode)
            }
            className={cn(
              'flex h-6 items-center gap-1.5 rounded-full border border-border px-1.5 transition-colors',
              agentMode ? 'bg-primary/15' : 'bg-background',
            )}
            title={agentMode ? '채팅 모드 ON — 클릭하여 OFF' : '채팅 모드 OFF — 클릭하여 ON'}
          >
            <span
              className={cn(
                'text-[11px] font-medium',
                agentMode ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              채팅
            </span>
            <span
              className={cn(
                'relative inline-flex h-3.5 w-7 shrink-0 rounded-full transition-colors',
                agentMode ? 'bg-primary' : 'bg-muted-foreground/30',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-transform',
                  agentMode ? 'translate-x-3.5' : 'translate-x-0.5',
                )}
              />
            </span>
          </button>
        )}
        {tabHelp && (
          <button
            ref={helpButtonRef}
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            aria-label="이 탭 도움말"
            aria-pressed={helpOpen}
            title={helpOpen ? '도움말 닫기' : '이 탭 도움말'}
            className={cn(
              'rounded p-1 transition-colors',
              helpOpen
                ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )}
          >
            <HelpCircle size={14} strokeWidth={2} />
          </button>
        )}
      </div>
      {tabHelp && (
        <FloatingHelpCard
          open={helpOpen}
          title={tabHelp.title}
          steps={tabHelp.steps}
          onClose={() => setHelpOpen(false)}
          persistKey="folio.rightTabHelp.position.v1"
          originRef={helpButtonRef}
        />
      )}
    </div>
  );
}
