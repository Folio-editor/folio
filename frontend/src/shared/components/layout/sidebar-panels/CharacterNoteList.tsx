import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery, usePowerSync } from '@powersync/react';
import {
  ChevronDown,
  ChevronRight,
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

  const sortMode = useSortPreferenceStore((s) => s.byPanel['character'] ?? 'manual');
  const tagFilter = useFilterPreferenceStore(
    (s) => s.byPanel['character-tag'] ?? (EMPTY_FILTER as string[]),
  );
  const clearFilter = useFilterPreferenceStore((s) => s.clear);
  const trimmed = searchTerm.trim();
  const whereName = trimmed ? `AND name LIKE ? ESCAPE '\\'` : '';
  const orderBy = buildOrderBy(sortMode, { titleColumn: 'name' });
  // 태그 필터 — character_tag 다대다 EXISTS 절 (선택된 world_note 중 하나라도 가진 캐릭터)
  const tagPlaceholders = tagFilter.map(() => '?').join(', ');
  const tagClause =
    tagFilter.length > 0
      ? `AND EXISTS (SELECT 1 FROM character_tag ct
                       WHERE ct.character_id = character.id
                         AND ct.world_note_id IN (${tagPlaceholders}))`
      : '';
  const sql = `SELECT id, name, work_id, sort_order FROM character
     WHERE work_id = ? AND writer_id = ? ${whereName} ${tagClause}
     ${orderBy}`;
  const params = [
    workId,
    writerId,
    ...(trimmed ? [`%${escapeLike(trimmed)}%`] : []),
    ...tagFilter,
  ];
  const { data: rawCharacters = [], isFetching } = useQuery<CharacterRow>(sql, params);
  const characters = useOptimisticRows(rawCharacters, {
    docType: 'character',
    workId,
    matches: (row) => row.work_id === workId,
  });
  const showEmpty = useDelayedEmptyState(characters.length === 0 && !creating && !isFetching);

  const handleCreateChar = () => {
    const trimmedTitle = createTitle.trim();
    setCreating(false);
    setCreateTitle('');
    if (!trimmedTitle) return;
    void (async () => {
      if (tagFilter.length > 0) clearFilter('character-tag');
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
        <div className="flex items-center gap-1.5">
          {creating ? (
            <input
              autoFocus
              type="text"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              onKeyDown={handleCreateKeyDown}
              onBlur={handleCreateCancel}
              placeholder="인물 이름을 입력 후 Enter"
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus size={14} strokeWidth={2} />
              <span>새 인물</span>
            </button>
          )}
          <SidebarSortPicker panelKey="character" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-1">
        {isFetching && characters.length === 0 && !creating ? (
          <SidebarListSkeleton />
        ) : showEmpty ? (
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
  const dragEnabled =
    useSortPreferenceStore((s) => s.byPanel['character'] ?? 'manual') === 'manual';
  const { attributes, listeners, setNodeRef, isDragging } =
    useSortable({
      id: props.character.id,
      disabled: !dragEnabled,
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
  workId,
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
  const db = usePowerSync();
  const {
    createCharacter,
    createCharacterNote,
    deleteCharacter,
    placeCharacter,
  } = useLocalWrite();
  const [creatingNote, setCreatingNote] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const charClickHandlers = useSidebarClickHandler(onCharacterActivate);

  const noteSortMode = useSortPreferenceStore((s) => s.byPanel['character'] ?? 'manual');
  const noteOrderBy = buildOrderBy(noteSortMode, { titleColumn: 'title' });
  const { data: rawNotes = [] } = useQuery<CharacterNoteRow>(
    isExpanded
      ? `SELECT id, kind, title, sort_order, character_id FROM character_note
         WHERE character_id = ? AND writer_id = ? AND kind != 'intro'
         ${noteOrderBy}`
      : `SELECT '' AS id, '' AS kind, '' AS title, 0 AS sort_order, '' AS character_id WHERE 0`,
    isExpanded ? [character.id, writerId] : [],
  );
  // chevron 표시 조건 — intro 제외 자식 노트가 1개라도 있으면 펼침 화살표 노출
  const { data: childCountRows = [] } = useQuery<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM character_note
     WHERE character_id = ? AND writer_id = ? AND kind != 'intro'`,
    [character.id, writerId],
  );
  const hasChildNotes = (childCountRows[0]?.cnt ?? 0) > 0;
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

  /**
   * 인물 복제 — character row 자체만 복제 (사본 캐릭터 개요 노트는 ensureCharacterNotes 가 자동 생성).
   * 커스텀 노트(kind='custom')는 사본하지 않음. 명시 한계.
   */
  const handleDuplicate = async () => {
    const rows = await db.getAll<{ gender: string | null; age: string | null }>(
      'SELECT gender, age FROM "character" WHERE id = ? LIMIT 1',
      [character.id],
    );
    const gender = rows[0]?.gender ?? '';
    const age = rows[0]?.age ?? '';
    const newId = await createCharacter(
      workId,
      `${character.name?.trim() || '(이름 없음)'} (사본)`,
      gender,
      age,
      Date.now(),
    );
    await placeCharacter(newId, workId, character.id, 'after');
  };

  const fetchSiblings = async (): Promise<string[]> => {
    const rows = await db.getAll<{ id: string }>(
      `SELECT id FROM "character"
       WHERE work_id = ? AND writer_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
      [workId, writerId],
    );
    return rows.map((r) => r.id);
  };
  const handleMoveUp = async () => {
    const ids = await fetchSiblings();
    const idx = ids.indexOf(character.id);
    if (idx <= 0) return;
    await placeCharacter(character.id, workId, ids[idx - 1], 'before');
  };
  const handleMoveDown = async () => {
    const ids = await fetchSiblings();
    const idx = ids.indexOf(character.id);
    if (idx < 0 || idx >= ids.length - 1) return;
    await placeCharacter(character.id, workId, ids[idx + 1], 'after');
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
              {hasChildNotes ? (
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
              ) : (
                <span className="w-3 shrink-0" aria-hidden />
              )}
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
          <ContextMenuItem onSelect={() => onCharacterActivate('newTab')}>
            <SquareArrowOutUpRight size={12} /> 새 탭에서 열기
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onCharacterActivate('pin')}>
            <PanelRight size={12} /> 스테이지에 추가
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => handleQuickAddNote()}>
            <Plus size={12} /> 하위 추가
          </ContextMenuItem>
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
  characterId,
  selected,
  onSelect,
  onAfterDelete,
  dragAttributes,
  dragListeners,
}: SortableNoteItemProps & {
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
}) {
  const writerId = useWriterId();
  const db = usePowerSync();
  const {
    updateCharacterNoteTitle,
    deleteCharacterNote,
    createCharacterNote,
    placeCharacterNote,
  } = useLocalWrite();
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

  const handleDuplicate = async () => {
    const rows = await db.getAll<{ content: string | null }>(
      'SELECT content FROM character_note WHERE id = ? LIMIT 1',
      [note.id],
    );
    const content = rows[0]?.content ?? null;
    const newId = await createCharacterNote(
      characterId,
      `${note.title?.trim() || '(제목 없음)'} (사본)`,
      Date.now(),
      content,
    );
    await placeCharacterNote(newId, characterId, note.id, 'after');
  };

  const fetchSiblings = async (): Promise<string[]> => {
    const rows = await db.getAll<{ id: string }>(
      `SELECT id FROM character_note
       WHERE character_id = ? AND writer_id = ? AND kind != 'intro'
       ORDER BY sort_order ASC, created_at ASC`,
      [characterId, writerId],
    );
    return rows.map((r) => r.id);
  };
  const handleMoveUp = async () => {
    const ids = await fetchSiblings();
    const idx = ids.indexOf(note.id);
    if (idx <= 0) return;
    await placeCharacterNote(note.id, characterId, ids[idx - 1], 'before');
  };
  const handleMoveDown = async () => {
    const ids = await fetchSiblings();
    const idx = ids.indexOf(note.id);
    if (idx < 0 || idx >= ids.length - 1) return;
    await placeCharacterNote(note.id, characterId, ids[idx + 1], 'after');
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
