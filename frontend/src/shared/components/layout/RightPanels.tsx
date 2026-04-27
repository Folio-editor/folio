import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
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
  ArrowLeft,
  BotMessageSquare,
  Check,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ClipboardCopy,
  Clock,
  FileStack,
  GripVertical,
  History,
  Info,
  Lightbulb,
  Loader2,
  OctagonAlert,
  Search,
  Send,
  Sparkles,
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
import { DeleteConfirmDialog } from '../ui/DeleteConfirmDialog';
import { Skeleton } from '../ui/Skeleton';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useProgressMessage, type ProgressStage } from '../../hooks/useProgressMessage';
import { useWriterId } from '../../hooks/useWriterId';
import { apiClient, ApiError } from '../../lib/apiClient';
import { useNavigationStore } from '../../stores/navigationStore';

/**
 * 402(크레딧 부족) 에러를 다른 일반 에러와 구분하기 위한 sentinel 접두사.
 * 에러 표시 영역은 이 접두사가 붙은 메시지를 받으면 "결제로 이동" 버튼을 함께 렌더링한다.
 */
const INSUFFICIENT_CREDITS_PREFIX = '__INSUFFICIENT_CREDITS__:';
const INSUFFICIENT_CREDITS_MESSAGE =
  '크레딧이 부족합니다. 설정 → 결제에서 충전 후 다시 시도해주세요.';

