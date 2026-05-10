import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
import { useDecryptedWorldNoteList, type RawWorldNoteRow } from '../../../hooks/useDecryptedWorldNote';
import { decryptWorkFieldOnce } from '../../../crypto/fieldDecrypt';
import { useSidebarClickHandler, SIDEBAR_ITEM_HINT } from '../../../lib/sidebarClickHandler';
import { Tooltip } from '../../ui/Tooltip';
import { cn } from '../../../lib/cn';
import { useDragZoneStore } from '../../../lib/dragZoneStore';
import { useOptimisticRows } from '../../../lib/useOptimisticRows';
import { useSortPreferenceStore } from '../../../stores/sortPreferenceStore';
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

interface NoteRow {
  id: string;
  name: string;
  work_id?: string;
  parent_id?: string | null;
  sort_order?: number | null;
  child_count?: number;
}

interface WorldNoteListProps {
  workId: string;
  searchTerm: string;
  selectedItemId: string | null;
  onItemSelect: (id: string | null, intent?: ClickIntent) => void;
  onNewWorldNote: (parentId?: string | null) => void;
}

export function WorldNoteList({
  workId,
  searchTerm,
  selectedItemId,
  onItemSelect,
  onNewWorldNote,
}: WorldNoteListProps) {
  const writerId = useWriterId();
  const { createWorldNote } = useLocalWrite();
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');

  const sortMode = useSortPreferenceStore((s) => s.byPanel['world-note'] ?? 'manual');
  const trimmed = searchTerm.trim();
  // name은 v1: 암호문 → SQL LIKE/ORDER BY name 불가, 클라이언트 측 처리
  const sql = `SELECT n.id, n.work_id, n.writer_id, n.parent_id, n.name, n.content,
                      n.sort_order, n.created_at, n.updated_at,
                      w.encrypted_dek AS encrypted_dek,
                      (SELECT COUNT(*) FROM world_note c WHERE c.parent_id = n.id) AS child_count
               FROM world_note n
               LEFT JOIN work w ON w.id = n.work_id
               WHERE n.work_id = ? AND n.writer_id = ? AND n.parent_id IS NULL
               ORDER BY n.sort_order ASC, n.created_at ASC`;
  const params = [workId, writerId];
  const { data: rawNoteRows = [], isFetching } = useQuery<RawWorldNoteRow & { child_count?: number }>(
    sql,
    params,
  );
  const rootChildCountById = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rawNoteRows) map.set(r.id, r.child_count ?? 0);
    return map;
  }, [rawNoteRows]);
  const { data: decryptedRoots } = useDecryptedWorldNoteList(rawNoteRows);
  const decryptedRootList: NoteRow[] = useMemo(
    () =>
      decryptedRoots.map((n) => ({
        id: n.id,
        name: n.name,
        work_id: n.work_id,
        parent_id: n.parent_id,
        sort_order: n.sort_order,
        child_count: rootChildCountById.get(n.id) ?? 0,
      })),
    [decryptedRoots, rootChildCountById],
  );
  const sortedRootList = useMemo(() => {
    let list = [...decryptedRootList];
    if (sortMode === 'alpha') {
      list.sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }),
      );
    }
    if (trimmed) {
      const lower = trimmed.toLowerCase();
      list = list.filter((r) => (r.name || '').toLowerCase().includes(lower));
    }
    return list;
  }, [decryptedRootList, sortMode, trimmed]);
  const notes = useOptimisticRows(sortedRootList, {
    docType: 'world_note',
    parentId: null,
    matches: (row) => row.work_id === workId,
  });
  const showEmpty = useDelayedEmptyState(notes.length === 0 && !creating && !isFetching);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelect = (id: string, intent: ClickIntent) => {
    onItemSelect(id, intent);
    // 메인에 올라가는 단일 클릭에서만 자동 펼침 (핀 적층은 트리 보존)
    if (intent === 'default') {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
  };

  const handleCreateRoot = () => {
    const trimmedTitle = createTitle.trim();
    setCreating(false);
    setCreateTitle('');
    if (!trimmedTitle) return;
    void (async () => {
      const id = await createWorldNote(workId, trimmedTitle, Date.now(), null);
      onItemSelect(id, 'default');
    })();
  };

  const handleCreateCancel = () => {
    setCreating(false);
    setCreateTitle('');
  };

  const handleCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); handleCreateRoot(); }
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
              placeholder="문서 이름을 입력 후 Enter"
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus size={14} strokeWidth={2} />
              <span>새 문서</span>
            </button>
          )}
          <SidebarSortPicker panelKey="world-note" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-1">
        {isFetching && notes.length === 0 && !creating ? (
          <SidebarListSkeleton />
        ) : showEmpty ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {trimmed ? '검색 결과가 없습니다.' : '세계관 문서가 없습니다.'}
          </p>
        ) : (
          <SortableContext items={notes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
            {notes.map((note) => (
              <SortableWorldNoteItem
                key={note.id}
                workId={workId}
                note={note}
                depth={0}
                parentId={null}
                selectedItemId={selectedItemId}
                expandedIds={expandedIds}
                onSelect={handleSelect}
                onToggleExpand={toggleExpand}
                onItemSelect={onItemSelect}
              />
            ))}
          </SortableContext>
        )}
      {/* 트리 끝 빈 영역 — 자식 노드를 root level로 빼낼 때 drop 타깃 (시각은 마지막 노드 after 밑줄로) */}
      <TreeRootEndDropZone
        docType="world_note"
        lastItemId={notes[notes.length - 1]?.id ?? null}
      />
      </div>
    </div>
  );
}

