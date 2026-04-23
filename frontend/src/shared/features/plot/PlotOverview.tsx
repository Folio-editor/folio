import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@powersync/react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import {
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  Link2,
  Link2Off,
  List,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  type Modifier,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { DeleteConfirmDialog } from '../../components/ui/DeleteConfirmDialog';
import { cn } from '../../lib/cn';
import type { WorkspaceSection } from '../../types/workspace';

interface PlotOverviewProps {
  workId: string;
  selectedItemId: string | null;
  onNavigateTo: (section: WorkspaceSection, itemId: string | null) => void;
}

interface ActRow {
  id: string;
  title: string;
  content: string | null;
}

interface PlotEpisodeRow {
  id: string;
  parent_id: string;
  title: string;
  status: string | null;
  content: string | null;
}

interface LinkInfo {
  linkId: string;
  episodeId: string;
  episodeTitle: string;
}

interface LinkRow {
  plot_id: string;
  link_id: string;
  episode_id: string;
  episode_title: string;
}

interface UnlinkedEpisodeRow {
  id: string;
  title: string;
}

/* 드래그를 수직 방향으로만 제한 */
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

/* input/textarea/button 등 인터랙티브 요소에서는 카드 드래그를 비활성화 */
class SmartPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent }: { nativeEvent: PointerEvent }) => {
        const target = nativeEvent.target as HTMLElement;
        if (target.closest('input, textarea, select, [contenteditable]')) {
          return false;
        }
        return true;
      },
    },
  ];
}

