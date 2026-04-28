import { useEffect, useState, type KeyboardEvent } from 'react';
import { useQuery, usePowerSync } from '@powersync/react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  PanelRight,
  Pencil,
  Plus,
  SquareArrowOutUpRight,
  Trash2,
} from 'lucide-react';
import { useDroppable, type DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { useWriterId } from '../../../hooks/useWriterId';
import { useLocalWrite } from '../../../hooks/useLocalWrite';
import { useDelayedEmptyState } from '../../../hooks/useDelayedEmptyState';
import { useSidebarClickHandler } from '../../../lib/sidebarClickHandler';
import { cn } from '../../../lib/cn';
import { useDragZoneStore } from '../../../lib/dragZoneStore';
import { useOptimisticRows } from '../../../lib/useOptimisticRows';
import {
  buildOrderBy,
  useSortPreferenceStore,
} from '../../../stores/sortPreferenceStore';
import {
  buildInClause,
  useFilterPreferenceStore,
  EMPTY_FILTER,
} from '../../../stores/filterPreferenceStore';
import type { ClickIntent } from '../../../types/workspace';
import { SidebarSortPicker } from './SidebarSortPicker';
import { SidebarListSkeleton } from './SidebarListSkeleton';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../../ui/context-menu';
import { DeleteConfirmDialog } from '../../ui/DeleteConfirmDialog';

interface EpisodeRow {
  id: string;
  title: string;
  status: string | null;
  word_count: number;
  work_id?: string;
  sort_order?: number | null;
}

interface EpisodeTreeListProps {
  workId: string;
  searchTerm: string;
  selectedItemId: string | null;
  onItemSelect: (id: string | null, intent?: ClickIntent) => void;
}

const STATUS_DOT: Record<string, string> = {
  '미작성': 'bg-muted-foreground/40',
  '초고': 'bg-warning',
  '퇴고': 'bg-info',
  '완성': 'bg-success',
};

/**
 * 원고 평탄 리스트.
 *
 * ├─ 1화: 주인공 각성  ●
 * ├─ 2화: 동료 합류    ●
 * ├─ 3화: 첫 번째 위기  ●
 * └─ + 새 원고
 */
export function EpisodeTreeList({
  workId,
  searchTerm,
  selectedItemId,
  onItemSelect,
}: EpisodeTreeListProps) {
  const writerId = useWriterId();
  const { createEpisode } = useLocalWrite();
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');

  const sortMode = useSortPreferenceStore((s) => s.byPanel['episode'] ?? 'manual');
  const statusFilter = useFilterPreferenceStore(
    (s) => s.byPanel['episode'] ?? (EMPTY_FILTER as string[]),
  );
  const trimmed = searchTerm.trim();
  const whereSearch = trimmed ? `AND title LIKE ? ESCAPE '\\'` : '';
  const orderBy = buildOrderBy(sortMode, { titleColumn: 'title' });
  const filterClause = buildInClause('status', statusFilter);
  const sql = `SELECT id, title, status, word_count, work_id, sort_order FROM episode
     WHERE work_id = ? AND writer_id = ? AND status != 'trashed' ${whereSearch} ${filterClause.sql}
     ${orderBy}`;
  const baseParams = [workId, writerId];
  const params = [
    ...baseParams,
    ...(trimmed ? [`%${escapeLike(trimmed)}%`] : []),
    ...filterClause.params,
  ];
  const { data: rawEpisodes = [], isFetching } = useQuery<EpisodeRow>(sql, params);
  const episodes = useOptimisticRows(rawEpisodes, {
    docType: 'episode',
    workId,
    matches: (row) => row.work_id === workId,
  });
  const showEmpty = useDelayedEmptyState(episodes.length === 0 && !creating && !isFetching);

  const handleCreate = () => {
    const trimmedTitle = createTitle.trim();
    setCreating(false);
    setCreateTitle('');
    if (!trimmedTitle) return;
    void (async () => {
      const id = await createEpisode(workId, trimmedTitle, episodes.length);
      onItemSelect(id, 'default');
    })();
  };

  const handleCreateCancel = () => {
    setCreating(false);
    setCreateTitle('');
  };

  const handleCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
    if (e.key === 'Escape') { e.preventDefault(); handleCreateCancel(); }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pt-2 pb-1">
        <div className="flex items-center gap-1.5">
          {creating ? (
            <input
              autoFocus
              type="text"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              onKeyDown={handleCreateKeyDown}
              onBlur={handleCreateCancel}
              placeholder="원고 제목을 입력 후 Enter"
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus size={14} strokeWidth={2} />
              <span>새 원고</span>
            </button>
          )}
          <SidebarSortPicker panelKey="episode" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-1">
        {isFetching && episodes.length === 0 && !creating ? (
          <SidebarListSkeleton />
        ) : showEmpty ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {trimmed ? '검색 결과가 없습니다.' : '원고가 없습니다.'}
          </p>
        ) : (
          <SortableContext items={episodes.map((ep) => ep.id)} strategy={verticalListSortingStrategy}>
            {episodes.map((ep) => (
              <SortableEpisodeItem
                key={ep.id}
                episode={ep}
                workId={workId}
                selected={selectedItemId === ep.id}
                onSelect={(intent) => onItemSelect(ep.id, intent)}
                onAfterDelete={() => {
                  if (selectedItemId === ep.id) onItemSelect(null);
                }}
              />
            ))}
          </SortableContext>
        )}
        <TreeRootEndDropZone lastItemId={episodes[episodes.length - 1]?.id ?? null} />
      </div>
    </div>
  );
}