const REVIEW_PROGRESS_STAGES: ProgressStage[] = [
  { at: 0, message: '원고를 분석하고 있어요...' },
  { at: 5000, message: '설정집과 대조하는 중...' },
  { at: 15000, message: '이전 회차 맥락을 확인하는 중...' },
  { at: 30000, message: '이슈를 정리하는 중...' },
  { at: 45000, message: '거의 다 됐어요...' },
];

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
import { useAiSessionStore } from '../../stores/aiSessionStore';
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
  { key: 'docs', icon: FileStack, label: '문서 뷰어' },
  { key: 'idea', icon: Lightbulb, label: '아이디어' },
  { key: 'ai', icon: BotMessageSquare, label: 'AI 도구' },
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

      {/* 상단 헤더 — 활성 탭 라벨 (좌측 사이드바/메인 탭바와 동일한 h-10) */}
      <div className="flex h-10 shrink-0 items-center border-b border-sidebar-border px-4">
        <span className="truncate text-sm font-semibold text-sidebar-foreground">
          {TABS.find((t) => t.key === activeTab)?.label}
        </span>
      </div>

      {/* 아이콘 탭 행 — 검색창 영역(h-12)과 동일 높이 */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-sidebar-border/50 px-3">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            title={label}
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
      </div>
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

interface IdeaRow {
  id: string;
  content: string;
  tag: string | null;
  updated_at: string;
}

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
  const { createIdea } = useLocalWrite();
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: ideas = [] } = useQuery<IdeaRow>(
    `SELECT id, content, tag, updated_at FROM idea_archive
     WHERE work_id = ? AND writer_id = ?
     ORDER BY sort_order ASC, created_at DESC`,
    [workId, writerId],
  );

  const filteredIdeas = activeTag ? ideas.filter((i) => i.tag === activeTag) : ideas;

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
            rows={2}
            className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
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
              <button
                key={idea.id}
                type="button"
                onClick={() => onSelect(idea.id)}
                className="flex flex-col items-start rounded-md border border-border bg-background p-2.5 text-left transition-all hover:border-ring hover:shadow-sm"
              >
                <div className="flex w-full items-center justify-between gap-1 mb-1">
                  {idea.tag ? (
                    <span className={`rounded-full px-1.5 py-0 text-[10px] font-medium ${TAG_COLOR[idea.tag] ?? 'bg-muted'}`}>
                      {idea.tag}
                    </span>
                  ) : (
                    <span />
                  )}
                  {idea.updated_at && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {timeAgo(idea.updated_at)}
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 text-xs text-foreground">
                  {extractText(idea.content) || '(빈 아이디어)'}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface IdeaDetailRow {
  id: string;
  content: string | null;
  tag: string | null;
}

function IdeaPanelDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: rows = [] } = useQuery<IdeaDetailRow>(
    `SELECT id, content, tag FROM idea_archive WHERE id = ?`,
    [id],
  );
  const { updateIdea, deleteIdeaArchive } = useLocalWrite();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loaded = rows.length > 0;
  const idea = rows[0];

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

  const { data: episodeRows = [] } = useQuery<EpisodeInfo>(
    isEpisode
      ? `SELECT id, title, content, work_id, sort_order FROM episode WHERE id = ?`
      : `SELECT '' as id, '' as title, null as content, '' as work_id, 0 as sort_order WHERE 0`,
    isEpisode ? [mainItemId] : [],
  );
  const currentEpisode = episodeRows[0] ?? null;

  // 전역 AI 세션 스토어
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

  const refreshWallet = useWalletStore((s) => s.refresh);

  const handleGenerate = useCallback(async () => {
    if (!storyline.trim() || !currentEpisode) return;
    if (isStreaming) return;

    const episode: import('../../stores/aiSessionStore').DraftEpisodeInfo = {
      id: currentEpisode.id,
      workId: currentEpisode.work_id,
      title: currentEpisode.title,
      sortOrder: currentEpisode.sort_order,
    };

    startGeneration(episode);

    const controller = await apiClient.streamSSE(
      '/ai/drafts',
      {
        workId: episode.workId,
        episodeId: episode.id,
        storyline: storyline.trim(),
        currentEpisodeNum: episode.sortOrder + 1,
        model,
        userPrompt: userPrompt.trim() || null,
      },
      (data: unknown) => {
        const d = data as { type?: string; content?: string };
        if (d.type === 'done') {
          finishGeneration();
          void refreshWallet();
          return true;
        }
        if (d.type === 'chunk' && d.content) {
          appendChunk(d.content);
        }
      },
      () => {
        finishGeneration();
        void refreshWallet();
      },
      (err) => failGeneration(describeAiError(err, 'AI 서버 오류가 발생했습니다.')),
    );
    setAbort(controller);
  }, [currentEpisode, storyline, userPrompt, model, isStreaming, startGeneration, appendChunk, finishGeneration, failGeneration, setAbort, refreshWallet]);

  const handleStop = () => stopGeneration();

  const startReview = useAiSessionStore((s) => s.startReview);
  const finishReview = useAiSessionStore((s) => s.finishReview);
  const failReview = useAiSessionStore((s) => s.failReview);

  const handleReview = useCallback(async () => {
    if (!currentEpisode?.content) return;

    const episode: import('../../stores/aiSessionStore').DraftEpisodeInfo = {
      id: currentEpisode.id,
      workId: currentEpisode.work_id,
      title: currentEpisode.title,
      sortOrder: currentEpisode.sort_order,
    };

    startReview(episode);

    try {
      const data = await apiClient.post<import('../../stores/aiSessionStore').ReviewResult>('/ai/reviews', {
        workId: episode.workId,
        episodeId: episode.id,
        content: currentEpisode.content,
        episodeNumber: episode.sortOrder + 1,
      });
      const reviewResult = data ?? { issues: [], summary: '검수가 완료되었습니다.', score: 100 };
      finishReview(reviewResult);
      void refreshWallet();
      const issueCount = reviewResult.issues.length;
      toast.success(
        issueCount === 0
          ? '검수 완료 — 발견된 이슈가 없어요'
          : `검수 완료 — 이슈 ${issueCount}건 발견`,
        { description: `점수 ${reviewResult.score}/100` },
      );
    } catch (err) {
      const message = describeAiError(err, 'AI 서버 오류가 발생했습니다.');
      failReview(message);
      const display = message.startsWith(INSUFFICIENT_CREDITS_PREFIX)
        ? message.slice(INSUFFICIENT_CREDITS_PREFIX.length)
        : message;
      toast.error('검수 실패', { description: display });
    }
  }, [currentEpisode, startReview, finishReview, failReview, refreshWallet]);

  // 히스토리 뷰: 과거 생성 결과 열람
  if (screen === 'history-view') {
    return (
      <DraftViewScreen
        result={draftResult}
        state={draftState}
        error={draftError}
        targetEpisode={targetEpisode}
        isHistoryView
        onStop={handleStop}
        onBack={() => setScreen('draft-input')}
      />
    );
  }

  // 생성 뷰: 스트리밍/완료/에러 상태에서 항상 표시 (메인 화면 이동과 무관)
  if (screen === 'draft-view') {
    return (
      <DraftViewScreen
        result={draftResult}
        state={draftState}
        error={draftError}
        targetEpisode={targetEpisode}
        onStop={handleStop}
        onBack={() => setScreen('draft-input')}
      />
    );
  }

  if (screen === 'draft-input') {
    return (
      <DraftInputScreen
        episode={currentEpisode}
        isEpisode={isEpisode}
        storyline={storyline}
        userPrompt={userPrompt}
        model={model}
        isStreaming={isStreaming}
        onStorylineChange={setStoryline}
        onUserPromptChange={setUserPrompt}
        onModelChange={setModel}
        onGenerate={handleGenerate}
        onBack={() => setScreen('menu')}
      />
    );
  }

  if (screen === 'review-history-view') {
    return (
      <ReviewResultScreen
        onBack={() => setScreen('review-input')}
        isHistoryView
      />
    );
  }

  if (screen === 'review-result') {
    return (
      <ReviewResultScreen
        onBack={() => setScreen('review-input')}
      />
    );
  }

  if (screen === 'review-input') {
    return (
      <ReviewInputScreen
        episode={currentEpisode}
        isEpisode={isEpisode}
        selectedWorkId={selectedWorkId}
        onStartReview={handleReview}
        onBack={() => setScreen('menu')}
      />
    );
  }

  // 메뉴 화면
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <button
        type="button"
        onClick={() => setScreen('draft-input')}
        className="flex items-start gap-3 rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-ring hover:bg-accent/30"
      >
        <Sparkles size={20} className="mt-0.5 shrink-0 text-primary" strokeWidth={1.5} />
        <div>
          <p className="text-sm font-medium text-foreground">초안 생성</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            AI가 작품 설정과 이전 맥락을 참고하여 다음 회차 원고를 생성합니다.
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={() => setScreen('review-input')}
        className="flex items-start gap-3 rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-ring hover:bg-accent/30"
      >
        <Search size={20} className="mt-0.5 shrink-0 text-primary" strokeWidth={1.5} />
        <div>
          <p className="text-sm font-medium text-foreground">원고 검수</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            설정집과 이전 맥락을 대조하여 모순이나 오류를 검출합니다.
          </p>
        </div>
      </button>
    </div>
  );
}

