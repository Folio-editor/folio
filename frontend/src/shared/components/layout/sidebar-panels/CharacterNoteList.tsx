import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import { ChevronRight, GripVertical, Plus } from 'lucide-react';
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
import { cn } from '../../../lib/cn';
import { setupDragTransfer } from '../../../lib/dragTransfer';

interface CharacterRow {
  id: string;
  name: string;
}

interface CharacterNoteRow {
  id: string;
  kind: string;
  title: string;
  sort_order: number | null;
}

interface CharacterNoteListProps {
  workId: string;
  searchTerm: string;
  selectedItemId: string | null;
  onItemSelect: (id: string | null) => void;
}

function nextSortOrder(rows: { sort_order: number | null }[]) {
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((row) => row.sort_order ?? 0)) + 1000;
}

/**
 * 인물 트리 리스트.
 *
 * ├── 홍길동                    ← 인물 (클릭 → 메타 편집)
 * │   ├── 외형                  ← 고정 하위 문서
 * │   ├── 성격                  ← 고정 하위 문서
 * │   └── + 새 문서             ← 커스텀 추가
 * ├── 김영희
 * │   ├── 외형
 * │   └── 성격
 */
export function CharacterNoteList({
  workId,
  searchTerm,
  selectedItemId,
  onItemSelect,
}: CharacterNoteListProps) {
  const writerId = useWriterId();
  const { createCharacter, ensureCharacterNotes, reorderItems } = useLocalWrite();
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const sensors = useSensors(
    useSensor(HandleOnlyPointerSensor),
  );
  const [creatingCharacter, setCreatingCharacter] = useState(false);

  // Parse prefix routing
  const selectedCharId = selectedItemId?.startsWith('char:') ? selectedItemId.slice(5) : null;
  const selectedNoteId = selectedItemId?.startsWith('cnote:') ? selectedItemId.slice(6) : null;

  // Track which character is expanded
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null);

  // Auto-expand when a character is selected via prefix
  useEffect(() => {
    if (selectedCharId) {
      setExpandedCharId(selectedCharId);
    }
  }, [selectedCharId]);

  // Auto-expand parent character when a note is selected
  const { data: noteParentRows = [] } = useQuery<{ character_id: string }>(
    selectedNoteId
      ? `SELECT character_id FROM character_note WHERE id = ?`
      : `SELECT '' AS character_id WHERE 0`,
    selectedNoteId ? [selectedNoteId] : [],
  );
  useEffect(() => {
    if (noteParentRows.length > 0 && noteParentRows[0].character_id) {
      setExpandedCharId(noteParentRows[0].character_id);
    }
  }, [noteParentRows]);

  const trimmed = searchTerm.trim();
  const whereName = trimmed ? `AND name LIKE ? ESCAPE '\\'` : '';
  const sql = `SELECT id, name FROM character
     WHERE work_id = ? AND writer_id = ? ${whereName}
     ORDER BY sort_order ASC, created_at ASC`;
  const params = trimmed
    ? [workId, writerId, `%${escapeLike(trimmed)}%`]
    : [workId, writerId];
  const { data: characters = [] } = useQuery<CharacterRow>(sql, params);

  const handleCreateChar = () => {
    const trimmedTitle = createTitle.trim();
    setCreating(false);
    setCreateTitle('');
    if (!trimmedTitle) return;
    void (async () => {
      const id = await createCharacter(workId, trimmedTitle, '미설정', '', characters.length);
      await ensureCharacterNotes(id);
      setExpandedCharId(id);
      onItemSelect('char:' + id);
    })();
  };

  const handleCreateCancel = () => {
    setCreating(false);
    setCreateTitle('');
  };

  const handleCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); handleCreateChar(); }
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
            placeholder="인물 이름을 입력 후 Enter"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus size={14} strokeWidth={2} />
            <span>새 인물</span>
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-1">
      {characters.length === 0 && !creating ? (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          {trimmed ? '검색 결과가 없습니다.' : '등장인물이 없습니다.'}
        </p>
      ) : (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(event: DragEndEvent) => {
          const { active, over } = event;
          if (!over || active.id === over.id) return;
          const oldIndex = characters.findIndex((c) => c.id === active.id);
          const newIndex = characters.findIndex((c) => c.id === over.id);
          if (oldIndex === -1 || newIndex === -1) return;
          const reordered = arrayMove(characters, oldIndex, newIndex);
          void reorderItems(
            'character',
            reordered.map((c, i) => ({ id: c.id, sortOrder: i * 1000 })),
          );
        }}
      >
        <SortableContext items={characters.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {characters.map((char) => (
            <SortableCharacterItem
              key={char.id}
              character={char}
              isExpanded={expandedCharId === char.id}
              selectedNoteId={expandedCharId === char.id ? selectedNoteId : null}
              onCharacterClick={() => {
                if (expandedCharId === char.id) {
                  setExpandedCharId(null);
                  onItemSelect(null);
                } else {
                  setExpandedCharId(char.id);
                  onItemSelect('char:' + char.id);
                }
              }}
              onNoteSelect={(noteId) => onItemSelect('cnote:' + noteId)}
              onNewNote={() => {/* handled inline */}}
            />
          ))}
        </SortableContext>
      </DndContext>
      )}
      </div>
    </div>
  );
}

