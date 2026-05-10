import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Typography from '@tiptap/extension-typography';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import {
  AlertTriangle,
  ArrowDownAZ,
  ArrowLeft,
  ArrowUpDown,
  BotMessageSquare,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ArrowUpRight,
  ClipboardCopy,
  Clock,
  FileStack,
  GripVertical,
  PanelsTopLeft,
  History,
  Info,
  HelpCircle,
  Lightbulb,
  ListChecks,
  Loader2,
  OctagonAlert,
  PenSquare,
  ScrollText,
  Search,
  SearchCheck,
  Send,
  SpellCheck,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ResizeHandle } from './ResizeHandle';
import { AuxDocViewer } from './AuxDocViewer';
import { BreadcrumbTitle } from './BreadcrumbTitle';
import { ContentEditor } from '../editor/ContentEditor';
import { Select } from '../ui/Select';
import { Popover } from '../ui/Popover';
import { DeleteConfirmDialog } from '../ui/DeleteConfirmDialog';
import { FloatingHelpCard } from '../ui/FloatingHelpCard';
import { Tooltip } from '../ui/Tooltip';
import { RIGHT_TAB_HELP } from '../../constants/tabHelpContent';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../ui/context-menu';
import { Skeleton } from '../ui/Skeleton';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useProgressMessage, type ProgressStage } from '../../hooks/useProgressMessage';
import { useWriterId } from '../../hooks/useWriterId';
import { useDecryptedEpisode } from '../../hooks/useDecryptedEpisode';
import { useDecryptedIdeaArchiveList } from '../../hooks/useDecryptedIdeaArchive';
import { useAiContextPayload } from '../../hooks/useAiContextPayload';
import { apiClient, ApiError } from '../../lib/apiClient';
import { getRegisteredEditor } from '../../lib/activeEditorRegistry';
import { analytics, charCountBucket, durationBucket } from '../../lib/analytics';
import { useNavigationStore } from '../../stores/navigationStore';
import { useAgentChatStore } from '../../stores/agentChatStore';
import { AgentChatPanel } from '../../features/agent/AgentChatPanel';
import { ChatMarkdown } from '../../features/agent/ChatMarkdown';
import {
  entityLabel,
  useDecryptedSuggestion,
} from '../../features/agent/suggestionPreview';
import { toolLabel } from '../../features/agent/toolLabels';
import type { AgentSuggestion } from '../../api/agent';
import { SuggestionInbox } from '../../features/agent/SuggestionInbox';
import { useAuthStore } from '../../stores/authStore';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

/**
 * 402(크레딧 부족) 에러를 다른 일반 에러와 구분하기 위한 sentinel 접두사.
 * 에러 표시 영역은 이 접두사가 붙은 메시지를 받으면 "결제로 이동" 버튼을 함께 렌더링한다.
 */
const INSUFFICIENT_CREDITS_PREFIX = '__INSUFFICIENT_CREDITS__:';
const INSUFFICIENT_CREDITS_MESSAGE =
  '크레딧이 부족합니다. 설정 → 결제에서 충전 후 다시 시도해주세요.';

function describeAiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 402) {
    return INSUFFICIENT_CREDITS_PREFIX + INSUFFICIENT_CREDITS_MESSAGE;
  }
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

function AiErrorBlock({ message }: { message: string }) {
  const openSettings = useNavigationStore((s) => s.openSettings);
  const isInsufficient = message.startsWith(INSUFFICIENT_CREDITS_PREFIX);
  const display = isInsufficient
    ? message.slice(INSUFFICIENT_CREDITS_PREFIX.length)
    : message;
  return (
    <div className="flex flex-col gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <span>{display}</span>
      {isInsufficient && (
        <button
          type="button"
          onClick={() => openSettings('payment')}
          className="self-start rounded-md bg-destructive px-2 py-1 text-[11px] font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
        >
          결제 화면으로 이동
        </button>
      )}
    </div>
  );
}
import { useAiSessionStore, getAiToolName } from '../../stores/aiSessionStore';
import { useReviewHighlightStore } from '../../stores/reviewHighlightStore';
import { useWalletStore } from '../../stores/walletStore';
import type { AuxPanelItem, AuxDocType, RightPanelTab, WorkspaceSection, MainDoc } from '../../types/workspace';
import { AUX_DOC_LABELS, currentDocToAuxItem } from '../../types/workspace';
import { TAG_LIST, TAG_COLOR, TAG_OPTIONS, TAG_DOT_COLOR } from '../../features/idea-archive/ideaConstants';
import { extractText, textToTiptap, timeAgo } from '../../features/idea-archive/ideaUtils';
import { cn } from '../../lib/cn';

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

const TABS: { key: RightPanelTab; icon: typeof FileStack; label: string }[] = [
  { key: 'docs', icon: PanelsTopLeft, label: '문서 뷰어' },
  { key: 'idea', icon: Lightbulb, label: '아이디어' },
  { key: 'ai', icon: BotMessageSquare, label: 'AI 도구' },
  { key: 'inbox', icon: ClipboardCopy, label: '작업물' },
];

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
        {activeTab === 'inbox' && <InboxTabContent />}
      </div>
    </div>
  );
}

/**
 * 작업물 탭 — Agent 가 만든 변경 제안 (suggestion) 큐.
 * 인증·온라인 가드 후 SuggestionInbox 를 그대로 렌더한다.
 */
function InboxTabContent() {
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
  return <SuggestionInbox />;
}

/* ── 우측 패널 공통 헤더 ── */

/**
 * 우측 패널 상단 공통 헤더.
 * - 활성 탭 라벨 표시
 * - AI 탭 + sub-screen 진입 시 `AI 도구 > <도구명>` breadcrumb + 뒤로가기 버튼 통합
 *   (sub-screen 자체 헤더는 제거되어 공간 낭비/이중 라인 해소)
 * - DraftView 스트리밍 중에는 뒤로가기 차단 — 사용자는 액션바의 "중단" 버튼으로 명시 abort 후 이동
 * - Review 결과 화면에서 뒤로 갈 때는 메인 에디터 하이라이트도 함께 정리
 */
function RightPanelHeader({
  activeTab,
  selectedWorkId,
}: {
  activeTab: RightPanelTab;
  selectedWorkId: string | null;
}) {
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

  // AI 탭 + sub-screen인 경우만 breadcrumb 노출
  const subToolName = activeTab === 'ai' ? getAiToolName(aiScreen) : null;
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

/* ── Docs 탭 (서브 스테이지 — 핀 슬롯) ── */

function DocsTabContent({
  panels,
  onAddPanel,
  onRemovePanel,
  onReorderPanels,
  onToggleCollapse,
  onOpenInMain,
  isDraggingDoc,
  mainSection,
  mainItemId,
  selectedWorkId,
}: {
  panels: AuxPanelItem[];
  onAddPanel: (item: Omit<AuxPanelItem, 'id' | 'collapsed'>, index?: number) => void;
  onRemovePanel: (panelId: string) => void;
  onReorderPanels: (reordered: AuxPanelItem[]) => void;
  onToggleCollapse: (panelId: string) => void;
  onOpenInMain: (panel: AuxPanelItem) => void;
  isDraggingDoc: boolean;
  mainSection: import('../../types/workspace').WorkspaceSection | null;
  mainItemId: string | null;
  selectedWorkId: string | null;
}) {
  void isDraggingDoc; // 부모 RightPanels에서 외부 dragOver 감지용
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 잠금 정책 폐지 — WorldNoteInlineEditor가 외부 변경을 자동 동기화하므로
  // 메인/우측 패널 어디든 같은 노드를 동시 표시 + 즉시 반영. 동시 타이핑 한계는 collaborative
  // 도입 전까지 수용.

  // dnd-kit cross-component drop — 트리 노드를 우측 사이드바로 끌어왔을 때
  const { setNodeRef: setAuxDropRef, isOver: isAuxOver } = useDroppable({
    id: 'aux-pinned-area',
    data: { type: 'aux-area' },
  });

  const calcDropIndex = (clientY: number): number => {
    if (!listRef.current) return panels.length;
    const children = listRef.current.querySelectorAll('[data-panel-id]');
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY < midY) return i;
    }
    return panels.length;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
    setDropIndex(panels.length > 0 ? calcDropIndex(e.clientY) : 0);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
    setDropIndex(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const idx = dropIndex ?? panels.length;
    setIsDragOver(false);
    setDropIndex(null);
    const raw = e.dataTransfer.getData('application/folio-doc');
    if (!raw) return;
    try {
      const { docType, docId, title } = JSON.parse(raw) as {
        docType: AuxDocType;
        docId: string;
        title: string;
      };
      onAddPanel({ docType, docId, title }, idx);
    } catch { /* invalid payload */ }
  };

  return (
    <div
      ref={setAuxDropRef}
      className={cn(
        'flex min-h-0 flex-1 flex-col',
        (isDragOver || isAuxOver) && 'bg-primary/5',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {panels.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <div className={cn(
            'rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors',
            (isDragOver || isAuxOver) ? 'border-primary bg-primary/10' : 'border-primary/30',
          )}>
            <p className="text-sm font-medium text-primary/70">여기에 문서를 놓으세요</p>
            <p className="mt-1 text-xs text-muted-foreground">
              더블 클릭 또는 드래그로 우측 핀 추가
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          <SortableContext
            items={panels.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <div ref={listRef} className="flex flex-col gap-1.5">
              {panels.map((panel, i) => (
                <div key={panel.id}>
                  {isDragOver && dropIndex === i && <DropIndicatorLine />}
                  <SortableAuxPanel
                    panel={panel}
                    onRemove={() => onRemovePanel(panel.id)}
                    onToggleCollapse={() => onToggleCollapse(panel.id)}
                    onOpenInMain={() => onOpenInMain(panel)}
                    onAddPanel={onAddPanel}
                    mainSection={mainSection}
                    mainItemId={mainItemId}
                    selectedWorkId={selectedWorkId}
                  />
                </div>
              ))}
              {isDragOver && dropIndex === panels.length && <DropIndicatorLine />}
            </div>
          </SortableContext>
        </div>
      )}
    </div>
  );
}

/* ── Idea 탭 ── */

function IdeaTabContent({ selectedWorkId }: { selectedWorkId: string | null }) {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    setView('list');
    setSelectedIdeaId(null);
    setActiveTag(null);
  }, [selectedWorkId]);

  if (!selectedWorkId) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        작품을 먼저 선택하세요.
      </div>
    );
  }

  if (view === 'detail' && selectedIdeaId) {
    return (
      <IdeaPanelDetail
        id={selectedIdeaId}
        onBack={() => {
          setView('list');
          setSelectedIdeaId(null);
        }}
      />
    );
  }

  return (
    <IdeaPanelList
      workId={selectedWorkId}
      activeTag={activeTag}
      onTagChange={setActiveTag}
      onSelect={(id) => {
        setSelectedIdeaId(id);
        setView('detail');
      }}
    />
  );
}

