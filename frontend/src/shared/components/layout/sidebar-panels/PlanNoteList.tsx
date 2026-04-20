import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import { GripVertical, Plus } from 'lucide-react';
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
import { cn } from '../../../lib/cn';

interface NoteRow {
  id: string;
  title: string;
}

interface PlanNoteListProps {
  workId: string;
  searchTerm: string;
  selectedItemId: string | null;
  onItemSelect: (id: string | null) => void;
  onNewPlanNote: () => void;
}

export function PlanNoteList({
  workId,
  searchTerm,
  selectedItemId,
  onItemSelect,
  onNewPlanNote,
}: PlanNoteListProps) {
  const writerId = useWriterId();
  const { updatePlanNoteTitle, reorderItems } = useLocalWrite();
  const [creating, setCreating] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const trimmed = searchTerm.trim();
  const whereSearch = trimmed ? `AND title LIKE ? ESCAPE '\\'` : '';
  const sql = `SELECT id, title FROM plan_note
     WHERE work_id = ? AND writer_id = ? ${whereSearch}
     ORDER BY sort_order ASC, created_at ASC`;
  const params = trimmed
    ? [workId, writerId, `%${escapeLike(trimmed)}%`]
    : [workId, writerId];
  const { data: notes = [] } = useQuery<NoteRow>(sql, params);

  const handleCreate = (name: string) => {
    setCreating(false);
    if (!name.trim()) return;
    // 생성 후 onNewPlanNote는 AuthenticatedApp에서 실제 INSERT 수행
    // 하지만 현재 onNewPlanNote는 이름을 받지 않으므로 직접 생성
    void createWithName(name.trim());
  };

  const { createPlanNote } = useLocalWrite();
  const createWithName = async (name: string) => {
    const id = await createPlanNote(workId, name, Date.now());
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
          onConfirm={handleCreate}
          onCancel={() => setCreating(false)}
        />
      )}

      {notes.length === 0 && !creating ? (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          {trimmed ? '검색 결과가 없습니다.' : '기획 문서가 없습니다.'}
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
              'plan_note',
              reordered.map((n, i) => ({ id: n.id, sortOrder: i * 1000 })),
            );
          }}
        >
          <SortableContext items={notes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
            {notes.map((note) => (
              <SortableNoteItem
                key={note.id}
                note={note}
                selected={selectedItemId === note.id}
                onSelect={() => onItemSelect(note.id)}
                onRename={(title) => void updatePlanNoteTitle(note.id, title)}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
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
      className="w-full rounded-md border border-ring bg-background px-2 py-1 text-sm text-foreground outline-none ring-1 ring-ring placeholder:text-muted-foreground"
    />
  );
}

/* ── 정렬 가능한 항목 래퍼 ── */

function SortableNoteItem(props: {
  note: NoteRow;
  selected: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
}) {
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
      <NoteItem {...props} dragListeners={listeners} />
    </div>
  );
}

/* ── 기존 항목 ── */

function NoteItem({
  note,
  selected,
  onSelect,
  onRename,
  dragListeners,
}: {
  note: NoteRow;
  selected: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  dragListeners?: Record<string, unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.title);

  useEffect(() => {
    if (!editing) setDraft(note.title);
  }, [editing, note.title]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === note.title) {
      setDraft(note.title);
      return;
    }
    onRename(next.slice(0, 200));
  };

  const cancel = () => {
    setDraft(note.title);
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
        className="w-full rounded-md border border-ring bg-background px-2 py-1 text-sm text-foreground outline-none ring-1 ring-ring"
      />
    );
  }

  return (
    <div className="group flex items-center">
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
          'flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
          selected
            ? 'bg-primary/5 font-medium text-primary'
            : 'text-sidebar-foreground',
        )}
      >
        {note.title?.trim() || '(제목 없음)'}
      </button>
    </div>
  );
}

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