/* ── 초안 생성: 입력 화면 ── */

function DraftInputScreen({
  episode,
  isEpisode,
  storyline,
  userPrompt,
  model,
  isStreaming,
  onStorylineChange,
  onUserPromptChange,
  onModelChange,
  onGenerate,
  onBack,
}: {
  episode: EpisodeInfo | null;
  isEpisode: boolean;
  storyline: string;
  userPrompt: string;
  model: string;
  isStreaming: boolean;
  onStorylineChange: (v: string) => void;
  onUserPromptChange: (v: string) => void;
  onModelChange: (v: string) => void;
  onGenerate: () => void;
  onBack: () => void;
}) {
  const history = useAiSessionStore((s) => s.history);
  const viewHistory = useAiSessionStore((s) => s.viewHistory);
  const deleteHistory = useAiSessionStore((s) => s.deleteHistory);

  const canGenerate = isEpisode && episode != null && storyline.trim().length > 0 && !isStreaming;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 헤더 */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={15} />
        </button>
        <Sparkles size={14} className="text-primary" />
        <span className="text-xs font-semibold text-foreground">초안 생성</span>
      </div>

      {/* 폼 */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {/* 현재 에피소드 */}
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <span className="text-xs text-muted-foreground">대상 원고</span>
          {isEpisode && episode ? (
            <p className="mt-0.5 truncate text-sm font-medium text-foreground">
              {episode.sort_order + 1}화: {episode.title || '(제목 없음)'}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">
              좌측에서 원고를 선택해주세요
            </p>
          )}
        </div>

        {/* 이번 회차 방향 */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            이번 회차 방향 <span className="text-destructive">*</span>
          </label>
          <textarea
            value={storyline}
            onChange={(e) => onStorylineChange(e.target.value)}
            placeholder="이번 회차에서 전개할 내용을 설명해주세요..."
            rows={3}
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* 추가 지시사항 */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            추가 지시사항 (선택)
          </label>
          <textarea
            value={userPrompt}
            onChange={(e) => onUserPromptChange(e.target.value)}
            placeholder="문체, 톤, 특별 요구사항 등..."
            rows={2}
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* 모델 선택 + 생성 버튼 */}
        <div className="flex items-center gap-2">
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
          </select>

          <button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Sparkles size={13} strokeWidth={1.75} />
            초안 생성
          </button>
        </div>

        {isStreaming && (
          <p className="text-xs text-warning">
            현재 초안이 생성 중입니다. 중단 후 새로운 생성을 시작할 수 있습니다.
          </p>
        )}

        {/* 히스토리 목록 */}
        {history.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center gap-1.5 px-1 pb-1.5">
              <History size={13} className="text-muted-foreground" strokeWidth={1.75} />
              <span className="text-xs font-medium text-muted-foreground">최근 생성 기록</span>
              <span className="text-xs text-muted-foreground/60">{history.length}/{10}</span>
            </div>
            <div className="flex flex-col gap-1">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="group flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 transition-colors hover:border-border hover:bg-accent/20"
                >
                  <button
                    type="button"
                    onClick={() => viewHistory(entry.id)}
                    className="flex min-w-0 flex-1 flex-col text-left"
                  >
                    <span className="truncate text-xs font-medium text-foreground">
                      {entry.episode.sortOrder + 1}화: {entry.episode.title || '(제목 없음)'}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {entry.storyline.slice(0, 40)}{entry.storyline.length > 40 ? '...' : ''}
                    </span>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                      <span className="flex items-center gap-0.5">
                        <Clock size={9} />
                        {formatHistoryTime(entry.createdAt)}
                      </span>
                      <span>{entry.result.length.toLocaleString()}자</span>
                      <span className="uppercase">{entry.model}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteHistory(entry.id)}
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

/* ── 초안 생성: 읽기전용 에디터 뷰 ── */

function textToTipTapJson(text: string) {
  const paragraphs = text.split('\n\n').filter(Boolean);
  if (paragraphs.length === 0) {
    return { type: 'doc' as const, content: [{ type: 'paragraph' as const }] };
  }
  return {
    type: 'doc' as const,
    content: paragraphs.map((p) => ({
      type: 'paragraph' as const,
      content: [{ type: 'text' as const, text: p }],
    })),
  };
}

function DraftViewScreen({
  result,
  state,
  error,
  targetEpisode,
  isHistoryView = false,
  onStop,
  onBack,
}: {
  result: string;
  state: import('../../stores/aiSessionStore').DraftState;
  error: string;
  targetEpisode: import('../../stores/aiSessionStore').DraftEpisodeInfo | null;
  isHistoryView?: boolean;
  onStop: () => void;
  onBack: () => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [
      StarterKit.configure({ code: false, codeBlock: false }),
      Typography,
    ],
    content: '',
  }, []);

  // 결과 텍스트가 업데이트될 때마다 에디터에 반영 + 자동 스크롤
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (result) {
      editor.commands.setContent(textToTipTapJson(result));
      // 자동 스크롤
      requestAnimationFrame(() => {
        editorRef.current?.scrollTo(0, editorRef.current.scrollHeight);
      });
    }
  }, [editor, result]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 헤더 */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          {state !== 'streaming' && (
            <button
              type="button"
              onClick={onBack}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft size={15} />
            </button>
          )}
          <div className="flex items-center gap-1.5 overflow-hidden">
            {state === 'streaming' && (
              <Loader2 size={13} className="shrink-0 animate-spin text-primary" />
            )}
            <span className="truncate text-xs font-semibold text-foreground">
              {isHistoryView ? '생성 기록' : state === 'streaming' ? 'AI 생성 중...' : state === 'done' ? '생성 완료' : state === 'error' ? '생성 오류' : 'AI 초안'}
              {targetEpisode && (
                <span className="ml-1 font-normal text-muted-foreground">
                  {targetEpisode.sortOrder + 1}화
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {state === 'streaming' && (
            <button
              type="button"
              onClick={onStop}
              className="flex h-7 items-center gap-1 rounded-md bg-destructive px-2 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
            >
              <Square size={10} strokeWidth={2.5} />
              중단
            </button>
          )}
          {result && state !== 'streaming' && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex h-7 items-center gap-1 rounded-md border border-input px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ClipboardCopy size={11} strokeWidth={1.75} />
              {copied ? '복사됨' : '복사'}
            </button>
          )}
        </div>
      </div>

      {/* 에러 */}
      {state === 'error' && error && (
        <div className="shrink-0 border-b border-destructive/20 px-4 py-2">
          <AiErrorBlock message={error} />
        </div>
      )}

      {/* 읽기전용 에디터 뷰 */}
      <div
        ref={editorRef}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
      >
        <EditorContent
          editor={editor}
          className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
        />
      </div>
    </div>
  );
}