interface RawIdeaListRow {
  id: string;
  work_id: string;
  writer_id: string;
  content: string | null;
  tag: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  encrypted_dek: string | null;
}

interface IdeaRow {
  id: string;
  content: string;
  tag: string | null;
  created_at: string;
  updated_at: string;
}

/** 아이디어 카드 정렬 키 */
type IdeaSortKey = 'default' | 'alpha' | 'created' | 'updated';

const SORT_LABEL: Record<IdeaSortKey, string> = {
  default: '기본',
  alpha: '가나다',
  created: '생성순',
  updated: '최근 변경순',
};

function IdeaPanelList({
  workId,
  activeTag,
  onTagChange,
  onSelect,
}: {
  workId: string;
  activeTag: string | null;
  onTagChange: (tag: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const writerId = useWriterId();
  const { createIdea, deleteIdeaArchive, reorderItems } = useLocalWrite();
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [searchText, setSearchText] = useState('');
  const [sortKey, setSortKey] = useState<IdeaSortKey>('default');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // content/tag는 v1: 암호문 → useDecryptedIdeaArchiveList 거쳐야 한다.
  const { data: rawRows = [] } = useQuery<RawIdeaListRow>(
    `SELECT i.id, i.work_id, i.writer_id, i.content, i.tag, i.sort_order,
            i.created_at, i.updated_at,
            w.encrypted_dek AS encrypted_dek
     FROM idea_archive i
     LEFT JOIN work w ON w.id = i.work_id
     WHERE i.work_id = ? AND i.writer_id = ?
     ORDER BY i.sort_order ASC, i.created_at DESC`,
    [workId, writerId],
  );
  const { data: decryptedRows } = useDecryptedIdeaArchiveList(rawRows);
  const ideas: IdeaRow[] = useMemo(
    () =>
      decryptedRows.map((r) => ({
        id: r.id,
        content: r.content,
        tag: r.tag,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    [decryptedRows],
  );

  const filteredIdeas = useMemo(() => {
    let result = activeTag ? ideas.filter((i) => i.tag === activeTag) : ideas;
    const query = searchText.trim().toLowerCase();
    if (query) {
      result = result.filter((i) =>
        extractText(i.content).toLowerCase().includes(query),
      );
    }
    if (sortKey === 'alpha') {
      result = [...result].sort((a, b) =>
        extractText(a.content).localeCompare(extractText(b.content), 'ko'),
      );
    } else if (sortKey === 'created') {
      // 최근 생성이 위로 — created_at DESC
      result = [...result].sort((a, b) =>
        (b.created_at ?? '').localeCompare(a.created_at ?? ''),
      );
    } else if (sortKey === 'updated') {
      // 최근 변경이 위로 — updated_at DESC
      result = [...result].sort((a, b) =>
        (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
      );
    }
    // 'default' 는 SQL 기본 (sort_order ASC, created_at DESC) 그대로
    return result;
  }, [ideas, activeTag, searchText, sortKey]);

  const handleSubmit = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    const content = textToTiptap(trimmed);
    await createIdea(workId, content, activeTag, ideas.length);
    setInputText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  // 기본 정렬 (sort_order ASC) 기준으로 이웃과 swap → 전체 reindex 로 일관성 보장.
  const handleMove = async (id: string, delta: -1 | 1) => {
    const idx = ideas.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= ideas.length) return;
    const reordered = [...ideas];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(target, 0, moved);
    await reorderItems(
      'idea_archive',
      reordered.map((it, i) => ({ id: it.id, sortOrder: i * 1000 })),
    );
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 태그 필터 바 */}
      <div className="shrink-0 border-b border-border/50 px-2 py-1.5">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
              activeTag === null
                ? 'bg-foreground/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => onTagChange(null)}
          >
            전체
          </button>
          {TAG_LIST.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                activeTag === tag
                  ? TAG_COLOR[tag]
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => onTagChange(activeTag === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* 리스트 검색 + 정렬 — 입력창 위에 위치 (필터 컨트롤이 작성 도구보다 먼저 노출) */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-2 py-1.5">
        <div className="relative min-w-0 flex-1">
          <Search
            size={12}
            strokeWidth={2}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.currentTarget.value)}
            placeholder="아이디어 검색"
            className="h-7 w-full rounded-md border border-border bg-background pl-6 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <Popover
          align="end"
          width={150}
          trigger={
            <button
              type="button"
              title={`정렬: ${SORT_LABEL[sortKey]}`}
              aria-label="아이디어 정렬"
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background transition-colors hover:bg-accent hover:text-foreground',
                sortKey === 'default'
                  ? 'text-muted-foreground'
                  : 'text-primary',
              )}
            >
              {sortKey === 'alpha' ? (
                <ArrowDownAZ size={13} strokeWidth={1.75} />
              ) : (
                <ArrowUpDown size={13} strokeWidth={1.75} />
              )}
            </button>
          }
        >
          {(close) => (
            <div className="flex flex-col">
              {(Object.keys(SORT_LABEL) as IdeaSortKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSortKey(key);
                    close();
                  }}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
                    sortKey === key && 'text-primary',
                  )}
                >
                  <span>{SORT_LABEL[key]}</span>
                  {sortKey === key && <Check size={12} strokeWidth={2} />}
                </button>
              ))}
            </div>
          )}
        </Popover>
      </div>

      {/* 인라인 생성 입력 */}
      <div className="shrink-0 border-b border-border px-2 py-2">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeTag
                ? `"${activeTag}" 아이디어… (Enter)`
                : '아이디어 메모… (Enter)'
            }
            rows={3}
            className="min-h-20 w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 pr-8 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!inputText.trim()}
            className="absolute bottom-2 right-2 rounded p-0.5 text-muted-foreground transition-colors hover:text-primary disabled:opacity-30"
            title="등록 (Enter)"
          >
            <Send size={13} />
          </button>
        </div>
      </div>

      {/* 카드 리스트 */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredIdeas.length === 0 ? (
          ideas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Lightbulb className="mb-2 h-7 w-7 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">아직 아이디어가 없습니다</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/60">위 입력란에 기록해보세요</p>
            </div>
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              &ldquo;{activeTag}&rdquo; 태그의 아이디어가 없습니다
            </p>
          )
        ) : (
          <div className="flex flex-col gap-1.5">
            {filteredIdeas.map((idea) => (
              <ContextMenu key={idea.id}>
                <ContextMenuTrigger asChild>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(idea.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(idea.id);
                      }
                    }}
                    className="group relative flex cursor-pointer flex-col items-start rounded-md border border-border bg-background p-2.5 text-left transition-all hover:border-ring hover:shadow-sm focus:border-ring focus:outline-none"
                  >
                    <div className="mb-1 flex w-full items-center justify-between gap-1">
                      {idea.tag ? (
                        <span className={`rounded-full px-1.5 py-0 text-[10px] font-medium ${TAG_COLOR[idea.tag] ?? 'bg-muted'}`}>
                          {idea.tag}
                        </span>
                      ) : (
                        <span />
                      )}
                      <div className="flex items-center gap-1 shrink-0">
                        {idea.updated_at && (
                          <span className="text-[10px] text-muted-foreground">
                            {timeAgo(idea.updated_at)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDeleteId(idea.id);
                          }}
                          title="아이디어 삭제"
                          aria-label="아이디어 삭제"
                          className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                    <p className="line-clamp-2 text-xs text-foreground">
                      {extractText(idea.content) || '(빈 아이디어)'}
                    </p>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => onSelect(idea.id)}>
                    <ArrowUpRight size={12} /> 열기
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    disabled={sortKey !== 'default' || ideas.findIndex((i) => i.id === idea.id) <= 0}
                    onSelect={() => void handleMove(idea.id, -1)}
                  >
                    <ChevronUp size={12} /> 위로 이동
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={
                      sortKey !== 'default' ||
                      ideas.findIndex((i) => i.id === idea.id) < 0 ||
                      ideas.findIndex((i) => i.id === idea.id) >= ideas.length - 1
                    }
                    onSelect={() => void handleMove(idea.id, 1)}
                  >
                    <ChevronDown size={12} /> 아래로 이동
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    destructive
                    onSelect={() => setPendingDeleteId(idea.id)}
                  >
                    <Trash2 size={12} /> 삭제
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        )}
      </div>

      {pendingDeleteId && (
        <DeleteConfirmDialog
          title="아이디어 삭제"
          message="이 아이디어가 영구 삭제됩니다."
          busy={deleteBusy}
          onConfirm={() => {
            setDeleteBusy(true);
            void Promise.resolve(deleteIdeaArchive(pendingDeleteId)).then(() => {
              setDeleteBusy(false);
              setPendingDeleteId(null);
            });
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}

interface RawIdeaDetailRow {
  id: string;
  work_id: string;
  writer_id: string;
  content: string | null;
  tag: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  encrypted_dek: string | null;
}

function IdeaPanelDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: rows = [] } = useQuery<RawIdeaDetailRow>(
    `SELECT i.id, i.work_id, i.writer_id, i.content, i.tag, i.sort_order,
            i.created_at, i.updated_at,
            w.encrypted_dek AS encrypted_dek
     FROM idea_archive i
     LEFT JOIN work w ON w.id = i.work_id
     WHERE i.id = ? LIMIT 1`,
    [id],
  );
  const { data: decrypted } = useDecryptedIdeaArchiveList(rows);
  const { updateIdea, deleteIdeaArchive } = useLocalWrite();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loaded = decrypted.length > 0;
  const idea = decrypted[0];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* compact 헤더 */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
        <button
          type="button"
          onClick={onBack}
          title="목록으로"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={13} />
        </button>
        <span className="flex-1 truncate text-xs font-medium text-foreground">아이디어</span>
        {idea?.tag && (
          <span className={`h-2 w-2 shrink-0 rounded-full ${TAG_DOT_COLOR[idea.tag] ?? ''}`} />
        )}
        <div className="w-20 shrink-0">
          <Select
            options={TAG_OPTIONS}
            value={idea?.tag ?? ''}
            onChange={(e) => void updateIdea(id, { tag: e.target.value || null })}
          />
        </div>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          title="아이디어 삭제"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* 에디터 */}
      {!loaded ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          불러오는 중…
        </div>
      ) : (
        <ContentEditor
          key={id}
          itemId={id}
          initialContent={idea?.content ?? null}
          placeholder="떠오른 아이디어를 자유롭게 적어두세요…"
          onUpdate={(content) => void updateIdea(id, { content })}
          debounceMs={1500}
          showStatusBar={false}
          compact
        />
      )}

      {confirmDelete && (
        <DeleteConfirmDialog
          title="아이디어 삭제"
          message="이 아이디어가 영구 삭제됩니다."
          busy={deleteBusy}
          onConfirm={() => {
            setDeleteBusy(true);
            void deleteIdeaArchive(id).then(() => {
              setDeleteBusy(false);
              setConfirmDelete(false);
              onBack();
            });
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

/* ── AI 탭 ── */

interface AiTabContentProps {
  selectedWorkId: string | null;
  mainSection: WorkspaceSection | null;
  mainItemId: string | null;
}


interface EpisodeInfo {
  id: string;
  title: string;
  content: string | null;
  work_id: string;
  sort_order: number;
}

function formatHistoryTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '방금 전';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ── AI 탭: 단일 전역 세션 기반 화면 전환 ── */

function AiTabContent({ selectedWorkId, mainSection, mainItemId }: AiTabContentProps) {
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

  const handleReview = useCallback(async () => {
    if (!selectedWorkId || !pinnedEpisode) return;
    // 검수 prompt 자동 조립 — 단일 회차 + 중점 사항.
    const targetLabel = `${pinnedEpisode.sort_order + 1}화`;
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
      const r = await (await import('../../api/agent')).createAgentThread(
        selectedWorkId,
        'consistency_check',
      );
      const tid = r?.thread_id;
      if (!tid) throw new Error('thread_id 누락');
      // create-streaming 화면이 takePendingFirstPrompt 로 SSE 시작 — 같은 인프라 재사용.
      startCreateAction(tid);
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
  }, [selectedWorkId, pinnedEpisode, reviewFocusPrompt, startCreateAction, failCreateAction]);

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

    const episode: import('../../stores/aiSessionStore').DraftEpisodeInfo = {
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
        import('../../stores/aiSessionStore').SpellcheckResult & {
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
    const episode: import('../../stores/aiSessionStore').DraftEpisodeInfo = {
      id: pinnedEpisode.id,
      workId: pinnedEpisode.work_id,
      title: pinnedEpisode.title,
      sortOrder: pinnedEpisode.sort_order,
    };

    startSummarize(episode);

    try {
      const data = await apiClient.post<import('../../stores/aiSessionStore').SummarizeResult>(
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

function PinnedEpisodeBox({
  episode,
  hasPinned,
  canRegisterCurrent,
  onClearPinned,
  onRegisterCurrent,
}: {
  episode: EpisodeInfo | null;
  hasPinned: boolean;
  canRegisterCurrent: boolean;
  onClearPinned: () => void;
  onRegisterCurrent: () => void;
}) {
  if (hasPinned && episode) {
    return (
      <div className="flex items-start justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
        <div className="min-w-0 flex-1">
          <span className="text-xs text-muted-foreground">대상 원고</span>
          <p className="mt-0.5 truncate text-sm font-medium text-foreground">
            {episode.sort_order + 1}화: {episode.title || '(제목 없음)'}
          </p>
          {canRegisterCurrent && (
            <button
              type="button"
              onClick={onRegisterCurrent}
              className="mt-1 text-[11px] text-primary hover:underline"
              title="메인 탭의 현재 원고로 교체"
            >
              현재 메인 원고로 교체
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClearPinned}
          title="원고 등록 취소"
          aria-label="원고 등록 취소"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // 미등록 상태 — 메인 탭에 episode가 있으면 등록 버튼, 아니면 안내
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      <span className="text-xs text-muted-foreground">대상 원고</span>
      {canRegisterCurrent ? (
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">등록된 원고가 없습니다.</p>
          <button
            type="button"
            onClick={onRegisterCurrent}
            className="shrink-0 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            현재 원고 등록
          </button>
        </div>
      ) : (
        <p className="mt-0.5 text-sm text-muted-foreground">
          좌측에서 원고를 선택해주세요
        </p>
      )}
    </div>
  );
}

/* Phase 7: DraftInputScreen / textToTipTapJson / DraftViewScreen 제거됨 — legacy /ai/drafts 흐름 폐기. */

/* ── 원고 검수: 입력 화면 (다회차 선택 + 자유 prompt → agent thread) ── */

function ReviewInputScreen({
  episode,
  hasPinned,
  canRegisterCurrent,
  onClearPinned,
  onRegisterCurrent,
  selectedWorkId,
  onStartReview,
  onBack: _onBack,
}: {
  episode: EpisodeInfo | null;
  hasPinned: boolean;
  canRegisterCurrent: boolean;
  onClearPinned: () => void;
  onRegisterCurrent: () => void;
  selectedWorkId: string | null;
  onStartReview: () => void;
  onBack: () => void;
}) {
  const reviewHistory = useAiSessionStore((s) => s.reviewHistory);
  const viewReviewHistory = useAiSessionStore((s) => s.viewReviewHistory);
  const deleteReviewHistory = useAiSessionStore((s) => s.deleteReviewHistory);

  const focusPrompt = useAiSessionStore((s) => s.reviewFocusPrompt);
  const setFocusPrompt = useAiSessionStore((s) => s.setReviewFocusPrompt);

  const canStart = !!episode && !!selectedWorkId;

  const filteredHistory = selectedWorkId
    ? reviewHistory.filter((h) => h.workId === selectedWorkId)
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {/* 검수 대상 원고 — 맞춤법/요약 카드와 동일한 PinnedEpisodeBox (좌측 사이드바 선택 자동 동기화) */}
        <PinnedEpisodeBox
          episode={episode}
          hasPinned={hasPinned}
          canRegisterCurrent={canRegisterCurrent}
          onClearPinned={onClearPinned}
          onRegisterCurrent={onRegisterCurrent}
        />

        {/* 중점 사항 — 자유 prompt (외곽 카드 X, 깔끔한 input-only) */}
        {hasPinned && episode && (
          <CardlessInput
            label="검수 시 중점 사항 (선택)"
            help="비워두면 일반 검수를 진행합니다."
          >
            <textarea
              value={focusPrompt}
              onChange={(e) => setFocusPrompt(e.target.value)}
              rows={4}
              maxLength={1500}
              placeholder="특별히 점검할 부분이 있다면 자유롭게 적어주세요."
              className={CARDLESS_INPUT_CLASS}
            />
          </CardlessInput>
        )}

        {hasPinned && episode && (
          <>
            <button
              type="button"
              onClick={onStartReview}
              disabled={!canStart}
              className="flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <SearchCheck size={14} strokeWidth={1.75} />
              검수 시작
            </button>
            <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
              자세한 사용법은 우측 상단 <span className="font-medium">?</span> 도움말을 참고하세요.
            </p>
          </>
        )}

        {/* 검수 히스토리 목록 */}
        {filteredHistory.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center gap-1.5 px-1 pb-1.5">
              <History size={13} className="text-muted-foreground" strokeWidth={1.75} />
              <span className="text-xs font-medium text-muted-foreground">검수 기록</span>
              <span className="text-xs text-muted-foreground/60">{filteredHistory.length}/{10}</span>
            </div>
            <div className="flex flex-col gap-1">
              {filteredHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="group flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 transition-colors hover:border-border hover:bg-accent/20"
                >
                  <button
                    type="button"
                    onClick={() => viewReviewHistory(entry.id)}
                    className="flex min-w-0 flex-1 flex-col text-left"
                  >
                    <span className="truncate text-xs font-medium text-foreground">
                      {entry.episode.sortOrder + 1}화: {entry.episode.title || '(제목 없음)'}
                    </span>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                      <span className="flex items-center gap-0.5">
                        <Clock size={9} />
                        {formatHistoryTime(entry.createdAt)}
                      </span>
                      <span className={cn(
                        'font-medium',
                        entry.result.score >= 80 ? 'text-success' : entry.result.score >= 50 ? 'text-warning' : 'text-danger',
                      )}>
                        {entry.result.score}점
                      </span>
                      <span>이슈 {entry.result.issues.length}건</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteReviewHistory(entry.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    title="삭제"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 원고 검수: 결과 화면 (로딩/결과/에러 표시) ── */

function SpellcheckInputScreen({
  episode,
  hasPinned,
  canRegisterCurrent,
  onClearPinned,
  onRegisterCurrent,
  selectedWorkId,
  onStartSpellcheck,
}: {
  episode: EpisodeInfo | null;
  hasPinned: boolean;
  canRegisterCurrent: boolean;
  onClearPinned: () => void;
  onRegisterCurrent: () => void;
  selectedWorkId: string | null;
  onStartSpellcheck: (mode?: 'episode' | 'selection') => void;
}) {
  const spellcheckHistory = useAiSessionStore((s) => s.spellcheckHistory);
  const viewSpellcheckHistory = useAiSessionStore((s) => s.viewSpellcheckHistory);
  const deleteSpellcheckHistory = useAiSessionStore((s) => s.deleteSpellcheckHistory);
  const spellcheckState = useAiSessionStore((s) => s.spellcheckState);

  // 등록된 에디터의 선택 상태를 구독 — 비어있지 않은 영역이 선택돼 있을 때만 '선택 영역 검사' 버튼 활성화
  const [hasNonEmptySelection, setHasNonEmptySelection] = useState(false);
  useEffect(() => {
    if (!episode) {
      setHasNonEmptySelection(false);
      return;
    }
    const editor = getRegisteredEditor(episode.id);
    if (!editor) {
      setHasNonEmptySelection(false);
      return;
    }
    const update = () => setHasNonEmptySelection(!editor.state.selection.empty);
    update();
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
    };
  }, [episode]);

  const filteredHistory = selectedWorkId
    ? spellcheckHistory.filter((h) => h.workId === selectedWorkId)
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        <PinnedEpisodeBox
          episode={episode}
          hasPinned={hasPinned}
          canRegisterCurrent={canRegisterCurrent}
          onClearPinned={onClearPinned}
          onRegisterCurrent={onRegisterCurrent}
        />

        {hasPinned && episode && (
          !episode.content ? (
            <div className="rounded-md bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">
              원고 내용이 없습니다. 먼저 원고를 작성해주세요.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => onStartSpellcheck('episode')}
                disabled={spellcheckState === 'loading'}
                className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <SpellCheck size={13} strokeWidth={1.75} />
                회차 전체 맞춤법 검사
              </button>
              <button
                type="button"
                onClick={() => onStartSpellcheck('selection')}
                disabled={spellcheckState === 'loading' || !hasNonEmptySelection}
                title={hasNonEmptySelection ? '선택한 영역만 검사' : '본문에서 검사할 텍스트를 드래그로 선택하세요'}
                className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <SpellCheck size={13} strokeWidth={1.75} />
                {hasNonEmptySelection ? '선택 영역만 검사' : '선택 영역만 검사 (드래그 필요)'}
              </button>
            </div>
          )
        )}

        {filteredHistory.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center gap-1.5 px-1 pb-1.5">
              <History size={13} className="text-muted-foreground" strokeWidth={1.75} />
              <span className="text-xs font-medium text-muted-foreground">맞춤법 검사 기록</span>
              <span className="text-xs text-muted-foreground/60">{filteredHistory.length}/{10}</span>
            </div>
            <div className="flex flex-col gap-1">
              {filteredHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="group flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 transition-colors hover:border-border hover:bg-accent/20"
                >
                  <button
                    type="button"
                    onClick={() => viewSpellcheckHistory(entry.id)}
                    className="flex min-w-0 flex-1 flex-col text-left"
                  >
                    <span className="truncate text-xs font-medium text-foreground">
                      {entry.episode.sortOrder + 1}화 {entry.episode.title || '(제목 없음)'}
                    </span>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                      <span className="flex items-center gap-0.5">
                        <Clock size={9} />
                        {formatHistoryTime(entry.createdAt)}
                      </span>
                      <span>이슈 {entry.result.issues.length}건</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSpellcheckHistory(entry.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    title="삭제"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const CIRCLED_NUMBERS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
function circledNumber(n: number): string {
  if (n >= 1 && n <= 20) return CIRCLED_NUMBERS[n - 1];
  return `(${n})`;
}

/** SpellcheckIssue.type → 사용자에게 보여줄 한글 라벨. ai/app/api/v1/spellcheck.py 의 _TYPE_LABEL 과 정합. */
const SPELLCHECK_TYPE_LABELS: Record<string, string> = {
  typo: '오탈자',
  spacing: '띄어쓰기',
  punctuation: '문장부호',
};

/* Phase 7: SEVERITY_STYLE + ReviewResultScreen 제거됨 — legacy /ai/reviews 흐름 폐기. */

/**
 * 블록별로 내부 text node 들을 한 문자열로 평탄화한 뒤 search.
 * mark 로 인한 text node 분할과 LLM 의 잘못된 line 번호를 동시에 흡수.
 * normalizeWhitespace=true 면 양쪽 모두 NBSP/전각공백 등 모든 whitespace 를 일반 공백으로 환산.
 */
function findFlattenedInDoc(
  doc: import('@tiptap/pm/model').Node,
  term: string,
  normalizeWhitespace: boolean,
): { from: number; to: number } | null {
  if (!term) return null;
  const needle = normalizeWhitespace ? term.replace(/\s/g, ' ') : term;
  let result: { from: number; to: number } | null = null;

  doc.forEach((blockNode, blockOffset) => {
    if (result) return;
    const positions: number[] = [];
    let flat = '';
    blockNode.descendants((node, posInBlock) => {
      if (node.isText && node.text) {
        for (let i = 0; i < node.text.length; i++) {
          const ch = node.text[i];
          flat += normalizeWhitespace && /\s/.test(ch) ? ' ' : ch;
          positions.push(blockOffset + 1 + posInBlock + i);
        }
      }
    });
    const idx = flat.indexOf(needle);
    if (idx !== -1) {
      result = {
        from: positions[idx],
        to: positions[idx + needle.length - 1] + 1,
      };
    }
  });

  return result;
}

function SpellcheckResultScreen({ onBack, isHistoryView }: { onBack: () => void; isHistoryView?: boolean }) {
  const spellcheckState = useAiSessionStore((s) => s.spellcheckState);
  const result = useAiSessionStore((s) => s.spellcheckResult);
  const error = useAiSessionStore((s) => s.spellcheckError);
  const targetEpisode = useAiSessionStore((s) => s.spellcheckTargetEpisode);
  const appliedIssues = useAiSessionStore((s) => s.spellcheckAppliedIssues);
  const markApplied = useAiSessionStore((s) => s.markSpellcheckIssueApplied);
  const setHovered = useAiSessionStore((s) => s.setSpellcheckHoveredIssue);
  const progressMessage = useProgressMessage(spellcheckState === 'loading', [
    { at: 0, message: '맞춤법을 확인하는 중...' },
    { at: 5000, message: '고유명사를 보호하며 검사하는 중...' },
    { at: 12000, message: '결과를 정리하는 중...' },
  ]);

  const handleApplyIssue = useCallback(
    (index: number, issue: { line: number; original: string; suggestion: string }) => {
      if (!targetEpisode) return;
      const editor = getRegisteredEditor(targetEpisode.id);
      if (!editor) {
        toast.error('본문 에디터가 열려 있지 않습니다', {
          description: '대상 회차를 본문에 열고 다시 시도해주세요.',
        });
        return;
      }

      const doc = editor.state.doc;
      const selRange = useAiSessionStore.getState().spellcheckSelectionRange;
      let target: { from: number; to: number } | null = null;

      if (selRange) {
        // 선택 영역 모드: 그 범위 안에서 original 첫 매치만 검색 (line 무시)
        doc.nodesBetween(selRange.from, selRange.to, (node, pos) => {
          if (target) return false;
          if (node.isText && node.text) {
            const nodeStart = pos;
            const nodeEnd = pos + node.text.length;
            const sliceStart = Math.max(selRange.from, nodeStart) - nodeStart;
            const sliceEnd = Math.min(selRange.to, nodeEnd) - nodeStart;
            if (sliceStart >= sliceEnd) return;
            const slice = node.text.slice(sliceStart, sliceEnd);
            const idx = slice.indexOf(issue.original);
            if (idx !== -1) {
              const from = nodeStart + sliceStart + idx;
              target = { from, to: from + issue.original.length };
              return false;
            }
          }
        });
      } else {
        // Tier 1: N번째 블록 안의 단일 text node 에서 정확 매치 (가장 정밀)
        let lineCount = 0;
        doc.forEach((blockNode, blockOffset) => {
          lineCount++;
          if (lineCount !== issue.line || target) return;
          blockNode.descendants((node, posInBlock) => {
            if (target) return false;
            if (node.isText && node.text) {
              const idx = node.text.indexOf(issue.original);
              if (idx !== -1) {
                const from = blockOffset + 1 + posInBlock + idx;
                target = { from, to: from + issue.original.length };
                return false;
              }
            }
          });
        });

        // Tier 2: 모든 블록을 순회하면서 블록 내부 텍스트를 평탄화해 검색.
        // - LLM 의 line 번호 오류 (잘못된 paragraph 지목) 흡수
        // - inline mark 로 인한 text node 분할 (e.g. "한 " | "꺼번에") 흡수
        if (!target) {
          target = findFlattenedInDoc(doc, issue.original, false);
        }

        // Tier 3: whitespace 정규화 (NBSP/전각공백 → 일반공백) 후 재검색.
        // LLM 이 보낸 original 의 공백과 본문 공백이 다른 경우.
        if (!target) {
          target = findFlattenedInDoc(doc, issue.original, true);
        }
      }

      if (!target) {
        toast.error('원문을 찾지 못했습니다', {
          description: '본문이 변경되어 위치를 특정할 수 없습니다.',
        });
        return;
      }

      editor.chain().focus().insertContentAt(target, issue.suggestion).run();
      markApplied(index);
    },
    [targetEpisode, markApplied],
  );

  void onBack;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {targetEpisode && (
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <span className="text-xs text-muted-foreground">대상 원고</span>
            <p className="mt-0.5 truncate text-sm font-medium text-foreground">
              {targetEpisode.title || `${targetEpisode.sortOrder + 1}화`}
            </p>
          </div>
        )}

        {spellcheckState === 'loading' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <Loader2 size={14} className="animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">{progressMessage}</span>
            </div>
          </div>
        )}

        {spellcheckState === 'done' && result && (
          <div className="flex flex-col gap-3">
            <div className="rounded-md border border-border bg-background p-3">
              <span className="text-xs font-medium text-muted-foreground">검사 요약</span>
              <p className="mt-2 text-xs text-muted-foreground">{result.summary}</p>
            </div>

            {result.issues.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-3 text-sm text-success">
                <Check size={16} strokeWidth={2} />
                맞춤법 검사에서 발견된 문제가 없습니다.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  발견된 이슈 ({result.issues.length}건)
                </span>
                {result.issues.map((issue, i) => {
                  const applied = appliedIssues.includes(i);
                  return (
                    <div
                      key={`${issue.line}-${issue.original}-${i}`}
                      onMouseEnter={() => !applied && setHovered(i)}
                      onMouseLeave={() => setHovered(null)}
                      className={cn(
                        'rounded-md border border-border bg-background p-3 text-left transition-opacity',
                        applied && 'opacity-50',
                      )}
                    >
                      <div className="mb-2 flex items-center gap-1.5">
                        <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                          {circledNumber(i + 1)}
                        </span>
                        <span className="text-xs font-semibold">{SPELLCHECK_TYPE_LABELS[issue.type] ?? issue.type}</span>
                        <span className="text-xs text-muted-foreground">{issue.line}줄</span>
                      </div>
                      <div className="flex flex-col gap-1.5 text-xs">
                        <p>
                          <span className="font-medium text-muted-foreground">원문:</span>{' '}
                          <span className={cn('text-foreground', applied && 'line-through')}>{issue.original}</span>
                        </p>
                        <p>
                          <span className="font-medium text-muted-foreground">제안:</span>{' '}
                          <span className="text-primary">{issue.suggestion}</span>
                        </p>
                        {issue.reason && (
                          <p className="text-muted-foreground">{issue.reason}</p>
                        )}
                      </div>
                      {!isHistoryView && (
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleApplyIssue(i, issue)}
                            disabled={applied}
                            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {applied ? '적용됨' : '적용'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {spellcheckState === 'error' && error && (
          <AiErrorBlock message={error} />
        )}
      </div>
    </div>
  );
}

const ISSUE_TYPE_LABELS: Record<string, string> = {
  setting_conflict: '설정 충돌',
  narration_conflict: '서술 충돌',
  tone_conflict: '톤 불일치',
  context_conflict: '맥락 충돌',
};

/* ── 삽입 위치 인디케이터 ── */

function DropIndicatorLine() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
      <div className="h-0.5 flex-1 rounded-full bg-primary/50" />
      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
    </div>
  );
}

/* ── Sortable 패널 래퍼 ── */

const PANEL_MIN_H = 80;
const PANEL_DEFAULT_H = 200;
const PANEL_MAX_H = 600;

/** 메인 에디터의 (section, itemId)와 패널의 (docType, docId)가 동일한 문서인지 판별 */
function isSameAsMain(
  panel: AuxPanelItem,
  mainSection: WorkspaceSection | null,
  mainItemId: string | null,
): boolean {
  if (!mainSection || !mainItemId) return false;
  const mainAux = currentDocToAuxItem(mainSection, mainItemId, '');
  if (!mainAux) return false;
  return mainAux.docType === panel.docType && mainAux.docId === panel.docId;
}

function SortableAuxPanel({
  panel,
  onRemove,
  onToggleCollapse,
  onOpenInMain,
  onAddPanel,
  mainSection,
  mainItemId,
  selectedWorkId,
}: {
  panel: AuxPanelItem;
  onRemove: () => void;
  onToggleCollapse: () => void;
  onOpenInMain: () => void;
  onAddPanel: (item: Omit<AuxPanelItem, 'id' | 'collapsed'>, index?: number) => void;
  mainSection: WorkspaceSection | null;
  mainItemId: string | null;
  selectedWorkId: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: panel.id, data: { type: 'panel' } });
  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [contentHeight, setContentHeight] = useState(PANEL_DEFAULT_H);

  // 메인과 동일 문서면 시각 표시 (badge) 용도로만 — 편집은 InlineEditor가 외부 sync로 처리
  const sameAsMain = isSameAsMain(panel, mainSection, mainItemId);

  return (
    <div ref={setNodeRef} style={style} {...attributes} data-panel-id={panel.id}>
      <div className="rounded-md border border-border bg-background">
        <div className="flex items-center gap-1 border-b border-border/50 px-2 py-1.5">
          <span
            {...listeners}
            className="cursor-grab text-muted-foreground hover:text-foreground"
          >
            <GripVertical size={12} />
          </span>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="text-muted-foreground hover:text-foreground"
          >
            {panel.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
          <BreadcrumbTitle
            className="min-w-0 flex-1 text-xs"
            items={
              panel.title
                ? panel.title.split(' / ').map((s) => s.trim())
                : ['(제목 없음)']
            }
          />
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {AUX_DOC_LABELS[panel.docType]}
          </span>
          {sameAsMain && (
            <span
              className="shrink-0 text-[9px] text-muted-foreground"
              title="메인에서도 편집 중 — 양쪽 즉시 동기화"
            >
              메인에서 편집 중
            </span>
          )}
          <button
            type="button"
            onClick={onOpenInMain}
            title="본문으로 열기"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
            aria-label="본문으로 열기"
          >
            <ArrowUpRight size={12} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="패널 닫기"
          >
            <X size={12} />
          </button>
        </div>

        {!panel.collapsed && (
          <>
            <div
              style={{ height: contentHeight }}
              className="overflow-y-auto"
            >
              <AuxDocViewer
                docType={panel.docType}
                docId={panel.docId}
                workId={selectedWorkId ?? undefined}
                editable={true}
                onAddPanel={onAddPanel}
              />
            </div>
            <VerticalResizeHandle
              onResize={(delta) =>
                setContentHeight((h) =>
                  Math.max(PANEL_MIN_H, Math.min(PANEL_MAX_H, h + delta)),
                )
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ── 수직 리사이즈 핸들 (패널 하단) ── */

function VerticalResizeHandle({ onResize }: { onResize: (deltaPx: number) => void }) {
  const lastY = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      lastY.current = e.clientY;
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'row-resize';

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientY - lastY.current;
        lastY.current = ev.clientY;
        onResize(delta);
      };
      const onUp = () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
    },
    [onResize],
  );

  return (
    <div
      onPointerDown={onPointerDown}
      className="group flex h-2 cursor-row-resize items-center justify-center border-t border-border/30 hover:bg-primary/5"
      role="separator"
      aria-orientation="horizontal"
      aria-label="패널 높이 조절"
    >
      <div className="h-0.5 w-8 rounded-full bg-border group-hover:bg-primary/40 transition-colors" />
    </div>
  );
}

/* ── 회차 요약 생성: 입력 화면 (회차 등록 + 즉시 실행 버튼) ── */

function SummarizeInputScreen({
  episode,
  hasPinned,
  canRegisterCurrent,
  onClearPinned,
  onRegisterCurrent,
  selectedWorkId,
  onStartSummarize,
}: {
  episode: EpisodeInfo | null;
  hasPinned: boolean;
  canRegisterCurrent: boolean;
  onClearPinned: () => void;
  onRegisterCurrent: () => void;
  selectedWorkId: string | null;
  onStartSummarize: () => void;
}) {
  const summarizeHistory = useAiSessionStore((s) => s.summarizeHistory);
  const viewSummarizeHistory = useAiSessionStore((s) => s.viewSummarizeHistory);
  const deleteSummarizeHistory = useAiSessionStore((s) => s.deleteSummarizeHistory);
  const summarizeState = useAiSessionStore((s) => s.summarizeState);

  const filteredHistory = selectedWorkId
    ? summarizeHistory.filter((h) => h.workId === selectedWorkId)
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        <PinnedEpisodeBox
          episode={episode}
          hasPinned={hasPinned}
          canRegisterCurrent={canRegisterCurrent}
          onClearPinned={onClearPinned}
          onRegisterCurrent={onRegisterCurrent}
        />

        {hasPinned && episode && (
          !episode.content ? (
            <div className="rounded-md bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">
              원고 내용이 없습니다. 먼저 원고를 작성해주세요.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onStartSummarize}
                disabled={summarizeState === 'loading'}
                className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <ScrollText size={13} strokeWidth={1.75} />
                {summarizeState === 'loading' ? '요약 생성 중...' : '회차 요약 생성'}
              </button>
              <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
                자세한 사용법은 우측 상단 <span className="font-medium">?</span> 도움말을 참고하세요.
              </p>
            </div>
          )
        )}

        {filteredHistory.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center gap-1.5 px-1 pb-1.5">
              <History size={13} className="text-muted-foreground" strokeWidth={1.75} />
              <span className="text-xs font-medium text-muted-foreground">요약 생성 기록</span>
              <span className="text-xs text-muted-foreground/60">{filteredHistory.length}/{10}</span>
            </div>
            <div className="flex flex-col gap-1">
              {filteredHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="group flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 transition-colors hover:border-border hover:bg-accent/20"
                >
                  <button
                    type="button"
                    onClick={() => viewSummarizeHistory(entry.id)}
                    className="flex min-w-0 flex-1 flex-col text-left"
                  >
                    <span className="truncate text-xs font-medium text-foreground">
                      {entry.episode.sortOrder + 1}화 {entry.episode.title || '(제목 없음)'}
                    </span>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                      <span className="flex items-center gap-0.5">
                        <Clock size={9} />
                        {formatHistoryTime(entry.createdAt)}
                      </span>
                      <span className="truncate">{entry.result.oneline_summary || ''}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSummarizeHistory(entry.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    title="삭제"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 회차 요약 생성: 결과 화면 (12-필드 카드 표시) ── */

function SummarizeResultScreen({ onBack, isHistoryView }: { onBack: () => void; isHistoryView?: boolean }) {
  const state = useAiSessionStore((s) => s.summarizeState);
  const result = useAiSessionStore((s) => s.summarizeResult);
  const error = useAiSessionStore((s) => s.summarizeError);
  const targetEpisode = useAiSessionStore((s) => s.summarizeTargetEpisode);
  void onBack; // 헤더가 처리

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {targetEpisode && (
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <span className="text-xs text-muted-foreground">대상 원고</span>
            <p className="mt-0.5 truncate text-sm font-medium text-foreground">
              {targetEpisode.sortOrder + 1}화: {targetEpisode.title || '(제목 없음)'}
            </p>
          </div>
        )}

        {state === 'loading' && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
            <div className="flex items-center justify-center gap-2 pt-1">
              <Loader2 size={14} className="animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">요약을 생성하는 중...</span>
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-xs text-danger">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span className="leading-relaxed">{error || '요약 생성에 실패했습니다.'}</span>
          </div>
        )}

        {state === 'done' && result && (
          <SummarizeResultBody result={result} isHistoryView={isHistoryView} />
        )}
      </div>
    </div>
  );
}

function SummarizeResultBody({
  result,
  isHistoryView,
}: {
  result: import('../../stores/aiSessionStore').SummarizeResult;
  isHistoryView?: boolean;
}) {
  const cached = result.cached === true;
  return (
    <div className="flex flex-col gap-3">
      {!isHistoryView && cached && (
        <div className="rounded-md bg-info-soft px-3 py-2 text-[11px] text-info">
          본문이 변경되지 않아 저장된 요약을 즉시 불러왔습니다 (크레딧 0).
        </div>
      )}

      {/* 한 줄 요약 — 강조 박스 */}
      {result.oneline_summary && (
        <SummaryField label="한 줄 요약" emphasis>
          {result.oneline_summary}
        </SummaryField>
      )}

      {/* 본문 요약 (3 문장) */}
      {result.summary && (
        <SummaryField label="요약">
          <p className="whitespace-pre-wrap leading-relaxed">{result.summary}</p>
        </SummaryField>
      )}

      <div className="grid grid-cols-2 gap-2">
        {result.pov_character && (
          <SummaryField label="시점 인물">{result.pov_character}</SummaryField>
        )}
        {result.tone && <SummaryField label="톤">{result.tone}</SummaryField>}
      </div>

      {result.present_characters?.length > 0 && (
        <SummaryField label="등장 인물">
          <SummaryChips items={result.present_characters} />
        </SummaryField>
      )}

      {result.present_locations?.length > 0 && (
        <SummaryField label="등장 장소">
          <SummaryChips items={result.present_locations} />
        </SummaryField>
      )}

      {result.key_events?.length > 0 && (
        <SummaryField label="핵심 사건">
          <ol className="ml-3 list-decimal space-y-1">
            {[...result.key_events]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map((ev, i) => (
                <li key={i} className="text-xs leading-relaxed">{ev.event}</li>
              ))}
          </ol>
        </SummaryField>
      )}

      {result.time_progression && (
        <SummaryField label="시간 진행">{result.time_progression}</SummaryField>
      )}

      {result.cliffhanger && (
        <SummaryField label="끝점 / 절정">
          <p className="whitespace-pre-wrap leading-relaxed">{result.cliffhanger}</p>
        </SummaryField>
      )}

      {result.foreshadow_planted?.length > 0 && (
        <SummaryField label="심어진 복선">
          <ul className="space-y-1">
            {result.foreshadow_planted.map((f, i) => (
              <li key={i} className="text-xs leading-relaxed">
                <span className="font-medium">{f.name}</span>
                {f.description ? <span className="text-muted-foreground"> — {f.description}</span> : null}
              </li>
            ))}
          </ul>
        </SummaryField>
      )}

      {result.foreshadow_paid_off?.length > 0 && (
        <SummaryField label="회수된 복선">
          <SummaryChips items={result.foreshadow_paid_off.map((f) => f.name)} />
        </SummaryField>
      )}

      {result.keywords?.length > 0 && (
        <SummaryField label="키워드">
          <SummaryChips items={result.keywords} />
        </SummaryField>
      )}
    </div>
  );
}

function SummaryField({
  label,
  children,
  emphasis,
}: {
  label: string;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? 'rounded-md border border-primary/30 bg-primary/5 p-3'
          : 'rounded-md border border-border bg-background p-3'
      }
    >
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className={emphasis ? 'mt-1 text-sm font-medium text-foreground' : 'mt-1 text-xs text-foreground'}>
        {children}
      </div>
    </div>
  );
}

function SummaryChips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.filter(Boolean).map((item, i) => (
        <span
          key={i}
          className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

/* ── 문서 생성: 입력 화면 (자유 프롬프트 + 참고 회차 선택) ── */

function CreateInputScreen({
  selectedWorkId,
}: {
  selectedWorkId: string | null;
}) {
  const prompt = useAiSessionStore((s) => s.createPrompt);
  const setPrompt = useAiSessionStore((s) => s.setCreatePrompt);
  const referencePrompt = useAiSessionStore((s) => s.createReferencePrompt);
  const setReferencePrompt = useAiSessionStore((s) => s.setCreateReferencePrompt);
  const startCreate = useAiSessionStore((s) => s.startCreate);
  const failCreate = useAiSessionStore((s) => s.failCreate);
  const setScreen = useAiSessionStore((s) => s.setScreen);

  const [submitting, setSubmitting] = useState(false);

  const canSubmit = !!selectedWorkId && prompt.trim().length >= 4 && !submitting;

  async function handleSubmit() {
    if (!selectedWorkId || !canSubmit) return;
    setSubmitting(true);
    try {
      // agent 'auto' 시나리오로 thread 생성 — 사용자 의도를 LLM 이 자동 분류
      const r = await (await import('../../api/agent')).createAgentThread(selectedWorkId, 'auto');
      const tid = r?.thread_id;
      if (!tid) throw new Error('thread_id 누락');
      // 참고 자료 자유 프롬프트 — agent 가 list_episodes / list_world_notes / list_characters 등으로 alf 자체 해석
      const refBlock = referencePrompt.trim()
        ? `[참고 자료]\n${referencePrompt.trim()}\n\n`
        : '';
      const fullPrompt = refBlock + prompt.trim();
      startCreate(tid);
      // streamMessage 는 useEffect 안에서 시작 — startCreate 가 screen 을 'create-streaming' 으로 전환
      // 그 화면이 마운트되면서 createThreadId + prompt 로 SSE 시작.
      setPendingFirstPrompt(tid, fullPrompt);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      failCreate(`대화 생성 실패: ${msg}`);
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

/** AI 도구 카드 입력 영역 공통 디자인 — 외곽 카드 X, 라벨 + 입력 + 도움말 만 깔끔하게. */
function CardlessInput({
  label,
  help,
  children,
}: {
  label: React.ReactNode;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="px-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
      {help && (
        <p className="px-0.5 text-[11px] leading-relaxed text-muted-foreground/70">
          {help}
        </p>
      )}
    </div>
  );
}

/** 입력 컨트롤 (textarea/input) 공통 클래스 — 외곽 borderless, focus 시 underline 강조. */
const CARDLESS_INPUT_CLASS =
  'w-full resize-none rounded-md border border-border/40 bg-background/50 px-2.5 py-2 text-sm transition-colors focus:border-primary/60 focus:bg-background focus:outline-none focus:ring-0';

/* 첫 프롬프트를 streaming 화면으로 전달하는 임시 채널 — store 에 더 두기보단
 * module-level mutable 로 한 번만 쓰고 휘발 (페이지 nav 시 리셋 보장). */
let pendingFirstPrompt: { threadId: string; prompt: string } | null = null;
function setPendingFirstPrompt(threadId: string, prompt: string) {
  pendingFirstPrompt = { threadId, prompt };
}
function takePendingFirstPrompt(threadId: string): string | null {
  if (pendingFirstPrompt && pendingFirstPrompt.threadId === threadId) {
    const p = pendingFirstPrompt.prompt;
    pendingFirstPrompt = null;
    return p;
  }
  return null;
}

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
                  <span className="font-medium">{ep.sort_order + 1}화</span>
                  <span className="truncate text-muted-foreground">
                    {ep.title || '(제목 없음)'}
                  </span>
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

function CreateStreamingScreen() {
  const threadId = useAiSessionStore((s) => s.createThreadId);
  const state = useAiSessionStore((s) => s.createState);
  const steps = useAiSessionStore((s) => s.createSteps);
  const suggestionIds = useAiSessionStore((s) => s.createSuggestionIds);
  const error = useAiSessionStore((s) => s.createError);
  const toolStream = useAiSessionStore((s) => s.createToolStream);
  const liveText = useAiSessionStore((s) => s.createLiveText);

  const turns = useAiSessionStore((s) => s.createTurns);

  const appendChunk = useAiSessionStore((s) => s.appendCreateChunk);
  const addStep = useAiSessionStore((s) => s.addCreateStep);
  const startCreateToolStream = useAiSessionStore((s) => s.startCreateToolStream);
  const appendCreateToolPartial = useAiSessionStore((s) => s.appendCreateToolPartial);
  const startCreateTurn = useAiSessionStore((s) => s.startCreateTurn);
  const appendCreateTurnText = useAiSessionStore((s) => s.appendCreateTurnText);
  const addCreateTurnTool = useAiSessionStore((s) => s.addCreateTurnTool);
  const markCreateTurnAsBody = useAiSessionStore((s) => s.markCreateTurnAsBody);
  const finishCreate = useAiSessionStore((s) => s.finishCreate);
  const failCreate = useAiSessionStore((s) => s.failCreate);
  const setScreen = useAiSessionStore((s) => s.setScreen);
  const resetCreate = useAiSessionStore((s) => s.resetCreate);

  const abortRef = useRef<AbortController | null>(null);

  // 첫 프롬프트 SSE 시작 — threadId 변경 시 1회만.
  useEffect(() => {
    if (!threadId || state !== 'streaming') return;
    const firstPrompt = takePendingFirstPrompt(threadId);
    if (!firstPrompt) return; // 이미 시작했거나 prompt 없음

    let done = false;
    apiClient
      .streamSSE(
        `/agent/threads/${threadId}/messages/stream`,
        { message: firstPrompt },
        (parsed: unknown) => {
          const evt = parsed as {
            type: string;
            text?: string;
            error_type?: string;
            error_message?: string;
            suggestion_ids?: string[];
            tool_name?: string;
            step_type?: string;
            user_tokens?: number;
            iterations?: number;
            cum_user_tokens?: number;
            seq?: number;
            field?: string;
            chunk?: string;
            partial_json?: string;
            block_index?: number;
          };
          // ── 진단용 console.log — SSE 가 chunk 별로 도착하는지 확인 ──
          // eslint-disable-next-line no-console
          console.log('[SSE]', new Date().toISOString().slice(11, 23), evt.type, {
            tool_name: evt.tool_name,
            partial_json_len: evt.partial_json?.length,
            text_len: evt.text?.length,
            block_index: evt.block_index,
          });
          if (evt.type === 'step') {
            addStep({
              step_type: evt.step_type ?? 'unknown',
              tool_name: evt.tool_name ?? null,
              user_tokens: evt.user_tokens,
              iterations: evt.iterations,
              cum_user_tokens: evt.cum_user_tokens,
              seq: evt.seq,
            });
            // turn 카드 헤더에 도구 라벨 추가
            if (evt.step_type === 'tool_call' && evt.tool_name) {
              addCreateTurnTool(evt.tool_name);
              // propose_episode_draft 호출 시 그 turn 을 본문 카드로 마크
              if (evt.tool_name === 'propose_episode_draft') {
                markCreateTurnAsBody();
              }
            }
          } else if (evt.type === 'assistant_start') {
            // 새 turn 시작 — 새 카드 추가
            startCreateTurn();
          } else if (evt.type === 'assistant_end') {
            // turn 종료 — 다음 assistant_start 까지 동일 turn 유지
          } else if (evt.type === 'text_delta' && evt.text) {
            // turn 별 카드에 누적 + (legacy 호환) 전체 liveText 도 누적
            appendCreateTurnText(evt.text);
            appendChunk(evt.text);
          } else if (evt.type === 'tool_input_start') {
            // propose_* 도구 시작 — streaming 박스 reset.
            startCreateToolStream(evt.tool_name ?? '', '');
            // 본문 도구면 현재 turn 을 body 로 마크 (step 보다 먼저 도착 가능성 대비)
            if (evt.tool_name === 'propose_episode_draft') {
              markCreateTurnAsBody();
            }
          } else if (evt.type === 'tool_input_delta' && evt.partial_json) {
            // tool_input_start 가 누락됐다면 (이벤트 순서 흔들림) 안전장치로 첫 chunk 시 stream 시작.
            const cur = useAiSessionStore.getState().createToolStream;
            if (!cur || cur.toolName !== (evt.tool_name ?? '')) {
              startCreateToolStream(evt.tool_name ?? '', '');
            }
            appendCreateToolPartial(evt.partial_json);
          } else if (evt.type === 'tool_input_stop') {
            // 단일 도구 호출 종료 — 누적된 toolStream 은 유지 (다음 tool_input_start 시 reset).
          } else if (evt.type === 'done') {
            done = true;
            finishCreate(evt.suggestion_ids ?? []);
            return true;
          } else if (evt.type === 'error') {
            done = true;
            failCreate(`${evt.error_type ?? 'error'}: ${evt.error_message ?? ''}`);
            return true;
          }
        },
        () => {
          if (!done) finishCreate([]);
        },
        (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.toLowerCase().includes('abort')) failCreate(`전송 실패: ${msg}`);
        },
      )
      .then((controller) => {
        abortRef.current = controller;
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        failCreate(`연결 실패: ${msg}`);
      });

    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  function handleAbort() {
    abortRef.current?.abort();
  }

  function handleStartOver() {
    resetCreate();
    setScreen('create-input');
  }

  // turn 분류 — thinking 들은 진행바에 통합, body 만 카드, wrap 은 plain text
  const thinkingTurns = turns.filter((t) => t.kind === 'thinking');
  const bodyTurns = turns.filter((t) => t.kind === 'body');
  const wrapTurns = turns.filter((t) => t.kind === 'wrap');
  const lastThinking = thinkingTurns[thinkingTurns.length - 1];

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

        {/* 완료 + 제안/본문/마무리가 모두 없을 때 — 마지막 사고 응답을 "AI 결과" 카드로 메인 노출.
            예: 원고 검수에서 결론 텍스트가 진행 헤더 안에만 묻혀 사용자가 확인 어려운 케이스.
            색상은 중립 — AI 결과 텍스트 자체가 이슈를 보고할 수도 있고 무이슈를 보고할 수도 있어
            성공(emerald) 으로 단정하면 오해를 부른다. */}
        {state === 'done' &&
          suggestionIds.length === 0 &&
          bodyTurns.length === 0 &&
          wrapTurns.length === 0 &&
          (lastThinking?.text.trim() ?? '') !== '' && (
            <div className="rounded-md border border-border bg-muted/30 p-3 shadow-sm">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Info size={12} className="shrink-0 text-muted-foreground" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  AI 결과
                </span>
              </div>
              <div className="max-h-[50vh] overflow-y-auto text-sm leading-relaxed text-foreground">
                <ChatMarkdown text={lastThinking!.text.trim()} variant="assistant" />
              </div>
            </div>
          )}

        {/* 완료 후 제안 큐 안내 */}
        {state === 'done' && (
          <CreateSuggestionsReview suggestionIds={suggestionIds} />
        )}
      </div>

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

/** 완료 후 제안 카드들을 인라인으로 렌더 — SuggestionInbox 진입 없이 카드 안에서 적용/거절 */
function CreateSuggestionsReview({ suggestionIds }: { suggestionIds: string[] }) {
  const [suggestions, setSuggestions] = useState<
    Awaited<ReturnType<typeof import('../../api/agent').listSuggestions>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (suggestionIds.length === 0) {
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const all = await (await import('../../api/agent')).listSuggestions();
        const wanted = new Set(suggestionIds);
        setSuggestions(all.filter((s) => wanted.has(s.id)));
      } finally {
        setLoading(false);
      }
    })();
  }, [suggestionIds]);

  async function act(id: string, status: 'confirmed' | 'rejected') {
    setBusyId(id);
    try {
      const api = await import('../../api/agent');
      await api.patchSuggestion(id, status);
      setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" />
        제안 불러오는 중...
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="rounded-md bg-muted/40 px-3 py-3 text-center text-xs text-muted-foreground">
        생성된 제안이 없습니다. 답변 텍스트를 참고하거나 다시 만들기를 눌러 시도해주세요.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
        <ListChecks size={12} className="text-primary" />
        제안 {suggestions.length}건 — 적용 여부를 선택하세요
      </div>
      {suggestions.map((s) => (
        <CreateSuggestionItem
          key={s.id}
          suggestion={s}
          busy={busyId === s.id}
          onApprove={() => void act(s.id, 'confirmed')}
          onReject={() => void act(s.id, 'rejected')}
        />
      ))}
    </div>
  );
}

/** 단일 제안 카드 — useDecryptedSuggestion 으로 suggested_name cipher 복호화 + skeleton 가드. */
function CreateSuggestionItem({
  suggestion: s,
  busy,
  onApprove,
  onReject,
}: {
  suggestion: AgentSuggestion;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const decoded = useDecryptedSuggestion(s);
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-background p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {entityLabel(s.entity_type)}
          </span>
          {decoded.ready ? (
            <span className="truncate text-xs font-medium">{decoded.suggested_name}</span>
          ) : (
            <span className="h-3 w-32 animate-pulse rounded bg-muted/60" />
          )}
        </div>
        {s.status !== 'pending' && (
          <span className="mt-1 inline-block text-[10px] text-muted-foreground">
            {s.status === 'confirmed' ? '✓ 적용됨' : '✗ 거절됨'}
          </span>
        )}
      </div>
      {s.status === 'pending' && (
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="flex h-7 items-center gap-0.5 rounded border border-border px-2 text-[11px] hover:bg-accent disabled:opacity-50"
          >
            <X size={11} /> 거절
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={busy}
            className="flex h-7 items-center gap-0.5 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Check size={11} /> 적용
          </button>
        </div>
      )}
    </div>
  );
}
