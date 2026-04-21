import { useMemo, useState, useEffect, useCallback } from 'react';
import { useQuery } from '@powersync/react';
import {
  ChevronDown,
  ChevronRight,
  Link2,
  Link2Off,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
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
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { cn } from '../../lib/cn';
import type { WorkspaceSection } from '../../types/workspace';

interface PlotOverviewProps {
  workId: string;
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

const STATUS_COLOR: Record<string, string> = {
  '예정': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  '작성중': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '완료': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const STATUS_OPTIONS = ['예정', '작성중', '완료'];

export function PlotOverview({ workId, onNavigateTo }: PlotOverviewProps) {
  const writerId = useWriterId();
  const { createPlot } = useLocalWrite();
  const [collapsedActs, setCollapsedActs] = useState<Set<string>>(new Set());

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
        trailing={<Button onClick={() => void handleNewAct()}>+ 새 막</Button>}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {acts.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            아직 플롯이 없습니다. 새 막을 추가하여 줄거리를 설계하세요.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {acts.map((act) => (
              <ActSection
                key={act.id}
                workId={workId}
                act={act}
                episodes={episodesByAct.get(act.id) ?? []}
                linkByPlot={linkByPlot}
                isCollapsed={collapsedActs.has(act.id)}
                onToggle={() => toggleCollapse(act.id)}
                onNewEpisode={() => void handleNewEpisode(act.id)}
                onNavigateTo={onNavigateTo}
              />
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
  onNavigateTo,
}: {
  workId: string;
  act: ActRow;
  episodes: PlotEpisodeRow[];
  linkByPlot: Map<string, LinkInfo>;
  isCollapsed: boolean;
  onToggle: () => void;
  onNewEpisode: () => void;
  onNavigateTo: (section: WorkspaceSection, itemId: string | null) => void;
}) {
  const { updatePlot, reorderItems, deletePlot } = useLocalWrite();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const title = useDeferredText(act.id, act.title, (v) => void updatePlot(act.id, { title: v }));

  const actContentText = useMemo(() => extractPlainText(act.content), [act.content]);
  const [actDraft, setActDraft] = useState(actContentText);

  useEffect(() => {
    setActDraft(extractPlainText(act.content));
  }, [act.content]);

  const commitActContent = useCallback(() => {
    const current = extractPlainText(act.content);
    if (actDraft === current) return;
    const json = plainTextToTiptap(actDraft);
    void updatePlot(act.id, { content: JSON.stringify(json) });
  }, [actDraft, act.content, act.id, updatePlot]);

  return (
    <div className="rounded-lg border border-border bg-background shadow-sm">
      {/* 막 헤더 */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
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
          onClick={() => void deletePlot(act.id)}
          title="막 삭제"
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* 막 설명 — 항상 표시 */}
      <div className="border-b border-border/50 px-4 py-2">
        <textarea
          value={actDraft}
          onChange={(e) => setActDraft(e.target.value)}
          onBlur={commitActContent}
          placeholder="막에 대한 설명을 입력하세요…"
          rows={2}
          className="w-full resize-none bg-transparent text-xs leading-relaxed text-foreground/80 outline-none placeholder:text-muted-foreground"
        />
      </div>

      {!isCollapsed && (
        <>
          {/* 타임라인 회차 리스트 */}
          <div className="p-4">
            <div className="relative">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
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
                      onNavigateTo={onNavigateTo}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {/* + 새 회차 추가 */}
              <div className="relative pl-7">
                {episodes.length > 0 && (
                  <div className="absolute bottom-1/2 left-[7px] top-0 w-px bg-border" />
                )}
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
          </div>
        </>
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
  onNavigateTo: (section: WorkspaceSection, itemId: string | null) => void;
}

function SortableTimelineCard(props: TimelineCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.episode.id });
  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TimelineCard {...props} dragListeners={listeners} />
    </div>
  );
}

function TimelineCard({
  workId,
  actTitle,
  episode,
  link,
  isLast,
  onNavigateTo,
  dragListeners,
}: TimelineCardProps & {
  dragListeners?: Record<string, unknown>;
}) {
  const { updatePlot, createEpisode, linkPlotEpisode, unlinkPlotEpisode, deletePlot } = useLocalWrite();
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const title = useDeferredText(
    episode.id,
    episode.title,
    (v) => void updatePlot(episode.id, { title: v }),
  );

  const contentText = useMemo(() => extractPlainText(episode.content), [episode.content]);
  const [draft, setDraft] = useState(contentText);

  useEffect(() => {
    setDraft(extractPlainText(episode.content));
  }, [episode.content]);

  const commitContent = () => {
    const current = extractPlainText(episode.content);
    if (draft === current) return;
    const json = plainTextToTiptap(draft);
    void updatePlot(episode.id, { content: JSON.stringify(json) });
  };

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
    <div className="relative pb-4 pl-7">
      {/* 타임라인 세로선 */}
      {!isLast && (
        <div className="absolute bottom-0 left-[7px] top-0 w-px bg-border" />
      )}
      {isLast && (
        <div className="absolute left-[7px] top-0 h-4 w-px bg-border" />
      )}

      {/* 타임라인 도트 */}
      <div
        className={cn(
          'absolute left-[3px] top-3 h-2.5 w-2.5 rounded-full border-2',
          episode.status === '완료'
            ? 'border-green-500 bg-green-500'
            : episode.status === '작성중'
              ? 'border-blue-500 bg-background'
              : 'border-primary bg-background',
        )}
      />

      {/* 카드 */}
      <div
        {...dragListeners}
        className="cursor-grab rounded-lg border border-border bg-card p-3 transition-shadow hover:shadow-sm active:cursor-grabbing"
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
          <>
            {/* 플롯 내용 */}
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitContent}
              placeholder="플롯 내용을 입력하세요…"
              rows={2}
              className="mt-2 w-full resize-none bg-transparent text-xs leading-relaxed text-foreground/80 outline-none placeholder:text-muted-foreground"
            />
          </>
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

function extractPlainText(raw: string | null): string {
  if (!raw) return '';
  try {
    const json = JSON.parse(raw);
    if (!json.content) return '';
    return json.content
      .map((node: { content?: { text?: string }[] }) =>
        node.content?.map((c) => c.text ?? '').join('') ?? '',
      )
      .join('\n');
  } catch {
    return '';
  }
}

function plainTextToTiptap(text: string) {
  const lines = text.split('\n');
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  };
}
