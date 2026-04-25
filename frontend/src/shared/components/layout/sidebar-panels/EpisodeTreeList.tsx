import { useEffect, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import { GripVertical, Pencil, Plus } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { HandleOnlyPointerSensor } from '../../../lib/HandleOnlyPointerSensor';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { useWriterId } from '../../../hooks/useWriterId';
import { useLocalWrite } from '../../../hooks/useLocalWrite';
import { useSidebarClickHandler } from '../../../lib/sidebarClickHandler';
import { cn } from '../../../lib/cn';
import { setupDragTransfer } from '../../../lib/dragTransfer';
import type { ClickIntent } from '../../../types/workspace';

interface EpisodeRow {
  id: string;
  title: string;
  status: string | null;
  word_count: number;
}

interface EpisodeTreeListProps {
  workId: string;
  searchTerm: string;
  selectedItemId: string | null;
  onItemSelect: (id: string | null, intent?: ClickIntent) => void;
}

const STATUS_DOT: Record<string, string> = {
  '미작성': 'bg-gray-400',
  '초고': 'bg-yellow-500',
  '퇴고': 'bg-blue-500',
  '완성': 'bg-green-500',
};

/**
 * 원고 플랫 리스트.
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
  const { createEpisode, updateEpisode, reorderItems } = useLocalWrite();
  const sensors = useSensors(
    useSensor(HandleOnlyPointerSensor),
  );
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');

  const trimmed = searchTerm.trim();
  const whereSearch = trimmed ? `AND title LIKE ? ESCAPE '\\'` : '';
  const sql = `SELECT id, title, status, word_count FROM episode
     WHERE work_id = ? AND writer_id = ? AND status != 'trashed' ${whereSearch}
     ORDER BY sort_order ASC, created_at ASC`;
  const params = trimmed
    ? [workId, writerId, `%${escapeLike(trimmed)}%`]
    : [workId, writerId];
  const { data: episodes = [] } = useQuery<EpisodeRow>(sql, params);

  const handleCreate = () => {
    const trimmedTitle = createTitle.trim();
    setCreating(false);
    setCreateTitle('');
    if (!trimmedTitle) return;
    void (async () => {
      const id = await createEpisode(workId, trimmedTitle, episodes.length);
      // 새 원고 생성 직후 메인에 오픈
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
        {creating ? (
          <input
            autoFocus
            type="text"
            value={createTitle}
            onChange={(e) => setCreateTitle(e.target.value)}
            onKeyDown={handleCreateKeyDown}
            onBlur={handleCreateCancel}
            placeholder="원고 제목을 입력 후 Enter"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus size={14} strokeWidth={2} />
            <span>새 원고</span>
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-1">
      {episodes.length === 0 && !creating ? (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          {trimmed ? '검색 결과가 없습니다.' : '원고가 없습니다.'}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            const oldIndex = episodes.findIndex((ep) => ep.id === active.id);
            const newIndex = episodes.findIndex((ep) => ep.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return;
            const reordered = arrayMove(episodes, oldIndex, newIndex);
            void reorderItems(
              'episode',
              reordered.map((ep, i) => ({ id: ep.id, sortOrder: i * 1000 })),
            );
          }}
        >
          <SortableContext items={episodes.map((ep) => ep.id)} strategy={verticalListSortingStrategy}>
            {episodes.map((ep) => (
              <SortableEpisodeItem
                key={ep.id}
                episode={ep}
                selected={selectedItemId === ep.id}
                onSelect={(intent) => onItemSelect(ep.id, intent)}
                onRename={(title) => void updateEpisode(ep.id, { title })}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
      </div>
    </div>
  );
}

/* ── 회차 아이템 ── */

function SortableEpisodeItem(props: {
  episode: EpisodeRow;
  selected: boolean;
  onSelect: (intent: ClickIntent) => void;
  onRename: (title: string) => void;
}) {
  const { listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.episode.id });
  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <EpisodeItem {...props} dragListeners={listeners} />
    </div>
  );
}

function EpisodeItem({
  episode,
  selected,
  onSelect,
  onRename,
  dragListeners,
}: {
  episode: EpisodeRow;
  selected: boolean;
  onSelect: (intent: ClickIntent) => void;
  onRename: (title: string) => void;
  dragListeners?: Record<string, unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(episode.title);
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
    onRename(next.slice(0, 200));
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
    <div
      className="group flex items-center"
      draggable="true"
      onDragStart={(e) => setupDragTransfer(e, 'episode', episode.id, episode.title)}
    >
      {dragListeners && (
        <span
          {...dragListeners}
          data-dnd-handle
          className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical size={12} className="text-muted-foreground" />
        </span>
      )}
      <button
        type="button"
        {...clickHandlers}
        title="클릭=메인 / 더블·⌘+클릭=핀"
        className={cn(
          'flex flex-1 items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
          selected
            ? 'bg-primary/5 font-medium text-primary'
            : 'text-sidebar-foreground',
        )}
      >
        <span className="truncate">{episode.title?.trim() || '(제목 없음)'}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {episode.status && (
            <span
              className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                STATUS_DOT[episode.status] ?? 'bg-muted-foreground',
              )}
              title={episode.status}
            />
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        title="이름 변경"
        aria-label="이름 변경"
        className="ml-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-hover:opacity-100"
      >
        <Pencil size={12} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
