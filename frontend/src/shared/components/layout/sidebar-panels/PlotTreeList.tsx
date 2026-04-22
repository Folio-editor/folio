import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import { ChevronRight, GripVertical, Plus, Trash2 } from 'lucide-react';
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
import { DeleteConfirmDialog } from '../../ui/DeleteConfirmDialog';
import { cn } from '../../../lib/cn';
import { setupDragTransfer } from '../../../lib/dragTransfer';

interface PlotRow {
  id: string;
  title: string;
  status: string | null;
}

interface PlotTreeListProps {
  workId: string;
  searchTerm: string;
  selectedItemId: string | null;
  onItemSelect: (id: string | null) => void;
}

const STATUS_DOT: Record<string, string> = {
  '예정': 'bg-gray-400',
  '작성중': 'bg-blue-500',
  '완료': 'bg-green-500',
};

/**
 * 플롯 트리 리스트 (막 > 회차 계층).
 *
 * ├─ 1막: 시작                  ← 막 (parent_id IS NULL)
 * │   ├─ 1화: 주인공 각성  ●    ← 회차 (parent_id = act.id)
 * │   ├─ 2화: 동료 합류    ●
 * │   └─ + 새 회차
 * ├─ 2막: 전개
 * └─ + 새 막
 */
export function PlotTreeList({
  workId,
  searchTerm,
  selectedItemId,
  onItemSelect,
}: PlotTreeListProps) {
  const writerId = useWriterId();
  const { createPlot, reorderItems } = useLocalWrite();
  const sensors = useSensors(
    useSensor(HandleOnlyPointerSensor),
  );
  const [creating, setCreating] = useState(false);

  const trimmed = searchTerm.trim();
  const whereSearch = trimmed ? `AND title LIKE ? ESCAPE '\\'` : '';
  const sql = `SELECT id, title, status FROM plot
     WHERE work_id = ? AND writer_id = ? AND parent_id IS NULL ${whereSearch}
     ORDER BY sort_order ASC, created_at ASC`;
  const params = trimmed
    ? [workId, writerId, `%${escapeLike(trimmed)}%`]
    : [workId, writerId];
  const { data: acts = [] } = useQuery<PlotRow>(sql, params);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelect = (id: string) => {
    onItemSelect(id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (selectedItemId === id && next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCreateAct = async (name: string) => {
    setCreating(false);
    if (!name.trim()) return;
    const id = await createPlot(workId, name.trim(), acts.length);
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
        <span>새 막</span>
      </button>

      {creating && (
        <InlineCreateInput
          placeholder="막 제목을 입력하세요"
          onConfirm={(name) => void handleCreateAct(name)}
          onCancel={() => setCreating(false)}
        />
      )}

      {acts.length === 0 && !creating ? (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          {trimmed ? '검색 결과가 없습니다.' : '플롯이 없습니다.'}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            const oldIndex = acts.findIndex((a) => a.id === active.id);
            const newIndex = acts.findIndex((a) => a.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return;
            const reordered = arrayMove(acts, oldIndex, newIndex);
            void reorderItems(
              'plot',
              reordered.map((a, i) => ({ id: a.id, sortOrder: i * 1000 })),
            );
          }}
        >
          <SortableContext items={acts.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            {acts.map((act) => (
              <SortableActItem
                key={act.id}
                workId={workId}
                act={act}
                selectedItemId={selectedItemId}
                expandedIds={expandedIds}
                onSelect={handleSelect}
                onToggleExpand={toggleExpand}
                onItemSelect={onItemSelect}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

/* ── 막 아이템 ── */

interface ActItemProps {
  workId: string;
  act: PlotRow;
  selectedItemId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onItemSelect: (id: string | null) => void;
}

function SortableActItem(props: ActItemProps) {
  const { listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.act.id });
  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <ActTreeItem {...props} dragListeners={listeners} />
    </div>
  );
}

function ActTreeItem({
  workId,
  act,
  selectedItemId,
  expandedIds,
  onSelect,
  onToggleExpand,
  onItemSelect,
  dragListeners,
}: ActItemProps & { dragListeners?: Record<string, unknown> }) {
  const writerId = useWriterId();
  const { createPlot, updatePlot, reorderItems, deletePlot } = useLocalWrite();
  const childSensors = useSensors(
    useSensor(HandleOnlyPointerSensor),
  );
  const isExpanded = expandedIds.has(act.id);
  const isSelected = selectedItemId === act.id;
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(act.title);
  const [creatingChild, setCreatingChild] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(act.title);
  }, [editing, act.title]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === act.title) {
      setDraft(act.title);
      return;
    }
    void updatePlot(act.id, { title: next.slice(0, 200) });
  };

  const cancel = () => {
    setDraft(act.title);
    setEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  };

  const handleCreateEpisode = async (name: string) => {
    setCreatingChild(false);
    if (!name.trim()) return;
    const id = await createPlot(workId, name.trim(), Date.now(), act.id);
    onItemSelect(id);
  };

  const { data: episodes = [] } = useQuery<PlotRow>(
    isExpanded
      ? `SELECT id, title, status FROM plot
         WHERE parent_id = ? AND writer_id = ?
         ORDER BY sort_order ASC, created_at ASC`
      : `SELECT '' AS id, '' AS title, '' AS status WHERE 0`,
    isExpanded ? [act.id, writerId] : [],
  );

  return (
    <div>
      {editing ? (
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/\n/g, ''))}
          onBlur={commit}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={handleKeyDown}
          maxLength={200}
          className="w-full rounded-md border border-ring bg-background px-2 py-1 text-sm text-foreground outline-none ring-1 ring-ring"
        />
      ) : (
        <div
          className="group flex items-center"
          draggable="true"
          onDragStart={(e) => setupDragTransfer(e, 'plot', act.id, act.title)}
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
            onClick={() => onSelect(act.id)}
            onDoubleClick={() => setEditing(true)}
            title="더블클릭으로 이름 변경"
            className={cn(
              'flex flex-1 items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
              isSelected
                ? 'bg-primary/5 font-medium text-primary'
                : 'text-sidebar-foreground',
            )}
          >
            <ChevronRight
              size={12}
              strokeWidth={2}
              className={cn(
                'shrink-0 transition-transform',
                isExpanded && 'rotate-90',
              )}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(act.id);
              }}
            />
            {act.title?.trim() || '(제목 없음)'}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: act.id, title: act.title }); }}
            title="삭제"
            className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 text-muted-foreground hover:text-destructive"
          >
            <Trash2 size={12} strokeWidth={1.75} />
          </button>
        </div>
      )}

      {isExpanded && (
        <div className="ml-3 border-l border-border/50 pl-2">
          {episodes.length > 0 && (
            <DndContext
              sensors={childSensors}
              collisionDetection={closestCenter}
              onDragEnd={(event: DragEndEvent) => {
                const { active, over } = event;
                if (!over || active.id === over.id) return;
                const oldIndex = episodes.findIndex((ep) => ep.id === active.id);
                const newIndex = episodes.findIndex((ep) => ep.id === over.id);
                if (oldIndex === -1 || newIndex === -1) return;
                const reordered = arrayMove(episodes, oldIndex, newIndex);
                void reorderItems(
                  'plot',
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
                    onRename={(title) => void updatePlot(ep.id, { title })}
                    onDelete={() => setDeleteTarget({ id: ep.id, title: ep.title })}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}

          {creatingChild && (
            <InlineCreateInput
              placeholder="회차 제목을 입력하세요"
              onConfirm={(name) => void handleCreateEpisode(name)}
              onCancel={() => setCreatingChild(false)}
            />
          )}

          <button
            type="button"
            onClick={() => setCreatingChild(true)}
            className="mt-1 flex w-full items-center justify-center gap-1 rounded-md bg-primary/15 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/25"
          >
            <Plus size={11} strokeWidth={2} />
            <span>새 회차</span>
          </button>
        </div>
      )}
      {deleteTarget && (
        <DeleteConfirmDialog
          title="플롯 삭제"
          message={`"${deleteTarget.title || '(제목 없음)'}"`+ ' 항목과 하위 회차가 영구 삭제됩니다.'}
          busy={deleteBusy}
          onConfirm={() => {
            setDeleteBusy(true);
            void deletePlot(deleteTarget.id).then(() => {
              setDeleteTarget(null);
              setDeleteBusy(false);
            });
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

/* ── 회차 아이템 ── */

function SortableEpisodeItem(props: {
  episode: PlotRow;
  selected: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
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
  onDelete,
  dragListeners,
}: {
  episode: PlotRow;
  selected: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
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
      onDragStart={(e) => setupDragTransfer(e, 'plot', episode.id, episode.title)}
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
          'flex flex-1 items-center gap-1.5 truncate rounded-md px-2 py-1 text-left text-xs hover:bg-sidebar-accent',
          selected
            ? 'bg-primary/5 font-medium text-primary'
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
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="삭제"
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
      className="mb-1 h-9 w-full rounded-lg border border-ring bg-background px-3 text-sm text-foreground outline-none ring-1 ring-ring placeholder:text-muted-foreground"
    />
  );
}

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
