import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useDroppable, type DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { useWriterId } from '../../../hooks/useWriterId';
import { useLocalWrite } from '../../../hooks/useLocalWrite';
import { useSidebarClickHandler } from '../../../lib/sidebarClickHandler';
import { cn } from '../../../lib/cn';
import { useDragZoneStore } from '../../../lib/dragZoneStore';
import { useOptimisticRows } from '../../../lib/useOptimisticRows';
import type { ClickIntent } from '../../../types/workspace';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../../ui/context-menu';
import { DeleteConfirmDialog } from '../../ui/DeleteConfirmDialog';

interface CharacterRow {
  id: string;
  name: string;
  work_id?: string;
  sort_order?: number | null;
}

interface CharacterNoteRow {
  id: string;
  kind: string;
  title: string;
  sort_order: number | null;
  character_id?: string;
}

interface CharacterNoteListProps {
  workId: string;
  searchTerm: string;
  selectedItemId: string | null;
  onItemSelect: (id: string | null, intent?: ClickIntent) => void;
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
  const { createCharacter, ensureCharacterNotes } = useLocalWrite();
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');

  // Parse prefix routing
  const selectedCharId = selectedItemId?.startsWith('char:') ? selectedItemId.slice(5) : null;
  const selectedNoteId = selectedItemId?.startsWith('cnote:') ? selectedItemId.slice(6) : null;

  // Track which character is expanded
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedCharId) {
      setExpandedCharId(selectedCharId);
    }
  }, [selectedCharId]);

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
  const sql = `SELECT id, name, work_id, sort_order FROM character
     WHERE work_id = ? AND writer_id = ? ${whereName}
     ORDER BY sort_order ASC, created_at ASC`;
  const params = trimmed
    ? [workId, writerId, `%${escapeLike(trimmed)}%`]
    : [workId, writerId];
  const { data: rawCharacters = [] } = useQuery<CharacterRow>(sql, params);
  const characters = useOptimisticRows(rawCharacters, {
    docType: 'character',
    workId,
    matches: (row) => row.work_id === workId,
  });

  const handleCreateChar = () => {
    const trimmedTitle = createTitle.trim();
    setCreating(false);
    setCreateTitle('');
    if (!trimmedTitle) return;
    void (async () => {
      const id = await createCharacter(workId, trimmedTitle, '미설정', '', characters.length);
      await ensureCharacterNotes(id);
      setExpandedCharId(id);
      onItemSelect('char:' + id, 'default');
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
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-1">
        {characters.length === 0 && !creating ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {trimmed ? '검색 결과가 없습니다.' : '등장인물이 없습니다.'}
          </p>
        ) : (
          <SortableContext items={characters.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {characters.map((char) => (
              <SortableCharacterItem
                key={char.id}
                character={char}
                workId={workId}
                isExpanded={expandedCharId === char.id}
                selectedNoteId={expandedCharId === char.id ? selectedNoteId : null}
                isCharSelected={selectedItemId === 'char:' + char.id}
                onToggleExpand={() => {
                  setExpandedCharId(expandedCharId === char.id ? null : char.id);
                }}
                onCharacterActivate={(intent) => {
                  onItemSelect('char:' + char.id, intent);
                  if (intent === 'default') setExpandedCharId(char.id);
                }}
                onNoteActivate={(noteId, intent) =>
                  onItemSelect('cnote:' + noteId, intent)
                }
                onAfterCharDelete={() => {
                  if (selectedItemId === 'char:' + char.id) onItemSelect(null);
                  if (expandedCharId === char.id) setExpandedCharId(null);
                }}
                onAfterNoteDelete={(noteId) => {
                  if (selectedItemId === 'cnote:' + noteId) onItemSelect(null);
                }}
              />
            ))}
          </SortableContext>
        )}
        <CharacterRootEndDropZone lastItemId={characters[characters.length - 1]?.id ?? null} />
      </div>
    </div>
  );
}

function CharacterRootEndDropZone({ lastItemId }: { lastItemId: string | null }) {
  const { setNodeRef } = useDroppable({
    id: 'character-tree-root-end',
    data: { type: 'tree-root-end', docType: 'character', lastItemId },
  });
  return (
    <div
      ref={setNodeRef}
      className="mt-1 min-h-15 flex-1"
      aria-label="인물 목록 끝으로 이동"
    />
  );
}

interface CharacterTreeItemProps {
  character: CharacterRow;
  workId: string;
  isExpanded: boolean;
  selectedNoteId: string | null;
  isCharSelected: boolean;
  onToggleExpand: () => void;
  onCharacterActivate: (intent: ClickIntent) => void;
  onNoteActivate: (id: string, intent: ClickIntent) => void;
  onAfterCharDelete: () => void;
  onAfterNoteDelete: (noteId: string) => void;
}

function SortableCharacterItem(props: CharacterTreeItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } =
    useSortable({
      id: props.character.id,
      data: {
        type: 'tree-node',
        docType: 'character',
        docId: props.character.id,
        depth: 0,
        parentId: null,
        workId: props.workId,
        title: props.character.name,
        sortOrder: props.character.sort_order ?? 0,
        rowSnapshot: {
          id: props.character.id,
          name: props.character.name,
          work_id: props.workId,
          sort_order: props.character.sort_order ?? 0,
        },
      },
    });
  const style = { opacity: isDragging ? 0 : 1 };
  const zoneInfo = useDragZoneStore((s) =>
    s.overId === props.character.id ? s.zone : null,
  );
  return (
    <div ref={setNodeRef} style={style} className="relative">
      {zoneInfo === 'before' && (
        <div className="pointer-events-none absolute inset-x-0 -top-px h-0.5 bg-primary z-10" />
      )}
      <CharacterTreeItem
        {...props}
        dragAttributes={attributes}
        dragListeners={listeners}
      />
      {zoneInfo === 'after' && (
        <div className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 bg-primary z-10" />
      )}
    </div>
  );
}