function TreeRootEndDropZone({
  docType,
  lastItemId,
}: {
  docType: 'world_note' | 'plot';
  lastItemId: string | null;
}) {
  const { setNodeRef } = useDroppable({
    id: `${docType}-tree-root-end`,
    data: { type: 'tree-root-end', docType, lastItemId },
  });
  return (
    <div
      ref={setNodeRef}
      className="mt-1 min-h-15 flex-1"
      aria-label="root level로 빼내기"
    />
  );
}

interface WorldNoteTreeItemProps {
  workId: string;
  note: NoteRow;
  depth: number;
  parentId: string | null;
  selectedItemId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string, intent: ClickIntent) => void;
  onToggleExpand: (id: string) => void;
  onItemSelect: (id: string | null, intent?: ClickIntent) => void;
}

function SortableWorldNoteItem(props: WorldNoteTreeItemProps) {
  // 드래그 reorder는 'manual' 정렬에서만 의미 — 다른 정렬 모드에서는 비활성
  const dragEnabled =
    useSortPreferenceStore((s) => s.byPanel['world-note'] ?? 'manual') === 'manual';
  const { attributes, listeners, setNodeRef, isDragging } =
    useSortable({
      id: props.note.id,
      disabled: !dragEnabled,
      data: {
        type: 'tree-node',
        docType: 'world_note',
        docId: props.note.id,
        depth: props.depth,
        parentId: props.parentId,
        title: props.note.name,
        sortOrder: props.note.sort_order ?? 0,
        rowSnapshot: {
          id: props.note.id,
          name: props.note.name,
          work_id: props.workId,
          parent_id: props.parentId,
          sort_order: props.note.sort_order ?? 0,
        },
      },
    });
  // transform/transition 제거 — 다른 노드 reflow 없음. DragOverlay가 미리보기.
  const style = { opacity: isDragging ? 0 : 1 };
  // 현재 노드의 over zone (병합/위/아래)
  const zoneInfo = useDragZoneStore((s) =>
    s.overId === props.note.id ? s.zone : null,
  );
  return (
    <div ref={setNodeRef} style={style} className="relative">
      {zoneInfo === 'before' && (
        <div className="pointer-events-none absolute inset-x-0 -top-px h-0.5 bg-primary z-10" />
      )}
      <WorldNoteTreeItem
        {...props}
        dragAttributes={attributes}
        dragListeners={listeners}
        isMergeOver={zoneInfo === 'merge'}
      />
      {zoneInfo === 'after' && (
        <div className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 bg-primary z-10" />
      )}
    </div>
  );
}