const STATUS_COLOR: Record<string, string> = {
  '예정': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  '작성중': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '완료': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const STATUS_OPTIONS = ['예정', '작성중', '완료'];

export function PlotOverview({ workId, selectedItemId, onNavigateTo }: PlotOverviewProps) {
  const writerId = useWriterId();
  const { createPlot, reorderItems } = useLocalWrite();
  const [collapsedActs, setCollapsedActs] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const actRefs = useRef(new Map<string, HTMLElement>());
  const episodeRefs = useRef(new Map<string, HTMLDivElement>());
  const gridSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const { data: acts = [] } = useQuery<ActRow>(
    `SELECT id, title, content FROM plot
     WHERE work_id = ? AND writer_id = ? AND parent_id IS NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [workId, writerId],
  );

  const { data: episodes = [] } = useQuery<PlotEpisodeRow>(
    `SELECT id, parent_id, title, status, content FROM plot
     WHERE work_id = ? AND writer_id = ? AND parent_id IS NOT NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [workId, writerId],
  );

  const { data: links = [] } = useQuery<LinkRow>(
    `SELECT pel.plot_id, pel.id AS link_id, pel.episode_id AS episode_id, e.title AS episode_title
     FROM plot_episode_link pel
     JOIN episode e ON e.id = pel.episode_id`,
  );

  const episodesByAct = useMemo(() => {
    const map = new Map<string, PlotEpisodeRow[]>();
    for (const ep of episodes) {
      if (!map.has(ep.parent_id)) map.set(ep.parent_id, []);
      map.get(ep.parent_id)!.push(ep);
    }
    return map;
  }, [episodes]);

  const linkByPlot = useMemo(() => {
    const map = new Map<string, LinkInfo>();
    for (const l of links) {
      map.set(l.plot_id, {
        linkId: l.link_id,
        episodeId: l.episode_id,
        episodeTitle: l.episode_title,
      });
    }
    return map;
  }, [links]);

  const registerActRef = useCallback((actId: string, node: HTMLElement | null) => {
    if (node) actRefs.current.set(actId, node);
    else actRefs.current.delete(actId);
  }, []);

  const registerEpisodeRef = useCallback((episodeId: string, node: HTMLDivElement | null) => {
    if (node) episodeRefs.current.set(episodeId, node);
    else episodeRefs.current.delete(episodeId);
  }, []);

  useEffect(() => {
    if (!selectedItemId) return;
    const selectedEpisode = episodes.find((episode) => episode.id === selectedItemId);
    if (!selectedEpisode) return;

    setCollapsedActs((prev) => {
      if (!prev.has(selectedEpisode.parent_id)) return prev;
      const next = new Set(prev);
      next.delete(selectedEpisode.parent_id);
      return next;
    });
  }, [episodes, selectedItemId]);

  useEffect(() => {
    if (!selectedItemId) return;

    const scrollTarget =
      episodeRefs.current.get(selectedItemId) ?? actRefs.current.get(selectedItemId);
    if (!scrollTarget) return;

    const frameId = window.requestAnimationFrame(() => {
      scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [acts, collapsedActs, episodes, selectedItemId, viewMode]);

  const toggleCollapse = (actId: string) => {
    setCollapsedActs((prev) => {
      const next = new Set(prev);
      if (next.has(actId)) next.delete(actId);
      else next.add(actId);
      return next;
    });
  };

  const handleNewAct = async () => {
    const title = `${acts.length + 1}막`;
    await createPlot(workId, title, acts.length);
  };

  const handleNewEpisode = async (actId: string) => {
    const siblings = episodesByAct.get(actId) ?? [];
    const title = `${siblings.length + 1}화`;
    await createPlot(workId, title, siblings.length, actId);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MainPanelHeader
        title={<h2 className="text-lg font-semibold">플롯</h2>}
        subtitle="줄거리 구조와 회차별 전개를 설계합니다"
        trailing={
          <div className="flex items-center gap-2">
            <ViewToggle mode={viewMode} onChange={setViewMode} />
            <Button onClick={() => void handleNewAct()}>+ 새 막</Button>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {acts.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            아직 플롯이 없습니다. 새 막을 추가하여 줄거리를 설계하세요.
          </p>
        ) : viewMode === 'grid' ? (
          <DndContext
            sensors={gridSensors}
            collisionDetection={closestCenter}
            onDragEnd={(event: DragEndEvent) => {
              const { active, over } = event;
              if (!over || active.id === over.id) return;
              const oldIndex = acts.findIndex((act) => act.id === active.id);
              const newIndex = acts.findIndex((act) => act.id === over.id);
              if (oldIndex === -1 || newIndex === -1) return;
              const reordered = arrayMove(acts, oldIndex, newIndex);
              void reorderItems(
                'plot',
                reordered.map((act, index) => ({ id: act.id, sortOrder: index * 1000 })),
              );
            }}
          >
            <SortableContext items={acts.map((act) => act.id)} strategy={rectSortingStrategy}>
              <div className="flex flex-wrap items-start gap-4">
                {acts.map((act) => (
                  <SortableActGridSection
                    key={act.id}
                    workId={workId}
                    act={act}
                    episodes={episodesByAct.get(act.id) ?? []}
                    selectedItemId={selectedItemId}
                    registerActRef={registerActRef}
                    registerEpisodeRef={registerEpisodeRef}
                    isCollapsed={collapsedActs.has(act.id)}
                    onToggle={() => toggleCollapse(act.id)}
                    onNewEpisode={() => void handleNewEpisode(act.id)}
                    onNavigateTo={onNavigateTo}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="flex flex-col">
            {acts.map((act, i) => (
              <div key={act.id}>
                <ActSection
                  workId={workId}
                  act={act}
                  episodes={episodesByAct.get(act.id) ?? []}
                  linkByPlot={linkByPlot}
                  isCollapsed={collapsedActs.has(act.id)}
                  onToggle={() => toggleCollapse(act.id)}
                  onNewEpisode={() => void handleNewEpisode(act.id)}
                  selectedItemId={selectedItemId}
                  registerActRef={registerActRef}
                  registerEpisodeRef={registerEpisodeRef}
                  onNavigateTo={onNavigateTo}
                />
                {i < acts.length - 1 && (
                  <div className="my-6 h-px bg-linear-to-r from-transparent via-border to-transparent" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 막 섹션 ── */

function ActSection({
  workId,
  act,
  episodes,
  linkByPlot,
  isCollapsed,
  onToggle,
  onNewEpisode,
  selectedItemId,
  registerActRef,
  registerEpisodeRef,
  onNavigateTo,
}: {
  workId: string;
  act: ActRow;
  episodes: PlotEpisodeRow[];
  linkByPlot: Map<string, LinkInfo>;
  isCollapsed: boolean;
  onToggle: () => void;
  onNewEpisode: () => void;
  selectedItemId: string | null;
  registerActRef: (actId: string, node: HTMLElement | null) => void;
  registerEpisodeRef: (episodeId: string, node: HTMLDivElement | null) => void;
  onNavigateTo: (section: WorkspaceSection, itemId: string | null) => void;
}) {
  const { updatePlot, reorderItems, deletePlot } = useLocalWrite();
  const sensors = useSensors(
    useSensor(SmartPointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const title = useDeferredText(act.id, act.title, (v) => void updatePlot(act.id, { title: v }));

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const actDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actUpdateRef = useRef(updatePlot);
  actUpdateRef.current = updatePlot;

  const actEditor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({ code: false, codeBlock: false }),
        Placeholder.configure({ placeholder: '막에 대한 설명을 입력하세요…' }),
        Highlight.configure({ multicolor: false }),
      ],
      content: parseNoteContent(act.content),
      onUpdate: ({ editor: ed }) => {
        if (actDebounceRef.current) clearTimeout(actDebounceRef.current);
        actDebounceRef.current = setTimeout(() => {
          const json = JSON.stringify(ed.getJSON());
          void actUpdateRef.current(act.id, { content: json });
        }, 800);
      },
    },
    [],
  );

  useEffect(() => {
    if (actDebounceRef.current) {
      clearTimeout(actDebounceRef.current);
      actDebounceRef.current = null;
    }
    if (!actEditor || actEditor.isDestroyed) return;
    actEditor.commands.setContent(parseNoteContent(act.content), { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act.id]);

  useEffect(() => {
    return () => {
      if (actDebounceRef.current) clearTimeout(actDebounceRef.current);
    };
  }, []);

  const hasContent = actEditor ? actEditor.state.doc.textContent.length > 0 : !!act.content;

  return (
    <div
      ref={(node) => registerActRef(act.id, node)}
      className="relative"
    >
      {/* ── 막 헤더 (타임라인 도트 포함) ── */}
      <div className="relative flex items-center gap-2 py-3 pl-7">
        {/* 막 시작 도트 */}
        <div className={cn(
          'absolute left-[2px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-primary bg-primary',
        )} />
        {/* 선택 시 펄스 링 */}
        {selectedItemId === act.id && (
          <div className="absolute left-[-1px] top-1/2 h-4 w-4 -translate-y-1/2 animate-ping rounded-full bg-primary/40" />
        )}
        {/* 헤더 → 본문/회차로 이어지는 세로선 (도트 아래부터 시작) */}
        {(!isCollapsed || hasContent) && (
          <div className="absolute bottom-0 left-[7px] top-[calc(50%+8px)] w-px bg-border" />
        )}

        <button
          type="button"
          onClick={onToggle}
          className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>

        <input
          type="text"
          value={title.value}
          onChange={(e) => title.onChange(e.target.value)}
          onBlur={title.onBlur}
          placeholder="막 제목"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground"
        />

        <span className="shrink-0 text-xs text-muted-foreground">{episodes.length}개</span>

        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          title="막 삭제"
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* ── 막 설명 (세로선 연결, 위지윅 에디터) ── */}
      <div className="relative pl-7 pb-2">
        {/* 세로선: 본문 영역 */}
        <div className="absolute left-[7px] top-0 bottom-0 w-px bg-border" />
        <EditorContent
          editor={actEditor}
          className="plot-inline-editor prose prose-sm max-w-none text-xs leading-relaxed text-foreground/80 [&_.tiptap]:outline-none [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground/40 [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:h-0"
        />
      </div>

      {confirmDelete && (
        <DeleteConfirmDialog
          title="막 삭제"
          message={`"${act.title || '(제목 없음)'}" 막과 하위 ${episodes.length}개 회차가 모두 삭제됩니다.`}
          busy={deleteBusy}
          onConfirm={() => {
            setDeleteBusy(true);
            void Promise.resolve(deletePlot(act.id)).then(() => {
              setDeleteBusy(false);
              setConfirmDelete(false);
            });
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {!isCollapsed && (
        <div className="relative">
          {/* 고정 세로선 — 회차 영역 전체를 관통, 드래그해도 움직이지 않음 */}
          <div className="pointer-events-none absolute bottom-0 left-[7px] top-0 w-px bg-border" />

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={(event: DragEndEvent) => {
              const { active, over } = event;
              if (!over || active.id === over.id) return;
              const oldIndex = episodes.findIndex((e) => e.id === active.id);
              const newIndex = episodes.findIndex((e) => e.id === over.id);
              if (oldIndex === -1 || newIndex === -1) return;
              const reordered = arrayMove(episodes, oldIndex, newIndex);
              void reorderItems(
                'plot',
                reordered.map((e, i) => ({ id: e.id, sortOrder: i * 1000 })),
              );
            }}
          >
            <SortableContext items={episodes.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              {episodes.map((ep, i) => (
                <SortableTimelineCard
                  key={ep.id}
                  workId={workId}
                  actTitle={act.title}
                  episode={ep}
                  link={linkByPlot.get(ep.id)}
                  isLast={i === episodes.length - 1}
                  selected={selectedItemId === ep.id}
                  registerEpisodeRef={registerEpisodeRef}
                  onNavigateTo={onNavigateTo}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* + 새 회차 추가 */}
          <div className="relative pl-7">
            <div className="absolute left-[3px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-dashed border-muted-foreground" />
            <button
              type="button"
              onClick={onNewEpisode}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              <Plus size={14} />
              <span>새 회차 추가</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 타임라인 카드 (Sortable wrapper) ── */

interface TimelineCardProps {
  workId: string;
  actTitle: string;
  episode: PlotEpisodeRow;
  link?: LinkInfo;
  isLast: boolean;
  selected: boolean;
  registerEpisodeRef: (episodeId: string, node: HTMLDivElement | null) => void;
  onNavigateTo: (section: WorkspaceSection, itemId: string | null) => void;
}

function SortableTimelineCard(props: TimelineCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.episode.id });
  const style = {
    transform: transform
      ? `translate3d(0, ${transform.y}px, 0)`
      : undefined,
    transition,
    position: 'relative' as const,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TimelineCard {...props} dragListeners={listeners} isDragging={isDragging} />
    </div>
  );
}

function TimelineCard({
  workId,
  actTitle,
  episode,
  link,
  isLast,
  selected,
  registerEpisodeRef,
  onNavigateTo,
  dragListeners,
  isDragging = false,
}: TimelineCardProps & {
  dragListeners?: Record<string, unknown>;
  isDragging?: boolean;
}) {
  const { updatePlot, createEpisode, linkPlotEpisode, unlinkPlotEpisode, deletePlot } = useLocalWrite();
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  const title = useDeferredText(
    episode.id,
    episode.title,
    (v) => void updatePlot(episode.id, { title: v }),
  );

  const epDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const epUpdateRef = useRef(updatePlot);
  epUpdateRef.current = updatePlot;

  const epEditor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({ code: false, codeBlock: false }),
        Placeholder.configure({ placeholder: '플롯 내용을 입력하세요…' }),
        Highlight.configure({ multicolor: false }),
      ],
      content: parseNoteContent(episode.content),
      onUpdate: ({ editor: ed }) => {
        if (epDebounceRef.current) clearTimeout(epDebounceRef.current);
        epDebounceRef.current = setTimeout(() => {
          const json = JSON.stringify(ed.getJSON());
          void epUpdateRef.current(episode.id, { content: json });
        }, 800);
      },
    },
    [],
  );

  useEffect(() => {
    if (epDebounceRef.current) {
      clearTimeout(epDebounceRef.current);
      epDebounceRef.current = null;
    }
    if (!epEditor || epEditor.isDestroyed) return;
    epEditor.commands.setContent(parseNoteContent(episode.content), { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode.id]);

  useEffect(() => {
    return () => {
      if (epDebounceRef.current) clearTimeout(epDebounceRef.current);
    };
  }, []);

  const cycleStatus = () => {
    const idx = STATUS_OPTIONS.indexOf(episode.status ?? '예정');
    const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
    void updatePlot(episode.id, { status: next });
  };

  const handleCreateEpisodeAndLink = async () => {
    const epTitle = `${actTitle} ${episode.title}`;
    const epId = await createEpisode(workId, epTitle, Date.now());
    await linkPlotEpisode(episode.id, epId);
  };

  const handleUnlink = async () => {
    if (!link) return;
    await unlinkPlotEpisode(link.linkId);
  };

  const handleLinkSelected = async (episodeId: string) => {
    await linkPlotEpisode(episode.id, episodeId);
    setShowLinkModal(false);
  };

  return (
    <div
      ref={(node) => registerEpisodeRef(episode.id, node)}
      className="relative pb-4 pl-7"
    >
      {/* 타임라인 도트 — 카드와 함께 이동, 세로선은 부모에서 고정 렌더링 */}
      <div
        className={cn(
          'absolute left-[3px] top-3 z-[1] h-2.5 w-2.5 rounded-full border-2 transition-transform',
          episode.status === '완료'
            ? 'border-green-500 bg-green-500'
            : episode.status === '작성중'
              ? 'border-blue-500 bg-background'
              : 'border-primary bg-background',
          isDragging && 'scale-150 ring-2 ring-primary/30',
        )}
      />
      {/* 카드 */}
      <div
        {...dragListeners}
        className={cn(
          'cursor-grab rounded-lg border border-border bg-card p-3 transition-shadow hover:shadow-sm active:cursor-grabbing',
          isDragging && 'shadow-lg border-primary/40 bg-card',
          selected && !isDragging && 'ring-2 ring-primary/30',
        )}
      >
        {/* 상단: 토글 + 제목 + 상태 뱃지 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((p) => !p)}
            className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <input
            type="text"
            value={title.value}
            onChange={(e) => title.onChange(e.target.value)}
            onBlur={title.onBlur}
            placeholder="제목"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
          />
          {episode.status && (
            <button
              type="button"
              onClick={cycleStatus}
              title="클릭하여 상태 변경"
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors',
                STATUS_COLOR[episode.status] ?? 'bg-muted',
              )}
            >
              {episode.status}
            </button>
          )}
        </div>

        {!collapsed && (
          <div className="mt-2">
            <EditorContent
              editor={epEditor}
              className="plot-inline-editor prose prose-sm max-w-none text-xs leading-relaxed text-foreground/80 [&_.tiptap]:outline-none [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground/40 [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:h-0"
            />
          </div>
        )}

        {/* 액션 버튼 */}
        {!collapsed && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2">
          {link ? (
            <>
              <button
                type="button"
                onClick={() => onNavigateTo('episode', link.episodeId)}
                className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
              >
                <Pencil size={11} />
                원고 보기
              </button>
              <span className="inline-flex items-center gap-1 rounded border border-primary/15 bg-primary/5 px-1.5 py-0.5 text-[10px] text-primary/80">
                <Link2 size={10} />
                {link.episodeTitle}
              </span>
              <button
                type="button"
                onClick={() => void handleUnlink()}
                title={`연결된 원고: ${link.episodeTitle}`}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Link2Off size={10} />
                연결 해제
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void handleCreateEpisodeAndLink()}
                className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
              >
                <Plus size={11} />
                원고생성
              </button>
              <button
                type="button"
                onClick={() => setShowLinkModal(true)}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Link2 size={10} />
                원고 연결
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => void deletePlot(episode.id)}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 size={10} />
            삭제
          </button>
        </div>
        )}
      </div>

      {showLinkModal && (
        <EpisodeLinkModal
          workId={workId}
          onSelect={handleLinkSelected}
          onClose={() => setShowLinkModal(false)}
        />
      )}
    </div>
  );
}

/* ── 원고 연결 모달 ── */

function SortableActGridSection(props: {
  workId: string;
  act: ActRow;
  episodes: PlotEpisodeRow[];
  selectedItemId: string | null;
  registerActRef: (actId: string, node: HTMLElement | null) => void;
  registerEpisodeRef: (episodeId: string, node: HTMLDivElement | null) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  onNewEpisode: () => void;
  onNavigateTo: (section: WorkspaceSection, itemId: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.act.id });
  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      className="basis-full cursor-grab md:basis-[calc(50%-0.5rem)] 2xl:basis-[calc(33.333%-0.667rem)] active:cursor-grabbing"
    >
      <ActGridSection {...props} />
    </div>
  );
}

function ActGridSection({
  workId,
  act,
  episodes,
  selectedItemId,
  registerActRef,
  registerEpisodeRef,
  isCollapsed,
  onToggle,
  onNewEpisode,
  onNavigateTo,
}: {
  workId: string;
  act: ActRow;
  episodes: PlotEpisodeRow[];
  selectedItemId: string | null;
  registerActRef: (actId: string, node: HTMLElement | null) => void;
  registerEpisodeRef: (episodeId: string, node: HTMLDivElement | null) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  onNewEpisode: () => void;
  onNavigateTo: (section: WorkspaceSection, itemId: string | null) => void;
}) {
  const { updatePlot, reorderItems } = useLocalWrite();
  const previewEpisodes = episodes;
  const episodeSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const gridActDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridActUpdateRef = useRef(updatePlot);
  gridActUpdateRef.current = updatePlot;

  const gridActEditor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({ code: false, codeBlock: false }),
        Placeholder.configure({ placeholder: '막에 대한 설명을 입력하세요…' }),
        Highlight.configure({ multicolor: false }),
      ],
      content: parseNoteContent(act.content),
      onUpdate: ({ editor: ed }) => {
        if (gridActDebounceRef.current) clearTimeout(gridActDebounceRef.current);
        gridActDebounceRef.current = setTimeout(() => {
          const json = JSON.stringify(ed.getJSON());
          void gridActUpdateRef.current(act.id, { content: json });
        }, 800);
      },
    },
    [],
  );

  useEffect(() => {
    if (gridActDebounceRef.current) {
      clearTimeout(gridActDebounceRef.current);
      gridActDebounceRef.current = null;
    }
    if (!gridActEditor || gridActEditor.isDestroyed) return;
    gridActEditor.commands.setContent(parseNoteContent(act.content), { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act.id]);

  useEffect(() => {
    return () => {
      if (gridActDebounceRef.current) clearTimeout(gridActDebounceRef.current);
    };
  }, []);

  return (
    <section
      ref={(node) => registerActRef(act.id, node)}
      className={cn(
        'flex h-fit flex-col self-start rounded-xl border border-border bg-background p-4 shadow-sm',
        selectedItemId === act.id && 'ring-2 ring-primary/30',
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onToggle}
            className="mr-2 inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle text-muted-foreground transition-colors hover:text-foreground"
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <h3 className="mt-1 text-base font-semibold text-foreground">
            {act.title?.trim() || '(제목 없음)'}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{episodes.length}개 회차</p>
        </div>
      </div>

      {!isCollapsed && (
        <>
      <div className="mb-4 rounded-lg border border-border/70 bg-card/40 px-3 py-2">
        <EditorContent
          editor={gridActEditor}
          className="plot-inline-editor prose prose-sm max-w-none text-xs leading-relaxed text-foreground/80 [&_.tiptap]:outline-none [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground/40 [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:h-0"
        />
      </div>

      <div className="rounded-lg border border-border/70 bg-card/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium text-foreground/80">회차 미리보기</span>
          {episodes.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{episodes.length - 3}</span>
          )}
        </div>

        {previewEpisodes.length === 0 ? (
          <div className="flex h-full min-h-28 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
            아직 회차가 없습니다.
          </div>
        ) : (
          <DndContext
            sensors={episodeSensors}
            collisionDetection={closestCenter}
            onDragEnd={(event: DragEndEvent) => {
              const { active, over } = event;
              if (!over || active.id === over.id) return;
              const oldIndex = previewEpisodes.findIndex((episode) => episode.id === active.id);
              const newIndex = previewEpisodes.findIndex((episode) => episode.id === over.id);
              if (oldIndex === -1 || newIndex === -1) return;
              const reordered = arrayMove(previewEpisodes, oldIndex, newIndex);
              void reorderItems(
                'plot',
                reordered.map((episode, index) => ({ id: episode.id, sortOrder: index * 1000 })),
              );
            }}
          >
            <SortableContext items={previewEpisodes.map((episode) => episode.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col">
                {previewEpisodes.map((episode, i) => (
                  <SortableActGridEpisodeCard
                    key={episode.id}
                    workId={workId}
                    actTitle={act.title}
                    episode={episode}
                    selected={selectedItemId === episode.id}
                    isLast={i === previewEpisodes.length - 1}
                    registerEpisodeRef={registerEpisodeRef}
                    onNavigateTo={onNavigateTo}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => onNavigateTo('plot', act.id)}>
          막 보기
        </Button>
        <Button size="sm" onClick={onNewEpisode}>
          <Plus className="h-4 w-4" /> 새 회차
        </Button>
      </div>
        </>
      )}
    </section>
  );
}

function SortableActGridEpisodeCard(props: {
  workId: string;
  actTitle: string;
  episode: PlotEpisodeRow;
  selected: boolean;
  isLast: boolean;
  registerEpisodeRef: (episodeId: string, node: HTMLDivElement | null) => void;
  onNavigateTo: (section: WorkspaceSection, itemId: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.episode.id });
  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      className="relative cursor-grab pb-3 pl-7 active:cursor-grabbing"
    >
      {/* 타임라인 세로선 */}
      {!props.isLast && (
        <div className="absolute bottom-0 left-[7px] top-0 w-px bg-border" />
      )}
      {props.isLast && (
        <div className="absolute left-[7px] top-0 h-4 w-px bg-border" />
      )}
      {/* 타임라인 도트 */}
      <div
        className={cn(
          'absolute left-[3px] top-3 h-2.5 w-2.5 rounded-full border-2',
          props.episode.status === '완료'
            ? 'border-green-500 bg-green-500'
            : props.episode.status === '작성중'
              ? 'border-blue-500 bg-background'
              : 'border-primary bg-background',
        )}
      />
      <div
        ref={(node) => props.registerEpisodeRef(props.episode.id, node)}
        className={cn(
          'rounded-md border border-border bg-background px-2.5 py-2',
          props.selected && 'border-primary/30 bg-primary/5',
        )}
      >
        <ActGridEpisodeContentEditor
          workId={props.workId}
          actTitle={props.actTitle}
          episode={props.episode}
          onNavigateTo={props.onNavigateTo}
        />
      </div>
    </div>
  );
}

function ActGridEpisodeContentEditor({
  workId,
  actTitle,
  episode,
  onNavigateTo,
}: {
  workId: string;
  actTitle: string;
  episode: PlotEpisodeRow;
  onNavigateTo: (section: WorkspaceSection, itemId: string | null) => void;
}) {
  const { updatePlot, createEpisode, linkPlotEpisode, unlinkPlotEpisode, deletePlot } = useLocalWrite();
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const title = useDeferredText(
    episode.id,
    episode.title,
    (v) => void updatePlot(episode.id, { title: v }),
  );

  const gridEpDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridEpUpdateRef = useRef(updatePlot);
  gridEpUpdateRef.current = updatePlot;

  const gridEpEditor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({ code: false, codeBlock: false }),
        Placeholder.configure({ placeholder: '회차 내용을 입력하세요…' }),
        Highlight.configure({ multicolor: false }),
      ],
      content: parseNoteContent(episode.content),
      onUpdate: ({ editor: ed }) => {
        if (gridEpDebounceRef.current) clearTimeout(gridEpDebounceRef.current);
        gridEpDebounceRef.current = setTimeout(() => {
          const json = JSON.stringify(ed.getJSON());
          void gridEpUpdateRef.current(episode.id, { content: json });
        }, 800);
      },
    },
    [],
  );

  useEffect(() => {
    if (gridEpDebounceRef.current) {
      clearTimeout(gridEpDebounceRef.current);
      gridEpDebounceRef.current = null;
    }
    if (!gridEpEditor || gridEpEditor.isDestroyed) return;
    gridEpEditor.commands.setContent(parseNoteContent(episode.content), { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode.id]);

  useEffect(() => {
    return () => {
      if (gridEpDebounceRef.current) clearTimeout(gridEpDebounceRef.current);
    };
  }, []);

  const { data: linkRows = [] } = useQuery<LinkRow>(
    `SELECT pel.plot_id, pel.id AS link_id, pel.episode_id AS episode_id, e.title AS episode_title
     FROM plot_episode_link pel
     JOIN episode e ON e.id = pel.episode_id
     WHERE pel.plot_id = ?`,
    [episode.id],
  );
  const link = linkRows[0]
    ? {
        linkId: linkRows[0].link_id,
        episodeId: linkRows[0].episode_id,
        episodeTitle: linkRows[0].episode_title,
      }
    : undefined;

  const cycleStatus = () => {
    const idx = STATUS_OPTIONS.indexOf(episode.status ?? '예정');
    const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
    void updatePlot(episode.id, { status: next });
  };

  const handleCreateEpisodeAndLink = async () => {
    const epTitle = `${actTitle} ${episode.title}`;
    const epId = await createEpisode(workId, epTitle, Date.now());
    await linkPlotEpisode(episode.id, epId);
  };

  const handleLinkSelected = async (episodeId: string) => {
    await linkPlotEpisode(episode.id, episodeId);
    setShowLinkModal(false);
  };

  return (
    <>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed((prev) => !prev);
          }}
          className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <input
          type="text"
          value={title.value}
          onChange={(e) => title.onChange(e.target.value)}
          onBlur={title.onBlur}
          onClick={(e) => e.stopPropagation()}
          placeholder="회차 제목"
          className="min-w-0 flex-1 bg-transparent text-xs font-medium text-foreground outline-none placeholder:text-muted-foreground"
        />
        {episode.status && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              cycleStatus();
            }}
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
              STATUS_COLOR[episode.status] ?? 'bg-muted',
            )}
          >
            {episode.status}
          </button>
        )}
      </div>
      {!collapsed && (
        <>
      <div className="mt-2 rounded-md border border-border/70 bg-background px-2 py-1.5">
        <EditorContent
          editor={gridEpEditor}
          className="plot-inline-editor prose prose-sm max-w-none text-xs leading-relaxed text-foreground/80 [&_.tiptap]:outline-none [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground/40 [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:h-0"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2">
        {link ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateTo('episode', link.episodeId);
              }}
              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <Pencil size={11} />
              원고 보기
            </button>
            <span className="inline-flex items-center gap-1 rounded border border-primary/15 bg-primary/5 px-1.5 py-0.5 text-[10px] text-primary/80">
              <Link2 size={10} />
              {link.episodeTitle}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void unlinkPlotEpisode(link.linkId);
              }}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Link2Off size={10} />
              연결 해제
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleCreateEpisodeAndLink();
              }}
              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <Plus size={11} />
              원고 생성
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowLinkModal(true);
              }}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Link2 size={10} />
              원고 연결
            </button>
          </>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigateTo('plot', episode.id);
          }}
          className="hidden rounded-md px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          회차로 이동
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void deletePlot(episode.id);
          }}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={10} />
          삭제
        </button>
      </div>
        </>
      )}
      {showLinkModal && (
        <EpisodeLinkModal
          workId={workId}
          onSelect={handleLinkSelected}
          onClose={() => setShowLinkModal(false)}
        />
      )}
    </>
  );
}

function ViewToggle({
  mode,
  onChange,
}: {
  mode: 'grid' | 'list';
  onChange: (mode: 'grid' | 'list') => void;
}) {
  return (
    <div className="flex items-center rounded-md border border-border">
      <button
        type="button"
        onClick={() => onChange('grid')}
        title="그리드 보기"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-l-md transition-colors',
          mode === 'grid'
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <LayoutGrid size={14} />
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        title="리스트 보기"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-r-md transition-colors',
          mode === 'list'
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <List size={14} />
      </button>
    </div>
  );
}

function EpisodeLinkModal({
  workId,
  onSelect,
  onClose,
}: {
  workId: string;
  onSelect: (episodeId: string) => Promise<void>;
  onClose: () => void;
}) {
  const writerId = useWriterId();
  const [search, setSearch] = useState('');

  const { data: episodes = [] } = useQuery<UnlinkedEpisodeRow>(
    `SELECT e.id, e.title FROM episode e
     WHERE e.work_id = ? AND e.writer_id = ?
       AND e.status != 'trashed'
       AND e.id NOT IN (SELECT episode_id FROM plot_episode_link)
     ORDER BY e.sort_order ASC, e.created_at ASC`,
    [workId, writerId],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return episodes;
    return episodes.filter((e) => e.title.toLowerCase().includes(term));
  }, [episodes, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-80 rounded-lg border border-border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-sm font-semibold text-foreground">원고 연결</h3>

        <div className="relative mb-3">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder="원고 제목 검색"
            className="pl-7 text-xs"
          />
        </div>

        <div className="max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {episodes.length === 0 ? '연결 가능한 원고가 없습니다.' : '검색 결과가 없습니다.'}
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filtered.map((ep) => (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => void onSelect(ep.id)}
                  className="truncate rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-primary/10"
                >
                  {ep.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 유틸 ── */

function parseNoteContent(raw: string | null): object | string {
  if (!raw) return '';
  try {
    return JSON.parse(raw) as object;
  } catch {
    return '';
  }
}