function TreeRootEndDropZone({ lastItemId }: { lastItemId: string | null }) {
  const { setNodeRef } = useDroppable({
    id: 'episode-tree-root-end',
    data: { type: 'tree-root-end', docType: 'episode', lastItemId },
  });
  return (
    <div
      ref={setNodeRef}
      className="mt-1 min-h-15 flex-1"
      aria-label="목록 끝으로 이동"
    />
  );
}

interface SortableEpisodeItemProps {
  episode: EpisodeRow;
  workId: string;
  selected: boolean;
  onSelect: (intent: ClickIntent) => void;
  onAfterDelete: () => void;
}

function SortableEpisodeItem(props: SortableEpisodeItemProps) {
  const dragEnabled =
    useSortPreferenceStore((s) => s.byPanel['episode'] ?? 'manual') === 'manual';
  const { attributes, listeners, setNodeRef, isDragging } =
    useSortable({
      id: props.episode.id,
      disabled: !dragEnabled,
      data: {
        type: 'tree-node',
        docType: 'episode',
        docId: props.episode.id,
        depth: 0,
        parentId: null,
        workId: props.workId,
        title: props.episode.title,
        sortOrder: props.episode.sort_order ?? 0,
        rowSnapshot: {
          id: props.episode.id,
          title: props.episode.title,
          status: props.episode.status,
          word_count: props.episode.word_count,
          work_id: props.workId,
          sort_order: props.episode.sort_order ?? 0,
        },
      },
    });
  const style = { opacity: isDragging ? 0 : 1 };
  const zoneInfo = useDragZoneStore((s) =>
    s.overId === props.episode.id ? s.zone : null,
  );
  return (
    <div ref={setNodeRef} style={style} className="relative">
      {zoneInfo === 'before' && (
        <div className="pointer-events-none absolute inset-x-0 -top-px h-0.5 bg-primary z-10" />
      )}
      <EpisodeItem
        workId={props.workId}
        episode={props.episode}
        selected={props.selected}
        onSelect={props.onSelect}
        onAfterDelete={props.onAfterDelete}
        dragAttributes={attributes}
        dragListeners={listeners}
      />
      {zoneInfo === 'after' && (
        <div className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 bg-primary z-10" />
      )}
    </div>
  );
}