function WorldNoteTreeItem({
  workId,
  note,
  depth,
  parentId: _parentId,
  selectedItemId,
  expandedIds,
  onSelect,
  onToggleExpand,
  onItemSelect,
  dragAttributes,
  dragListeners,
  isMergeOver,
}: WorldNoteTreeItemProps & {
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  isMergeOver?: boolean;
}) {
  void _parentId;
  const writerId = useWriterId();
  const db = usePowerSync();
  const {
    updateWorldNoteName,
    createWorldNote,
    deleteWorldNote,
    placeWorldNote,
  } = useLocalWrite();
  const isExpanded = expandedIds.has(note.id);
  const isSelected = selectedItemId === note.id;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.name);
  const [creatingChild, setCreatingChild] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    onItemSelect(id, 'default');
  };

  const handleQuickAddChild = () => {
    if (!isExpanded) onToggleExpand(note.id);
    setCreatingChild(true);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteWorldNote(note.id);
      if (selectedItemId === note.id) onItemSelect(null);
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  /** 같은 부모 아래 사본 생성 — 본문 보존 + 원본 바로 다음 위치 */
  const handleDuplicate = async () => {
    const rows = await db.getAll<{ content: string | null; encrypted_dek: string | null }>(
      `SELECT n.content, w.encrypted_dek
         FROM world_note n LEFT JOIN work w ON w.id = n.work_id
         WHERE n.id = ? LIMIT 1`,
      [note.id],
    );
    const raw = rows[0];
    const content = raw
      ? await decryptWorkFieldOnce({
          workId,
          encryptedDek: raw.encrypted_dek,
          value: raw.content,
        })
      : null;
    const parentId = note.parent_id ?? null;
    const newId = await createWorldNote(
      workId,
      `${note.name?.trim() || '(이름 없음)'} (사본)`,
      Date.now(),
      parentId,
      content,
    );
    await placeWorldNote(newId, parentId, note.id, 'after');
  };

  /** 같은 부모 안에서 위/아래 형제와 sort_order swap */
  const fetchSiblings = async (): Promise<string[]> => {
    const parentId = note.parent_id ?? null;
    const sql =
      parentId === null
        ? `SELECT id FROM world_note
           WHERE work_id = ? AND writer_id = ? AND parent_id IS NULL
           ORDER BY sort_order ASC, created_at ASC`
        : `SELECT id FROM world_note
           WHERE parent_id = ? AND writer_id = ?
           ORDER BY sort_order ASC, created_at ASC`;
    const params = parentId === null ? [workId, writerId] : [parentId, writerId];
    const rows = await db.getAll<{ id: string }>(sql, params);
    return rows.map((r) => r.id);
  };
  const handleMoveUp = async () => {
    const ids = await fetchSiblings();
    const idx = ids.indexOf(note.id);
    if (idx <= 0) return;
    await placeWorldNote(note.id, note.parent_id ?? null, ids[idx - 1], 'before');
  };
  const handleMoveDown = async () => {
    const ids = await fetchSiblings();
    const idx = ids.indexOf(note.id);
    if (idx < 0 || idx >= ids.length - 1) return;
    await placeWorldNote(note.id, note.parent_id ?? null, ids[idx + 1], 'after');
  };

  const clickHandlers = useSidebarClickHandler((intent) => onSelect(note.id, intent));

  const childSortMode = useSortPreferenceStore((s) => s.byPanel['world-note'] ?? 'manual');
  const { data: rawChildRows = [] } = useQuery<RawWorldNoteRow & { child_count?: number }>(
    isExpanded
      ? `SELECT n.id, n.work_id, n.writer_id, n.parent_id, n.name, n.content,
                n.sort_order, n.created_at, n.updated_at,
                w.encrypted_dek AS encrypted_dek,
                (SELECT COUNT(*) FROM world_note c WHERE c.parent_id = n.id) AS child_count
         FROM world_note n
         LEFT JOIN work w ON w.id = n.work_id
         WHERE n.parent_id = ? AND n.writer_id = ?
         ORDER BY n.sort_order ASC, n.created_at ASC`
      : `SELECT NULL AS id, NULL AS work_id, NULL AS writer_id, NULL AS parent_id,
                NULL AS name, NULL AS content, NULL AS sort_order,
                NULL AS created_at, NULL AS updated_at,
                NULL AS encrypted_dek, 0 AS child_count WHERE 0`,
    isExpanded ? [note.id, writerId] : [],
  );
  const childCountById = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rawChildRows) map.set(r.id, r.child_count ?? 0);
    return map;
  }, [rawChildRows]);
  const { data: decryptedChildren } = useDecryptedWorldNoteList(rawChildRows);
  const childList: NoteRow[] = useMemo(() => {
    let list: NoteRow[] = decryptedChildren.map((n) => ({
      id: n.id,
      name: n.name,
      work_id: n.work_id,
      parent_id: n.parent_id,
      sort_order: n.sort_order,
      child_count: childCountById.get(n.id) ?? 0,
    }));
    if (childSortMode === 'alpha') {
      list = [...list].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }),
      );
    }
    return list;
  }, [decryptedChildren, childCountById, childSortMode]);
  const children = useOptimisticRows(childList, {
    docType: 'world_note',
    parentId: note.id,
    matches: (row) => row.parent_id === note.id,
  });

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
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              {...dragAttributes}
              {...dragListeners}
              className={cn(
                'group flex items-center rounded-md',
                isMergeOver && 'bg-primary/15 ring-1 ring-primary',
              )}
            >
              <Tooltip side="right" content={SIDEBAR_ITEM_HINT}>
                <button
                  type="button"
                  {...clickHandlers}
                  className={cn(
                    'flex flex-1 items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
                    isSelected
                      ? 'bg-secondary font-medium text-primary'
                      : 'text-sidebar-foreground',
                  )}
                >
                  {(note.child_count ?? 0) > 0 ? (
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
                  ) : (
                    <span className="inline-block w-3 shrink-0" aria-hidden="true" />
                  )}
                  {note.name?.trim() || '(이름 없음)'}
                </button>
              </Tooltip>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleQuickAddChild(); }}
                title="하위 문서 추가"
                aria-label="하위 문서 추가"
                className="ml-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-hover:opacity-100"
              >
                <Plus size={12} strokeWidth={1.75} />
              </button>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => onSelect(note.id, 'newTab')}>
              <SquareArrowOutUpRight size={12} /> 새 탭에서 열기
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onSelect(note.id, 'pin')}>
              <PanelRight size={12} /> 스테이지에 추가
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => handleQuickAddChild()}>
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
            <ContextMenuItem onSelect={() => setEditing(true)}>
              <Pencil size={12} /> 이름 변경
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem destructive onSelect={() => setDeleteOpen(true)}>
              <Trash2 size={12} /> 삭제
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}

      {deleteOpen && (
        <DeleteConfirmDialog
          title="세계관 문서 삭제"
          message={`'${note.name?.trim() || '(이름 없음)'}'을(를) 삭제하시겠습니까?`}
          warning="하위 문서가 있다면 함께 처리됩니다. 이 작업은 되돌릴 수 없습니다."
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteOpen(false)}
        />
      )}

      {isExpanded && (
        <div className="ml-3 border-l border-border/50 pl-2">
          {children.length > 0 && (
            <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {children.map((child) => (
                <SortableWorldNoteItem
                  key={child.id}
                  workId={workId}
                  note={child}
                  depth={depth + 1}
                  parentId={note.id}
                  selectedItemId={selectedItemId}
                  expandedIds={expandedIds}
                  onSelect={onSelect}
                  onToggleExpand={onToggleExpand}
                  onItemSelect={onItemSelect}
                />
              ))}
            </SortableContext>
          )}

          {creatingChild && (
            <InlineCreateInput
              placeholder="하위 문서 이름"
              onConfirm={(name) => void handleCreateChild(name)}
              onCancel={() => setCreatingChild(false)}
              small
            />
          )}
        </div>
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

