import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import { ChevronRight, GripVertical, Plus, Trash2 } from 'lucide-react';
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

interface NoteRow {
  id: string;
  name: string;
}

interface WorldNoteListProps {
  workId: string;
  searchTerm: string;
  selectedItemId: string | null;
  onItemSelect: (id: string | null) => void;
  onNewWorldNote: (parentId?: string | null) => void;
}

const MAX_DEPTH = 1;

export function WorldNoteList({
  workId,
  searchTerm,
  selectedItemId,
  onItemSelect,
  onNewWorldNote,
}: WorldNoteListProps) {
  const writerId = useWriterId();
  const { createWorldNote, reorderItems } = useLocalWrite();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const [creating, setCreating] = useState(false);

  const trimmed = searchTerm.trim();
  const whereSearch = trimmed ? `AND name LIKE ? ESCAPE '\\'` : '';
  const sql = `SELECT id, name FROM world_note
     WHERE work_id = ? AND writer_id = ? AND parent_id IS NULL ${whereSearch}
     ORDER BY sort_order ASC, created_at ASC`;
  const params = trimmed
    ? [workId, writerId, `%${escapeLike(trimmed)}%`]
    : [workId, writerId];
  const { data: notes = [] } = useQuery<NoteRow>(sql, params);

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
    // 이미 선택+펼침 상태면 접기, 아니면 펼기
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

  const handleCreateRoot = async (name: string) => {
    setCreating(false);
    if (!name.trim()) return;
    const id = await createWorldNote(workId, name.trim(), Date.now(), null);
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
        <span>새 문서</span>
      </button>

      {creating && (
        <InlineCreateInput
          placeholder="문서 이름을 입력하세요"
          onConfirm={(name) => void handleCreateRoot(name)}
          onCancel={() => setCreating(false)}
        />
      )}

      {notes.length === 0 && !creating ? (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          {trimmed ? '검색 결과가 없습니다.' : '세계관 문서가 없습니다.'}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            const oldIndex = notes.findIndex((n) => n.id === active.id);
            const newIndex = notes.findIndex((n) => n.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return;
            const reordered = arrayMove(notes, oldIndex, newIndex);
            void reorderItems(
              'world_note',
              reordered.map((n, i) => ({ id: n.id, sortOrder: i * 1000 })),
            );
          }}
        >
          <SortableContext items={notes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
            {notes.map((note) => (
              <SortableWorldNoteItem
                key={note.id}
                workId={workId}
                note={note}
                depth={0}
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

interface WorldNoteTreeItemProps {
  workId: string;
  note: NoteRow;
  depth: number;
  selectedItemId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onItemSelect: (id: string | null) => void;
}

function SortableWorldNoteItem(props: WorldNoteTreeItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.note.id });
  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <WorldNoteTreeItem {...props} dragListeners={listeners} />
    </div>
  );
}

function WorldNoteTreeItem({
  workId,
  note,
  depth,
  selectedItemId,
  expandedIds,
  onSelect,
  onToggleExpand,
  onItemSelect,
  dragListeners,
}: WorldNoteTreeItemProps & { dragListeners?: Record<string, unknown> }) {
  const writerId = useWriterId();
  const { updateWorldNoteName, createWorldNote, reorderItems, deleteWorldNote } = useLocalWrite();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const childSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const isExpanded = expandedIds.has(note.id);
  const isSelected = selectedItemId === note.id;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.name);
  const [creatingChild, setCreatingChild] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(note.name);
  }, [editing, note.name]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === note.name) {
      setDraft(note.name);
      return;
    }
    void updateWorldNoteName(note.id, next.slice(0, 200));
  };

  const cancel = () => {
    setDraft(note.name);
    setEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  };

  const handleCreateChild = async (name: string) => {
    setCreatingChild(false);
    if (!name.trim()) return;
    const id = await createWorldNote(workId, name.trim(), Date.now(), note.id);
    onItemSelect(id);
  };

  const { data: children = [] } = useQuery<NoteRow>(
    isExpanded
      ? `SELECT id, name FROM world_note
         WHERE parent_id = ? AND writer_id = ?
         ORDER BY sort_order ASC, created_at ASC`
      : `SELECT '' AS id, '' AS name WHERE 0`,
    isExpanded ? [note.id, writerId] : [],
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
          onDragStart={(e) => setupDragTransfer(e, 'world_note', note.id, note.name)}
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
            onClick={() => onSelect(note.id)}
            onDoubleClick={() => setEditing(true)}
            title="더블클릭으로 이름 변경"
            className={cn(
              'flex flex-1 items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
              isSelected
                ? 'bg-primary/5 font-medium text-primary'
                : 'text-sidebar-foreground',
            )}
          >
            {depth < MAX_DEPTH && (
              <ChevronRight
                size={12}
                strokeWidth={2}
                className={cn(
                  'shrink-0 transition-transform',
                  isExpanded && 'rotate-90',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(note.id);
                }}
              />
            )}
            {note.name?.trim() || '(이름 없음)'}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: note.id, name: note.name }); }}
            title="삭제"
            className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 text-muted-foreground hover:text-destructive"
          >
            <Trash2 size={12} strokeWidth={1.75} />
          </button>
        </div>
      )}

      {isExpanded && (
        <div className="ml-3 border-l border-border/50 pl-2">
          {depth < MAX_DEPTH && children.length > 0 && (
            <DndContext
              sensors={childSensors}
              collisionDetection={closestCenter}
              onDragEnd={(event: DragEndEvent) => {
                const { active, over } = event;
                if (!over || active.id === over.id) return;
                const oldIndex = children.findIndex((c) => c.id === active.id);
                const newIndex = children.findIndex((c) => c.id === over.id);
                if (oldIndex === -1 || newIndex === -1) return;
                const reordered = arrayMove(children, oldIndex, newIndex);
                void reorderItems(
                  'world_note',
                  reordered.map((c, i) => ({ id: c.id, sortOrder: i * 1000 })),
                );
              }}
            >
              <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                {children.map((child) => (
                  <SortableWorldNoteItem
                    key={child.id}
                    workId={workId}
                    note={child}
                    depth={depth + 1}
                    selectedItemId={selectedItemId}
                    expandedIds={expandedIds}
                    onSelect={onSelect}
                    onToggleExpand={onToggleExpand}
                    onItemSelect={onItemSelect}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
          {depth >= MAX_DEPTH && children.length > 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              (최대 깊이 도달)
            </p>
          )}

          {depth < MAX_DEPTH && creatingChild && (
            <InlineCreateInput
              placeholder="하위 문서 이름"
              onConfirm={(name) => void handleCreateChild(name)}
              onCancel={() => setCreatingChild(false)}
              small
            />
          )}

          {depth < MAX_DEPTH && (
          <button
            type="button"
            onClick={() => setCreatingChild(true)}
            className="mt-1 flex w-full items-center justify-center gap-1 rounded-md bg-primary/15 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/25"
          >
            <Plus size={11} strokeWidth={2} />
            <span>하위 추가</span>
          </button>
          )}
        </div>
      )}
      {deleteTarget && (
        <DeleteConfirmDialog
          title="문서 삭제"
          message={`"${deleteTarget.name || '(이름 없음)'}"`+ ' 문서와 하위 문서가 영구 삭제됩니다.'}
          busy={deleteBusy}
          onConfirm={() => {
            setDeleteBusy(true);
            void deleteWorldNote(deleteTarget.id).then(() => {
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

/* ── 인라인 생성 입력 ── */

function InlineCreateInput({
  placeholder,
  onConfirm,
  onCancel,
  small,
}: {
  placeholder: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
  small?: boolean;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value.trim()) onConfirm(value);
        else onCancel();
      }}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      maxLength={200}
      className={cn(
        'w-full rounded-md border border-ring bg-background text-foreground outline-none ring-1 ring-ring placeholder:text-muted-foreground',
        small ? 'px-2 py-0.5 text-xs' : 'px-2 py-1 text-sm',
      )}
    />
  );
}

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