function EpisodeItem({
  workId,
  episode,
  selected,
  onSelect,
  onAfterDelete,
  dragAttributes,
  dragListeners,
}: {
  workId: string;
  episode: EpisodeRow;
  selected: boolean;
  onSelect: (intent: ClickIntent) => void;
  onAfterDelete: () => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
}) {
  const writerId = useWriterId();
  const db = usePowerSync();
  const { updateEpisode, trashEpisode, createEpisode, placeEpisode } =
    useLocalWrite();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(episode.title);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const clickHandlers = useSidebarClickHandler(onSelect);

  useEffect(() => {
    if (!editing) setDraft(episode.title);
  }, [editing, episode.title]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === episode.title) {
      setDraft(episode.title);
      return;
    }
    void updateEpisode(episode.id, { title: next.slice(0, 200) });
  };

  const cancel = () => {
    setDraft(episode.title);
    setEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await trashEpisode(episode.id);
      onAfterDelete();
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async () => {
    const rows = await db.getAll<{ content: string | null }>(
      'SELECT content FROM episode WHERE id = ? LIMIT 1',
      [episode.id],
    );
    const content = rows[0]?.content ?? null;
    const newId = await createEpisode(
      workId,
      `${episode.title?.trim() || '(제목 없음)'} (사본)`,
      Date.now(),
      content,
    );
    await placeEpisode(newId, workId, episode.id, 'after');
  };

  const fetchSiblings = async (): Promise<string[]> => {
    const rows = await db.getAll<{ id: string }>(
      `SELECT id FROM episode
       WHERE work_id = ? AND writer_id = ? AND status != 'trashed'
       ORDER BY sort_order ASC, created_at ASC`,
      [workId, writerId],
    );
    return rows.map((r) => r.id);
  };
  const handleMoveUp = async () => {
    const ids = await fetchSiblings();
    const idx = ids.indexOf(episode.id);
    if (idx <= 0) return;
    await placeEpisode(episode.id, workId, ids[idx - 1], 'before');
  };
  const handleMoveDown = async () => {
    const ids = await fetchSiblings();
    const idx = ids.indexOf(episode.id);
    if (idx < 0 || idx >= ids.length - 1) return;
    await placeEpisode(episode.id, workId, ids[idx + 1], 'after');
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/\n/g, ''))}
        onBlur={commit}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={handleKeyDown}
        maxLength={200}
        className="w-full rounded-md border border-ring bg-background px-2 py-1 text-xs text-foreground outline-none ring-1 ring-ring"
      />
    );
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            {...dragAttributes}
            {...dragListeners}
            className="group flex items-center"
          >
            <button
              type="button"
              {...clickHandlers}
              title="클릭=메인 / 더블·⌘+클릭=핀"
              className={cn(
                'flex flex-1 items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
                selected
                  ? 'bg-secondary font-medium text-primary'
                  : 'text-sidebar-foreground',
              )}
            >
              <span className="truncate">{episode.title?.trim() || '(제목 없음)'}</span>
              {episode.status && (
                <span
                  className={cn(
                    'ml-auto h-2 w-2 shrink-0 rounded-full',
                    STATUS_DOT[episode.status] ?? 'bg-muted-foreground',
                  )}
                  title={episode.status}
                />
              )}
            </button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => onSelect('newTab')}>
            <SquareArrowOutUpRight size={12} /> 새 탭에서 열기
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onSelect('pin')}>
            <PanelRight size={12} /> 스테이지에 추가
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => void handleDuplicate()}>
            <Copy size={12} /> 복제
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => void handleMoveUp()}>
            <ChevronUp size={12} /> 위로 이동
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void handleMoveDown()}>
            <ChevronDown size={12} /> 아래로 이동
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => setEditing(true)}>
            <Pencil size={12} /> 이름 변경
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem destructive onSelect={() => setDeleteOpen(true)}>
            <Trash2 size={12} /> 휴지통으로 이동
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {deleteOpen && (
        <DeleteConfirmDialog
          title="원고 휴지통 이동"
          message={`'${episode.title?.trim() || '(제목 없음)'}'을(를) 휴지통으로 이동하시겠습니까?`}
          warning="휴지통에서 복원하거나 영구 삭제할 수 있습니다."
          confirmLabel="휴지통으로 이동"
          busyLabel="이동 중…"
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </>
  );
}

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
