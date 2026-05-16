// ============================================================
// 우측 사이드 패널 — 4개 탭 컨테이너
// ============================================================
// 본 파일은 컨테이너만. 각 탭의 구현은 ./RightPanels/ 아래 분리.
//
//   ./RightPanels/RightPanelHeader.tsx — 헤더 + AI 도구 breadcrumb + 도움말 ?
//   ./RightPanels/tabs.ts              — TABS 메타 (icon/label) 공유
//   ./RightPanels/DocsTab.tsx          — 문서 뷰어 (드래그·핀)
//   ./RightPanels/IdeaTab.tsx          — 아이디어 (List/Detail)
//   ./RightPanels/AiTab.tsx            — AI 도구 (생성/검수/맞춤법/요약/스트리밍)
//   ./RightPanels/errors.tsx           — AiErrorBlock + INSUFFICIENT_CREDITS 처리
//
// 분할 이력: 2026-05-11 — 단일 3785줄 파일을 5개로 분리 (이전 git history 참고).
// ============================================================

import { Tooltip } from '../ui/Tooltip';
import { ResizeHandle } from './ResizeHandle';
import { SuggestionInbox } from '../../features/agent/SuggestionInbox';
import { useAuthStore } from '../../stores/authStore';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import type { AuxPanelItem, RightPanelTab, MainDoc } from '../../types/workspace';
import { cn } from '../../lib/cn';

import { TABS } from './RightPanels/tabs';
import { RightPanelHeader } from './RightPanels/RightPanelHeader';
import { DocsTabContent } from './RightPanels/DocsTab';
import { IdeaTabContent } from './RightPanels/IdeaTab';
import { AiTabContent } from './RightPanels/AiTab';

interface RightPanelsProps {
  width: number;
  onWidthChange: (delta: number) => void;
  panels: AuxPanelItem[];
  onAddPanel: (item: Omit<AuxPanelItem, 'id' | 'collapsed'>, index?: number) => void;
  onRemovePanel: (panelId: string) => void;
  onReorderPanels: (reordered: AuxPanelItem[]) => void;
  onToggleCollapse: (panelId: string) => void;
  onOpenInMain: (panel: AuxPanelItem) => void;
  isDraggingDoc: boolean;
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  selectedWorkId: string | null;
  /** 메인 패널 문서 — lockedReadOnly 판정 + AI 탭 컨텍스트 */
  mainDoc: MainDoc | null;
}

export function RightPanels({
  width,
  onWidthChange,
  panels,
  onAddPanel,
  onRemovePanel,
  onReorderPanels,
  onToggleCollapse,
  onOpenInMain,
  isDraggingDoc,
  activeTab,
  onTabChange,
  selectedWorkId,
  mainDoc,
}: RightPanelsProps) {
  // mainDoc 객체에서 sub 필드 분리 — AI 탭 컨텍스트 + isSameAsMain 시각 표시 용도
  const mainSection = mainDoc?.section ?? null;
  const mainItemId = mainDoc?.itemId ?? null;
  return (
    <div
      style={{ width }}
      className="relative flex shrink-0 flex-col overflow-hidden border-l border-sidebar-border bg-sidebar"
    >
      <ResizeHandle
        side="left"
        onResize={onWidthChange}
        ariaLabel="우측 패널 너비 조절"
      />

      {/* 상단 헤더 — 활성 탭 라벨 + AI sub-screen breadcrumb. 도구 sub-screen 자체 헤더는 제거됨.
          AI 탭 + 작품 선택 시 Agent 토글 / 채팅·작업물 segmented 도 본 헤더에 통합. */}
      <RightPanelHeader activeTab={activeTab} selectedWorkId={selectedWorkId} />

      {/* 아이콘 탭 행 — 메인 헤더(h-10)와 좌측 검색창 영역과 동일 높이 */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-sidebar-border/50 px-3">
        {TABS.map(({ key, icon: Icon, label }) => (
          <Tooltip key={key} side="bottom" content={label}>
            <button
              type="button"
              onClick={() => onTabChange(key)}
              aria-label={label}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                activeTab === key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
              )}
            >
              <Icon size={15} strokeWidth={1.75} />
            </button>
          </Tooltip>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="flex min-h-0 flex-1 flex-col">
        {activeTab === 'docs' && (
          <DocsTabContent
            panels={panels}
            onAddPanel={onAddPanel}
            onRemovePanel={onRemovePanel}
            onReorderPanels={onReorderPanels}
            onToggleCollapse={onToggleCollapse}
            onOpenInMain={onOpenInMain}
            isDraggingDoc={isDraggingDoc}
            mainSection={mainSection}
            mainItemId={mainItemId}
            selectedWorkId={selectedWorkId}
          />
        )}
        {activeTab === 'idea' && (
          <IdeaTabContent selectedWorkId={selectedWorkId} />
        )}
        {/* AI 탭은 스트리밍 중 탭 전환 시에도 언마운트되지 않도록 display:none 처리 */}
        <div className={cn('flex min-h-0 flex-1 flex-col', activeTab !== 'ai' && 'hidden')}>
          <AiTabContent
            selectedWorkId={selectedWorkId}
            mainSection={mainSection}
            mainItemId={mainItemId}
          />
        </div>
        {activeTab === 'inbox' && <InboxTabContent selectedWorkId={selectedWorkId} />}
      </div>
    </div>
  );
}

/**
 * 작업물 탭 — Agent 가 만든 변경 제안 (suggestion) 큐.
 * 인증·온라인 가드 후 SuggestionInbox 를 그대로 렌더한다.
 * 본 컴포넌트는 다른 곳에서 안 쓰이므로 본 파일에 그대로 둔다 (40줄 미만).
 */
function InboxTabContent({ selectedWorkId }: { selectedWorkId: string | null }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isGuest = useAuthStore((s) => s.isGuest);
  const isOnline = useNetworkStatus();
  if (!isOnline) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
        오프라인 상태에서는 작업물 큐를 사용할 수 없습니다.
      </div>
    );
  }
  if (isGuest) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
        게스트 모드에서는 작업물 큐를 사용할 수 없습니다. 로그인 후 이용해주세요.
      </div>
    );
  }
  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
        로그인이 필요합니다.
      </div>
    );
  }
  return <SuggestionInbox workId={selectedWorkId} />;
}
