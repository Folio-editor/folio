import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
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
  Eye,
  FileStack,
  GripVertical,
  Info,
  Lightbulb,
  Loader2,
  OctagonAlert,
  Pencil,
  Search,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { ResizeHandle } from './ResizeHandle';
import { AuxDocViewer } from './AuxDocViewer';
import { ContentEditor } from '../editor/ContentEditor';
import { Select } from '../ui/Select';
import { DeleteConfirmDialog } from '../ui/DeleteConfirmDialog';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useWriterId } from '../../hooks/useWriterId';
import { apiClient } from '../../lib/apiClient';
import type { AuxPanelItem, AuxDocType, RightPanelTab, WorkspaceSection } from '../../types/workspace';
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
  mainSection: import('../../types/workspace').WorkspaceSection | null;
  mainItemId: string | null;
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
  mainSection,
  mainItemId,
}: RightPanelsProps) {
  return (
    <div
      style={{ width }}
      className="relative flex shrink-0 flex-col border-l border-border"
    >
      <ResizeHandle
        side="left"
        onResize={onWidthChange}
        ariaLabel="우측 패널 너비 조절"
      />

      {/* 탭 헤더 */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-3">
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
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon size={15} strokeWidth={1.75} />
          </button>
        ))}
        <span className="ml-1 truncate text-xs text-muted-foreground">
          {TABS.find((t) => t.key === activeTab)?.label}
        </span>
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
          />
        )}
        {activeTab === 'idea' && (
          <IdeaTabContent selectedWorkId={selectedWorkId} />
        )}
        {activeTab === 'ai' && (
          <AiTabContent
            selectedWorkId={selectedWorkId}
            mainSection={mainSection}
            mainItemId={mainItemId}
          />
        )}
      </div>
    </div>
  );
}

/* ── Docs 탭 (기존 문서 뷰어) ── */

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
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

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

  const handleSortEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = panels.findIndex((p) => p.id === active.id);
    const newIdx = panels.findIndex((p) => p.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    onReorderPanels(arrayMove(panels, oldIdx, newIdx));
  };

  return (
    <div
      className={cn('flex flex-1 flex-col', isDragOver && 'bg-primary/5')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {panels.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <div className={cn(
            'rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors',
            isDragOver ? 'border-primary bg-primary/10' : 'border-primary/30',
          )}>
            <p className="text-sm font-medium text-primary/70">여기에 문서를 놓으세요</p>
            <p className="mt-1 text-xs text-muted-foreground">
              사이드바에서 드래그하여 문서를 핀할 수 있습니다
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSortEnd}
          >
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
                    />
                  </div>
                ))}
                {isDragOver && dropIndex === panels.length && <DropIndicatorLine />}
              </div>
            </SortableContext>
          </DndContext>
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

type AiSubTab = 'draft' | 'review';

interface EpisodeInfo {
  id: string;
  title: string;
  content: string | null;
  work_id: string;
  sort_order: number;
}

