import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
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
import { useWriterId } from '../../../hooks/useWriterId';
import { useLocalWrite } from '../../../hooks/useLocalWrite';
import { DeleteConfirmDialog } from '../../ui/DeleteConfirmDialog';
import { cn } from '../../../lib/cn';
import { setupDragTransfer } from '../../../lib/dragTransfer';

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
  onItemSelect: (id: string | null) => void;
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
  const { createEpisode, updateEpisode, reorderItems, trashEpisode } = useLocalWrite();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const [creating, setCreating] = useState(false);
  const [trashTarget, setTrashTarget] = useState<{ id: string; title: string } | null>(null);
  const [trashBusy, setTrashBusy] = useState(false);

  const trimmed = searchTerm.trim();
  const whereSearch = trimmed ? `AND title LIKE ? ESCAPE '\\'` : '';
  const sql = `SELECT id, title, status, word_count FROM episode
     WHERE work_id = ? AND writer_id = ? AND status != 'trashed' ${whereSearch}
     ORDER BY sort_order ASC, created_at ASC`;
  const params = trimmed
    ? [workId, writerId, `%${escapeLike(trimmed)}%`]
    : [workId, writerId];
  const { data: episodes = [] } = useQuery<EpisodeRow>(sql, params);

  const handleCreate = async (name: string) => {
    setCreating(false);
    if (!name.trim()) return;
    const id = await createEpisode(workId, name.trim(), episodes.length);
    onItemSelect(id);
  };

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        <Plus size={14} strokeWidth={2} />
        <span>새 원고</span>
      </button>

      {creating && (
        <InlineCreateInput
          placeholder="원고 제목을 입력하세요"
          onConfirm={(name) => void handleCreate(name)}
          onCancel={() => setCreating(false)}
        />
      )}

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
                onSelect={() => onItemSelect(ep.id)}
                onRename={(title) => void updateEpisode(ep.id, { title })}
                onTrash={() => setTrashTarget({ id: ep.id, title: ep.title })}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
      {trashTarget && (
        <DeleteConfirmDialog
          title="휴지통으로 이동"
          message={`"${trashTarget.title || '(제목 없음)'}"`+ ' 원고가 휴지통으로 이동됩니다.'}
          warning="30일 후 자동으로 영구 삭제됩니다. 휴지통에서 복원할 수 있습니다."
          confirmLabel="휴지통으로 이동"
          busyLabel="이동 중…"
          busy={trashBusy}
          onConfirm={() => {
            setTrashBusy(true);
            void trashEpisode(trashTarget.id).then(() => {
              setTrashTarget(null);
              setTrashBusy(false);
            });
          }}
          onCancel={() => setTrashTarget(null)}
        />
      )}
    </div>
  );

}

/* ── 회차 아이템 ── */

function SortableEpisodeItem(props: {
  episode: EpisodeRow;
  selected: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onTrash: () => void;
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
    <div ref={setNodeRef} style={style} {...attributes}>
      <EpisodeItem {...props} dragListeners={listeners} />
    </div>
  );
}

function EpisodeItem({
  episode,
  selected,
  onSelect,
  onRename,
  onTrash,
  dragListeners,
}: {
  episode: EpisodeRow;
  selected: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onTrash: () => void;
  dragListeners?: Record<string, unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(episode.title);

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
          className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical size={12} className="text-muted-foreground" />
        </span>
      )}
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={() => setEditing(true)}
        title="더블클릭으로 이름 변경"
        className={cn(
          'flex flex-1 items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
          selected
            ? 'bg-primary/5 font-medium text-primary'
            : 'text-sidebar-foreground',
        )}
      >
        <span className="truncate">{episode.title?.trim() || '(제목 없음)'}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {episode.word_count > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {episode.word_count.toLocaleString()}자
            </span>
          )}
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
        onClick={(e) => { e.stopPropagation(); onTrash(); }}
        title="휴지통으로 이동"
        className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 text-muted-foreground hover:text-destructive"
      >
        <Trash2 size={12} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/* ── 인라인 생성 입력 ── */

function InlineCreateInput({
  placeholder,
  onConfirm,
  onCancel,
}: {
  placeholder: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); onConfirm(value); }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { if (value.trim()) onConfirm(value); else onCancel(); }}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      maxLength={200}
      className="w-full rounded-md border border-ring bg-background px-2 py-0.5 text-xs text-foreground outline-none ring-1 ring-ring placeholder:text-muted-foreground"
    />
  );
}

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