interface CharacterTreeItemProps {
  character: CharacterRow;
  isExpanded: boolean;
  selectedNoteId: string | null;
  onCharacterClick: () => void;
  onNoteSelect: (id: string) => void;
  onNewNote: () => void;
}

function SortableCharacterItem(props: CharacterTreeItemProps) {
  const { listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.character.id });
  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <CharacterTreeItem {...props} dragListeners={listeners} />
    </div>
  );
}

function CharacterTreeItem({
  character,
  isExpanded,
  selectedNoteId,
  onCharacterClick,
  onNoteSelect,
  onNewNote,
  dragListeners,
}: CharacterTreeItemProps & { dragListeners?: Record<string, unknown> }) {
  const writerId = useWriterId();
  const { updateCharacterNoteTitle, createCharacterNote, reorderItems } = useLocalWrite();
  const noteSensors = useSensors(
    useSensor(HandleOnlyPointerSensor),
  );
  const [creatingNote, setCreatingNote] = useState(false);

  const { data: notes = [] } = useQuery<CharacterNoteRow>(
    isExpanded
      ? `SELECT id, kind, title, sort_order FROM character_note
         WHERE character_id = ? AND writer_id = ?
         ORDER BY sort_order ASC, created_at ASC`
      : `SELECT '' AS id, '' AS kind, '' AS title, 0 AS sort_order WHERE 0`,
    isExpanded ? [character.id, writerId] : [],
  );

  const handleCreateNote = async (name: string) => {
    setCreatingNote(false);
    if (!name.trim()) return;
    const id = await createCharacterNote(character.id, name.trim(), nextSortOrder(notes));
    onNoteSelect(id);
  };

  return (
    <div>
      {/* 인물 이름 (루트 노드) */}
      <div
        className="group flex items-center"
        draggable="true"
        onDragStart={(e) => setupDragTransfer(e, 'character', character.id, character.name)}
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
          onClick={onCharacterClick}
          className={cn(
            'flex flex-1 items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
            isExpanded && !selectedNoteId
              ? 'bg-primary/5 font-medium text-primary'
              : isExpanded
                ? 'font-medium text-sidebar-foreground'
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
          />
          {character.name?.trim() || '(이름 없음)'}
        </button>
      </div>

      {/* 하위 노트 (트리 자식) */}
      {isExpanded && (() => {
        return (
          <div className="ml-3 border-l border-border/50 pl-2">
            {notes.length > 0 && (
              <DndContext
                sensors={noteSensors}
                collisionDetection={closestCenter}
                onDragEnd={(event: DragEndEvent) => {
                  const { active, over } = event;
                  if (!over || active.id === over.id) return;
                  const oldIndex = notes.findIndex((n) => n.id === active.id);
                  const newIndex = notes.findIndex((n) => n.id === over.id);
                  if (oldIndex === -1 || newIndex === -1) return;
                  const reordered = arrayMove(notes, oldIndex, newIndex);
                  void reorderItems(
                    'character_note',
                    reordered.map((n, i) => ({
                      id: n.id,
                      sortOrder: i * 1000,
                    })),
                  );
                }}
              >
                <SortableContext items={notes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
                  {notes.map((note) => (
                    <SortableNoteItem
                      key={note.id}
                      note={note}
                      selected={selectedNoteId === note.id}
                      onSelect={() => onNoteSelect(note.id)}
                      onRename={(title) => void updateCharacterNoteTitle(note.id, title)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
            {creatingNote && (
              <InlineCreateInput
                placeholder="문서 이름을 입력하세요"
                onConfirm={(name) => void handleCreateNote(name)}
                onCancel={() => setCreatingNote(false)}
              />
            )}
            <button
              type="button"
              onClick={() => setCreatingNote(true)}
              className="mt-1 flex w-full items-center justify-center gap-1 rounded-md bg-primary/15 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/25"
            >
              <Plus size={11} strokeWidth={2} />
              <span>새 문서</span>
            </button>
          </div>
        );
      })()}
    </div>
  );
}

function SortableNoteItem(props: {
  note: CharacterNoteRow;
  selected: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
}) {
  const { listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.note.id });
  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <NoteItem {...props} dragListeners={listeners} />
    </div>
  );
}

function NoteItem({
  note,
  selected,
  onSelect,
  onRename,
  dragListeners,
}: {
  note: CharacterNoteRow;
  selected: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  dragListeners?: Record<string, unknown>;
}) {
  const isFixed = note.kind === 'appearance' || note.kind === 'personality';
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
        className="w-full rounded-md border border-ring bg-background px-2 py-1 text-xs text-foreground outline-none ring-1 ring-ring"
      />
    );
  }

  return (
    <div
      className="group flex items-center"
      draggable={Boolean(dragListeners)}
      onDragStart={(e) => {
        if (!dragListeners) { e.preventDefault(); return; }
        setupDragTransfer(e, 'character_note', note.id, note.title);
      }}
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
        onClick={onSelect}
        onDoubleClick={isFixed ? undefined : () => setEditing(true)}
        title={isFixed ? undefined : '더블클릭으로 이름 변경'}
        className={cn(
          'flex-1 truncate rounded-md px-2 py-1 text-left text-xs hover:bg-sidebar-accent',
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