function CharacterTreeItem({
  character,
  isExpanded,
  selectedNoteId,
  isCharSelected,
  onToggleExpand,
  onCharacterActivate,
  onNoteActivate,
  onAfterCharDelete,
  onAfterNoteDelete,
  dragAttributes,
  dragListeners,
}: CharacterTreeItemProps & {
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
}) {
  const writerId = useWriterId();
  const { createCharacterNote, deleteCharacter } = useLocalWrite();
  const [creatingNote, setCreatingNote] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const charClickHandlers = useSidebarClickHandler(onCharacterActivate);

  const { data: rawNotes = [] } = useQuery<CharacterNoteRow>(
    isExpanded
      ? `SELECT id, kind, title, sort_order, character_id FROM character_note
         WHERE character_id = ? AND writer_id = ? AND kind != 'intro'
         ORDER BY sort_order ASC, created_at ASC`
      : `SELECT '' AS id, '' AS kind, '' AS title, 0 AS sort_order, '' AS character_id WHERE 0`,
    isExpanded ? [character.id, writerId] : [],
  );
  const notes = useOptimisticRows(rawNotes, {
    docType: 'character_note',
    characterId: character.id,
    matches: (row) => row.character_id === character.id,
  });

  const handleCreateNote = async (name: string) => {
    setCreatingNote(false);
    if (!name.trim()) return;
    const id = await createCharacterNote(character.id, name.trim(), nextSortOrder(notes));
    onNoteActivate(id, 'default');
  };

  const handleQuickAddNote = () => {
    if (!isExpanded) onToggleExpand();
    setCreatingNote(true);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteCharacter(character.id);
      onAfterCharDelete();
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      {/* 인물 이름 (루트 노드) */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            {...dragAttributes}
            {...dragListeners}
            className="group flex items-center"
          >
            <button
              type="button"
              {...charClickHandlers}
              title="클릭=메인 / 더블·⌘+클릭=핀"
              className={cn(
                'flex flex-1 items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
                isCharSelected
                  ? 'bg-secondary font-medium text-primary'
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
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand();
                }}
              />
              {character.name?.trim() || '(이름 없음)'}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleQuickAddNote(); }}
              title="하위 문서 추가"
              aria-label="하위 문서 추가"
              className="ml-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-hover:opacity-100"
            >
              <Plus size={12} strokeWidth={1.75} />
            </button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => handleQuickAddNote()}>
            <Plus size={12} /> 하위 추가
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem destructive onSelect={() => setDeleteOpen(true)}>
            <Trash2 size={12} /> 인물 삭제
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {deleteOpen && (
        <DeleteConfirmDialog
          title="인물 삭제"
          message={`'${character.name?.trim() || '(이름 없음)'}'을(를) 삭제하시겠습니까?`}
          warning="하위 문서가 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteOpen(false)}
        />
      )}

      {/* 하위 노트 (트리 자식) */}
      {isExpanded && (
        <div className="ml-3 border-l border-border/50 pl-2">
          {notes.length > 0 && (
            <SortableContext items={notes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
              {notes.map((note) => (
                <SortableNoteItem
                  key={note.id}
                  note={note}
                  characterId={character.id}
                  selected={selectedNoteId === note.id}
                  onSelect={(intent) => onNoteActivate(note.id, intent)}
                  onAfterDelete={() => onAfterNoteDelete(note.id)}
                />
              ))}
            </SortableContext>
          )}
          {creatingNote && (
            <InlineCreateInput
              placeholder="문서 이름을 입력하세요"
              onConfirm={(name) => void handleCreateNote(name)}
              onCancel={() => setCreatingNote(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface SortableNoteItemProps {
  note: CharacterNoteRow;
  characterId: string;
  selected: boolean;
  onSelect: (intent: ClickIntent) => void;
  onAfterDelete: () => void;
}

function SortableNoteItem(props: SortableNoteItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } =
    useSortable({
      id: props.note.id,
      data: {
        type: 'tree-node',
        docType: 'character_note',
        docId: props.note.id,
        depth: 1,
        parentId: props.characterId,
        characterId: props.characterId,
        title: props.note.title,
        sortOrder: props.note.sort_order ?? 0,
        rowSnapshot: {
          id: props.note.id,
          kind: props.note.kind,
          title: props.note.title,
          character_id: props.characterId,
          sort_order: props.note.sort_order ?? 0,
        },
      },
    });
  const style = { opacity: isDragging ? 0 : 1 };
  const zoneInfo = useDragZoneStore((s) =>
    s.overId === props.note.id ? s.zone : null,
  );
  return (
    <div ref={setNodeRef} style={style} className="relative">
      {zoneInfo === 'before' && (
        <div className="pointer-events-none absolute inset-x-0 -top-px h-0.5 bg-primary z-10" />
      )}
      <NoteItem
        {...props}
        dragAttributes={attributes}
        dragListeners={listeners}
      />
      {zoneInfo === 'after' && (
        <div className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 bg-primary z-10" />
      )}
    </div>
  );
}

function NoteItem({
  note,
  selected,
  onSelect,
  onAfterDelete,
  dragAttributes,
  dragListeners,
}: SortableNoteItemProps & {
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
}) {
  const { updateCharacterNoteTitle, deleteCharacterNote } = useLocalWrite();
  const isFixed = note.kind === 'appearance' || note.kind === 'personality';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.title);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const clickHandlers = useSidebarClickHandler(onSelect);

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
    void updateCharacterNoteTitle(note.id, next.slice(0, 200));
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

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteCharacterNote(note.id);
      onAfterDelete();
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
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

  // fixed 노트(외형/성격)는 ContextMenu 없음 — 정렬만 가능
  const row = (
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
          'flex-1 truncate rounded-md px-2 py-1 text-left text-xs hover:bg-sidebar-accent',
          selected
            ? 'bg-secondary font-medium text-primary'
            : 'text-sidebar-foreground',
        )}
      >
        {note.title?.trim() || '(제목 없음)'}
      </button>
    </div>
  );

  if (isFixed) {
    return row;
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setEditing(true)}>
            <Pencil size={12} /> 이름 변경
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem destructive onSelect={() => setDeleteOpen(true)}>
            <Trash2 size={12} /> 삭제
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {deleteOpen && (
        <DeleteConfirmDialog
          title="인물 문서 삭제"
          message={`'${note.title?.trim() || '(제목 없음)'}'을(를) 삭제하시겠습니까?`}
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </>
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