function AiTabContent({ selectedWorkId, mainSection, mainItemId }: AiTabContentProps) {
  const [subTab, setSubTab] = useState<AiSubTab>('draft');

  const isEpisode = mainSection === 'episode' && mainItemId != null;
  const { data: episodeRows = [] } = useQuery<EpisodeInfo>(
    isEpisode
      ? `SELECT id, title, content, work_id, sort_order FROM episode WHERE id = ?`
      : `SELECT '' as id, '' as title, null as content, '' as work_id, 0 as sort_order WHERE 0`,
    isEpisode ? [mainItemId] : [],
  );
  const episode = episodeRows[0] ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 서브 탭 */}
      <div className="flex shrink-0 border-b border-border">
        {([
          { key: 'draft' as const, icon: Sparkles, label: '초안 생성' },
          { key: 'review' as const, icon: Search, label: '원고 검수' },
        ]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors',
              subTab === key
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon size={13} strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>

      {/* 콘텐츠 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {!isEpisode || !episode ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <BotMessageSquare size={28} className="text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              원고 편집 화면에서 사용할 수 있습니다.
              <br />
              좌측에서 원고를 선택해주세요.
            </p>
          </div>
        ) : subTab === 'draft' ? (
          <DraftPanel episode={episode} />
        ) : (
          <ReviewPanel episode={episode} />
        )}
      </div>
    </div>
  );
}

/* ── 초안 생성 패널 ── */

type DraftState = 'idle' | 'streaming' | 'done' | 'error';

function DraftPanel({ episode }: { episode: EpisodeInfo }) {
  const [storyline, setStoryline] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [model, setModel] = useState('sonnet');
  const [state, setState] = useState<DraftState>('idle');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const writerId = useWriterId();

  // 에피소드 변경 시 상태 초기화
  useEffect(() => {
    setState('idle');
    setResult('');
    setError('');
    setStoryline('');
    setUserPrompt('');
    abortRef.current?.abort();
  }, [episode.id]);

  const handleGenerate = useCallback(async () => {
    if (!storyline.trim()) return;
    setState('streaming');
    setResult('');
    setError('');

    const controller = await apiClient.streamSSE(
      '/ai/drafts',
      {
        workId: episode.work_id,
        episodeId: episode.id,
        storyline: storyline.trim(),
        currentEpisodeNum: episode.sort_order + 1,
        model,
        userPrompt: userPrompt.trim() || null,
      },
      (data: unknown) => {
        const d = data as { type?: string; content?: string };
        if (d.type === 'chunk' && d.content) {
          setResult((prev) => prev + d.content);
          resultRef.current?.scrollTo(0, resultRef.current.scrollHeight);
        }
      },
      () => setState('done'),
      (err) => {
        setError(err.message || 'AI 서버 오류가 발생했습니다.');
        setState('error');
      },
    );
    abortRef.current = controller;
  }, [episode, storyline, userPrompt, model]);

  const handleStop = () => {
    abortRef.current?.abort();
    setState('done');
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result);
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* 현재 에피소드 */}
      <div className="rounded-md bg-muted/50 px-3 py-2">
        <span className="text-xs text-muted-foreground">현재 원고</span>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground">
          {episode.title || '(제목 없음)'}
        </p>
      </div>

      {/* 이번 회차 방향 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          이번 회차 방향 <span className="text-destructive">*</span>
        </label>
        <textarea
          value={storyline}
          onChange={(e) => setStoryline(e.target.value)}
          placeholder="이번 회차에서 전개할 내용을 설명해주세요..."
          rows={3}
          disabled={state === 'streaming'}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
      </div>

      {/* 추가 지시사항 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          추가 지시사항 (선택)
        </label>
        <textarea
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          placeholder="문체, 톤, 특별 요구사항 등..."
          rows={2}
          disabled={state === 'streaming'}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
      </div>

      {/* 모델 선택 + 생성 버튼 */}
      <div className="flex items-center gap-2">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={state === 'streaming'}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        >
          <option value="sonnet">Sonnet</option>
          <option value="opus">Opus</option>
        </select>

        {state === 'streaming' ? (
          <button
            type="button"
            onClick={handleStop}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90"
          >
            <Square size={12} strokeWidth={2} />
            중단
          </button>
        ) : (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!storyline.trim()}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Sparkles size={13} strokeWidth={1.75} />
            초안 생성
          </button>
        )}
      </div>

      {/* 결과 영역 */}
      {(result || state === 'streaming') && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {state === 'streaming' ? '생성 중...' : '생성 결과'}
            </span>
            {state === 'streaming' && (
              <Loader2 size={14} className="animate-spin text-primary" />
            )}
          </div>
          <div
            ref={resultRef}
            className="max-h-80 overflow-y-auto rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed text-foreground whitespace-pre-wrap"
          >
            {result}
          </div>
          {state === 'done' && result && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-input bg-background text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <ClipboardCopy size={12} strokeWidth={1.75} />
              복사
            </button>
          )}
        </div>
      )}

      {/* 에러 */}
      {state === 'error' && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

/* ── 원고 검수 패널 ── */

interface ReviewIssue {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  location: string;
  description: string;
  reference: string;
  suggestion: string;
}

interface ReviewResult {
  issues: ReviewIssue[];
  summary: string;
  score: number;
}

type ReviewState = 'idle' | 'loading' | 'done' | 'error';

function ReviewPanel({ episode }: { episode: EpisodeInfo }) {
  const [state, setState] = useState<ReviewState>('idle');
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState('');
  const writerId = useWriterId();

  useEffect(() => {
    setState('idle');
    setResult(null);
    setError('');
  }, [episode.id]);

  const handleReview = async () => {
    if (!episode.content) return;
    setState('loading');
    setError('');

    try {
      const data = await apiClient.post<ReviewResult>('/ai/reviews', {
        workId: episode.work_id,
        episodeId: episode.id,
        content: episode.content,
        episodeNumber: episode.sort_order + 1,
      });
      setResult(data ?? { issues: [], summary: '검수가 완료되었습니다.', score: 100 });
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 서버 오류가 발생했습니다.');
      setState('error');
    }
  };

  const SEVERITY_STYLE: Record<string, { bg: string; icon: typeof Info; label: string }> = {
    critical: { bg: 'bg-red-50 border-red-200', icon: OctagonAlert, label: '심각' },
    warning: { bg: 'bg-amber-50 border-amber-200', icon: AlertTriangle, label: '주의' },
    info: { bg: 'bg-blue-50 border-blue-200', icon: Info, label: '참고' },
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* 현재 에피소드 */}
      <div className="rounded-md bg-muted/50 px-3 py-2">
        <span className="text-xs text-muted-foreground">현재 원고</span>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground">
          {episode.title || '(제목 없음)'}
        </p>
      </div>

      {!episode.content ? (
        <div className="rounded-md bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">
          원고 내용이 없습니다. 먼저 원고를 작성해주세요.
        </div>
      ) : (
        <>
          {/* 검수 시작 버튼 */}
          <button
            type="button"
            onClick={handleReview}
            disabled={state === 'loading'}
            className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {state === 'loading' ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                검수 진행 중...
              </>
            ) : (
              <>
                <Search size={13} strokeWidth={1.75} />
                검수 시작
              </>
            )}
          </button>

          {state === 'loading' && (
            <p className="text-center text-xs text-muted-foreground">
              설정집과 이전 맥락을 대조하여 원고를 검수합니다.
              <br />
              최대 1분 정도 소요될 수 있습니다.
            </p>
          )}
        </>
      )}

      {/* 검수 결과 */}
      {state === 'done' && result && (
        <div className="flex flex-col gap-3">
          {/* 점수 + 요약 */}
          <div className="rounded-md border border-border bg-background p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">검수 점수</span>
              <span className={cn(
                'text-lg font-bold',
                result.score >= 80 ? 'text-emerald-600' : result.score >= 50 ? 'text-amber-600' : 'text-red-600',
              )}>
                {result.score}
                <span className="text-xs font-normal text-muted-foreground">/100</span>
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{result.summary}</p>
          </div>

          {/* 이슈 목록 */}
          {result.issues.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
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
                return (
                  <div key={i} className={cn('rounded-md border p-3', severity.bg)}>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <SeverityIcon size={14} strokeWidth={1.75} />
                      <span className="text-xs font-semibold">{severity.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {ISSUE_TYPE_LABELS[issue.type] ?? issue.type}
                      </span>
                    </div>
                    {issue.location && (
                      <p className="mb-1 rounded bg-white/60 px-2 py-1 text-xs italic text-foreground/80">
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 에러 */}
      {state === 'error' && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
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
}: {
  panel: AuxPanelItem;
  onRemove: () => void;
  onToggleCollapse: () => void;
  onOpenInMain: () => void;
  onAddPanel: (item: Omit<AuxPanelItem, 'id' | 'collapsed'>, index?: number) => void;
  mainSection: WorkspaceSection | null;
  mainItemId: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: panel.id });
  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [contentHeight, setContentHeight] = useState(PANEL_DEFAULT_H);
  const [editMode, setEditMode] = useState(false);
  const lockedReadOnly = isSameAsMain(panel, mainSection, mainItemId);
  const showEditor = editMode && !lockedReadOnly;

  // 패널 접기 시 편집 모드 해제
  const handleToggleCollapse = () => {
    if (!panel.collapsed) setEditMode(false);
    onToggleCollapse();
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} data-panel-id={panel.id}>
      <div className={cn(
        'rounded-md border bg-background',
        showEditor ? 'border-primary/30' : 'border-border',
      )}>
        <div className="flex items-center gap-1 border-b border-border/50 px-2 py-1.5">
          <span
            {...listeners}
            className="cursor-grab text-muted-foreground hover:text-foreground"
          >
            <GripVertical size={12} />
          </span>
          <button
            type="button"
            onClick={handleToggleCollapse}
            className="text-muted-foreground hover:text-foreground"
          >
            {panel.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {panel.title || '(제목 없음)'}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {AUX_DOC_LABELS[panel.docType]}
          </span>
          {lockedReadOnly ? (
            <span className="shrink-0 text-[9px] text-amber-500">읽기 전용</span>
          ) : (
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              title={editMode ? '보기 모드' : '편집 모드'}
              className={cn(
                'shrink-0 rounded p-0.5 transition-colors',
                editMode
                  ? 'text-primary hover:bg-primary/10'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              aria-label={editMode ? '보기 모드로 전환' : '편집 모드로 전환'}
            >
              {editMode ? <Eye size={12} /> : <Pencil size={12} />}
            </button>
          )}
          {panel.docType !== 'plot' && (
            <button
              type="button"
              onClick={onOpenInMain}
              title="본문으로 열기"
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
              aria-label="본문으로 열기"
            >
              <ArrowUpRight size={12} />
            </button>
          )}
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
              className={showEditor ? 'flex flex-col' : 'overflow-y-auto'}
            >
              {showEditor ? (
                <AuxDocEditable
                  docType={panel.docType}
                  docId={panel.docId}
                />
              ) : (
                <AuxDocViewer
                  docType={panel.docType}
                  docId={panel.docId}
                  onAddPanel={onAddPanel}
                />
              )}
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

/* ── 편집 가능 패널 본문 ── */

function AuxDocEditable({ docType, docId }: { docType: AuxDocType; docId: string }) {
  const { data: rows = [] } = useQuery<{ content: string | null }>(
    DOC_CONTENT_QUERIES[docType],
    [docId],
  );
  const {
    updateEpisode, updateWorldNoteContent, updatePlanNoteContent,
    updateCharacterNoteContent, updatePlot, updateForeshadow,
  } = useLocalWrite();

  const loaded = rows.length > 0;
  const content = rows[0]?.content ?? null;

  const handleUpdate = (json: string) => {
    switch (docType) {
      case 'episode':        return void updateEpisode(docId, { content: json });
      case 'world_note':     return void updateWorldNoteContent(docId, json);
      case 'plan_note':      return void updatePlanNoteContent(docId, json);
      case 'character_note': return void updateCharacterNoteContent(docId, json);
      case 'plot':           return void updatePlot(docId, { content: json });
      case 'foreshadow':     return void updateForeshadow(docId, { content: json });
    }
  };

  // useQuery 로딩 완료 후에만 ContentEditor를 마운트 (initialContent가 확정된 상태)
  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        불러오는 중…
      </div>
    );
  }

  return (
    <ContentEditor
      key={docId}
      itemId={docId}
      initialContent={content}
      placeholder="내용을 입력하세요…"
      onUpdate={handleUpdate}
      debounceMs={1500}
      showStatusBar={false}
      compact
    />
  );
}

const DOC_CONTENT_QUERIES: Record<AuxDocType, string> = {
  episode: 'SELECT content FROM episode WHERE id = ?',
  world_note: 'SELECT content FROM world_note WHERE id = ?',
  plan_note: 'SELECT content FROM plan_note WHERE id = ?',
  character_note: 'SELECT content FROM character_note WHERE id = ?',
  plot: 'SELECT content FROM plot WHERE id = ?',
  character: 'SELECT content FROM character WHERE id = ?',
  foreshadow: 'SELECT content FROM foreshadow WHERE id = ?',
};

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