/* ── 원고 검수: 입력 화면 (검수 버튼 + 히스토리 목록) ── */

function ReviewInputScreen({
  episode,
  isEpisode,
  selectedWorkId,
  onStartReview,
  onBack,
}: {
  episode: EpisodeInfo | null;
  isEpisode: boolean;
  selectedWorkId: string | null;
  onStartReview: () => void;
  onBack: () => void;
}) {
  const reviewHistory = useAiSessionStore((s) => s.reviewHistory);
  const viewReviewHistory = useAiSessionStore((s) => s.viewReviewHistory);
  const deleteReviewHistory = useAiSessionStore((s) => s.deleteReviewHistory);
  const reviewState = useAiSessionStore((s) => s.reviewState);

  const filteredHistory = selectedWorkId
    ? reviewHistory.filter((h) => h.workId === selectedWorkId)
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={15} />
        </button>
        <Search size={14} className="text-primary" />
        <span className="text-xs font-semibold text-foreground">원고 검수</span>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {!isEpisode || !episode ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center">
            <p className="text-sm text-muted-foreground">좌측에서 원고를 선택해주세요.</p>
          </div>
        ) : (
          <>
            <div className="rounded-md bg-muted/50 px-3 py-2">
              <span className="text-xs text-muted-foreground">대상 원고</span>
              <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                {episode.sort_order + 1}화: {episode.title || '(제목 없음)'}
              </p>
            </div>

            {!episode.content ? (
              <div className="rounded-md bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">
                원고 내용이 없습니다. 먼저 원고를 작성해주세요.
              </div>
            ) : (
              <button
                type="button"
                onClick={onStartReview}
                disabled={reviewState === 'loading'}
                className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Search size={13} strokeWidth={1.75} />
                검수 시작
              </button>
            )}
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

const CIRCLED_NUMBERS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
function circledNumber(n: number): string {
  if (n >= 1 && n <= 20) return CIRCLED_NUMBERS[n - 1];
  return `(${n})`;
}

const SEVERITY_STYLE: Record<string, { bg: string; icon: typeof Info; label: string }> = {
  critical: { bg: 'bg-danger-soft border-danger/30', icon: OctagonAlert, label: '심각' },
  warning: { bg: 'bg-warning-soft border-warning/30', icon: AlertTriangle, label: '주의' },
  info: { bg: 'bg-info-soft border-info/30', icon: Info, label: '참고' },
};

function ReviewResultScreen({ onBack, isHistoryView }: { onBack: () => void; isHistoryView?: boolean }) {
  const reviewState = useAiSessionStore((s) => s.reviewState);
  const result = useAiSessionStore((s) => s.reviewResult);
  const error = useAiSessionStore((s) => s.reviewError);
  const targetEpisode = useAiSessionStore((s) => s.reviewTargetEpisode);
  const focusedIndex = useReviewHighlightStore((s) => s.focusedIndex);
  const progressMessage = useProgressMessage(reviewState === 'loading', REVIEW_PROGRESS_STAGES);

  // 하이라이트 연동: 결과가 있으면 하이라이트 스토어에 이슈 전달
  useEffect(() => {
    if (reviewState === 'done' && result && result.issues.length > 0) {
      useReviewHighlightStore.getState().setIssues(
        result.issues.map((issue, i) => ({
          index: i,
          type: issue.type,
          severity: issue.severity,
          lines: issue.lines ?? [],
          location: issue.location,
          description: issue.description,
        })),
      );
    }
    return () => useReviewHighlightStore.getState().clearIssues();
  }, [reviewState, result]);

  const handleBack = () => {
    useReviewHighlightStore.getState().clearIssues();
    onBack();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={15} />
        </button>
        <Search size={14} className="text-primary" />
        <span className="text-xs font-semibold text-foreground">
          {isHistoryView ? '검수 기록' : '원고 검수'}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {/* 대상 에피소드 */}
        {targetEpisode && (
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <span className="text-xs text-muted-foreground">대상 원고</span>
            <p className="mt-0.5 truncate text-sm font-medium text-foreground">
              {targetEpisode.sortOrder + 1}화: {targetEpisode.title || '(제목 없음)'}
            </p>
          </div>
        )}

        {/* 로딩 */}
        {reviewState === 'loading' && (
          <div className="flex flex-col gap-3">
            {/* 점수 카드 자리 */}
            <div className="rounded-md border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-14" />
              </div>
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-1.5 h-3 w-4/5" />
            </div>

            {/* 이슈 카드 자리 — 3개 */}
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>

            {/* 진행 메시지 */}
            <div className="flex items-center justify-center gap-2 pt-1">
              <Loader2 size={14} className="animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">{progressMessage}</span>
            </div>
          </div>
        )}

        {/* 검수 결과 */}
        {reviewState === 'done' && result && (
          <div className="flex flex-col gap-3">
            <div className="rounded-md border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">검수 점수</span>
                <span className={cn(
                  'text-lg font-bold',
                  result.score >= 80 ? 'text-success' : result.score >= 50 ? 'text-warning' : 'text-danger',
                )}>
                  {result.score}
                  <span className="text-xs font-normal text-muted-foreground">/100</span>
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{result.summary}</p>
            </div>

            {result.issues.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-3 text-sm text-success">
                <Check size={16} strokeWidth={2} />
                검수에서 발견된 문제가 없습니다.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  발견된 이슈 ({result.issues.length}건)
                </span>
                {result.issues.map((issue, i) => {
                  const severity = SEVERITY_STYLE[issue.severity] ?? SEVERITY_STYLE.info;
                  const SeverityIcon = severity.icon;
                  const isFocused = focusedIndex === i;
                  return (
                    <button
                      type="button"
                      key={i}
                      onClick={() => useReviewHighlightStore.getState().focusIssue(i)}
                      className={cn(
                        'rounded-md border p-3 text-left transition-all',
                        severity.bg,
                        isFocused && 'ring-2 ring-primary/50',
                        issue.lines.length > 0 && 'cursor-pointer hover:brightness-95',
                      )}
                    >
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <span className={cn(
                          'flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                          issue.severity === 'critical' && 'bg-danger text-danger-foreground',
                          issue.severity === 'warning' && 'bg-warning text-warning-foreground',
                          issue.severity === 'info' && 'bg-info text-info-foreground',
                        )}>
                          {circledNumber(i + 1)}
                        </span>
                        <SeverityIcon size={14} strokeWidth={1.75} />
                        <span className="text-xs font-semibold">{severity.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {ISSUE_TYPE_LABELS[issue.type] ?? issue.type}
                        </span>
                      </div>
                      {issue.location && (
                        <p className="mb-1 rounded bg-background/60 px-2 py-1 text-xs italic text-foreground/80">
                          &ldquo;{issue.location}&rdquo;
                        </p>
                      )}
                      <p className="text-xs text-foreground">{issue.description}</p>
                      {issue.reference && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <span className="font-medium">근거:</span> {issue.reference}
                        </p>
                      )}
                      {issue.suggestion && (
                        <p className="mt-1 text-xs text-primary">
                          <span className="font-medium">제안:</span> {issue.suggestion}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {reviewState === 'error' && error && (
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
