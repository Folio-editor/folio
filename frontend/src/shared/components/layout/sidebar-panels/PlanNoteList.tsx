import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
import { useDecryptedPlanNoteList } from '../../../hooks/useDecryptedPlanNote';
import { useDelayedEmptyState } from '../../../hooks/useDelayedEmptyState';
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
import { PlanTemplatePickerModal } from '../../../features/plan/PlanTemplatePickerModal';
import { serializeTemplateContent, type PlanTemplate } from '../../../features/plan/planTemplates';

interface NoteRow {
  id: string;
  title: string;
  work_id?: string;
  sort_order?: number | null;
  /** PR4: 복호화된 본문 — 복제(handleDuplicate) 경로에서 재암호화 시 사용. */
  content?: string | null;
}

interface RawPlanNoteJoinRow {
  id: string;
  work_id: string;
  writer_id: string;
  title: string | null;
  content: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  encrypted_dek: string | null;
}

interface PlanNoteListProps {
  workId: string;
  searchTerm: string;
  selectedItemId: string | null;
  onItemSelect: (id: string | null, intent?: ClickIntent) => void;
  /** caller에서 전달되지만 컴포넌트 내부에서 자체 모달로 처리하므로 미사용 */
  onNewPlanNote?: () => void;
}

export function PlanNoteList({
  workId,
  searchTerm,
  selectedItemId,
  onItemSelect,
}: PlanNoteListProps) {
  const writerId = useWriterId();
  const { createPlanNote } = useLocalWrite();
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PlanTemplate | null>(null);
  const selectedTemplateRef = useRef<PlanTemplate | null>(null);

  const sortMode = useSortPreferenceStore((s) => s.byPanel['plan'] ?? 'manual');
  const trimmed = searchTerm.trim();
  // PR4: title이 ciphertext가 될 수 있어 SQL LIKE/ORDER BY title 불가 — 클라이언트 측에서 처리.
  const { data: rawRows = [], isFetching } = useQuery<RawPlanNoteJoinRow>(
    `SELECT pn.id, pn.work_id, pn.writer_id, pn.title, pn.content,
            pn.sort_order, pn.created_at, pn.updated_at,
            w.encrypted_dek AS encrypted_dek
     FROM plan_note pn
     LEFT JOIN work w ON w.id = pn.work_id
     WHERE pn.work_id = ? AND pn.writer_id = ?`,
    [workId, writerId],
  );
  const { data: decryptedNotes } = useDecryptedPlanNoteList(rawRows);

  const filteredSortedNotes = useMemo<NoteRow[]>(() => {
    const lower = trimmed.toLowerCase();
    let list = decryptedNotes.map((n) => ({
      id: n.id,
      title: n.title,
      work_id: n.work_id,
      sort_order: n.sort_order,
      content: n.content,
      created_at: n.created_at,
      updated_at: n.updated_at,
    }));
    if (lower) {
      list = list.filter((n) => n.title.toLowerCase().includes(lower));
    }
    if (sortMode === 'alpha') {
      list.sort(
        (a, b) =>
          a.title.localeCompare(b.title, 'ko') ||
          a.created_at.localeCompare(b.created_at),
      );
    } else if (sortMode === 'recent') {
      list.sort(
        (a, b) =>
          b.updated_at.localeCompare(a.updated_at) ||
          b.created_at.localeCompare(a.created_at),
      );
    } else {
      list.sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          a.created_at.localeCompare(b.created_at),
      );
    }
    return list.map(({ created_at: _ca, updated_at: _ua, ...rest }) => rest);
  }, [decryptedNotes, trimmed, sortMode]);

  const notes = useOptimisticRows(filteredSortedNotes, {
    docType: 'plan_note',
    workId,
    matches: (row) => row.work_id === workId,
  });
  const showEmpty = useDelayedEmptyState(notes.length === 0 && !creating && !isFetching);

  const handleCreate = () => {
    const trimmedTitle = createTitle.trim();
    const template = selectedTemplateRef.current ?? selectedTemplate;
    setCreating(false);
    setCreateTitle('');
    if (!trimmedTitle) {
      setSelectedTemplate(null);
      selectedTemplateRef.current = null;
      return;
    }
    void createWithName(trimmedTitle, template);
  };

  const handleCreateCancel = () => {
    setCreating(false);
    setCreateTitle('');
    setSelectedTemplate(null);
    selectedTemplateRef.current = null;
  };

  const handleCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
    if (e.key === 'Escape') { e.preventDefault(); handleCreateCancel(); }
  };

  const createWithName = async (name: string, template: PlanTemplate | null) => {
    const content = template ? serializeTemplateContent(template) : null;
    const id = await createPlanNote(workId, name, Date.now(), content);
    setSelectedTemplate(null);
    selectedTemplateRef.current = null;
    onItemSelect(id, 'default');
  };

  const handleStartCreate = () => setPickerOpen(true);

  const handleTemplateSelect = (template: PlanTemplate) => {
    selectedTemplateRef.current = template;
    setSelectedTemplate(template);
    setPickerOpen(false);
    setCreating(true);
  };

  const handlePickerClose = () => {
    setPickerOpen(false);
    setSelectedTemplate(null);
    selectedTemplateRef.current = null;
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
              onClick={handleStartCreate}
              className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus size={14} strokeWidth={2} />
              <span>새 문서</span>
            </button>
          )}
          <SidebarSortPicker panelKey="plan" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-1">
        {isFetching && notes.length === 0 && !creating ? (
          <SidebarListSkeleton />
        ) : showEmpty ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {trimmed ? '검색 결과가 없습니다.' : '기획 문서가 없습니다.'}
          </p>
        ) : (
          <SortableContext items={notes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
            {notes.map((note) => (
              <SortableNoteItem
                key={note.id}
                note={note}
                workId={workId}
                selected={selectedItemId === note.id}
                onSelect={(intent) => onItemSelect(note.id, intent)}
                onAfterDelete={() => {
                  if (selectedItemId === note.id) onItemSelect(null);
                }}
              />
            ))}
          </SortableContext>
        )}
        <TreeRootEndDropZone lastItemId={notes[notes.length - 1]?.id ?? null} />
      </div>

      <PlanTemplatePickerModal
        open={pickerOpen}
        onSelect={handleTemplateSelect}
        onClose={handlePickerClose}
      />
    </div>
  );
}

function TreeRootEndDropZone({ lastItemId }: { lastItemId: string | null }) {
  const { setNodeRef } = useDroppable({
    id: 'plan_note-tree-root-end',
    data: { type: 'tree-root-end', docType: 'plan_note', lastItemId },
  });
  return (
    <div
      ref={setNodeRef}
      className="mt-1 min-h-15 flex-1"
      aria-label="목록 끝으로 이동"
    />
  );
}

interface SortableNoteItemProps {
  note: NoteRow;
  workId: string;
  selected: boolean;
  onSelect: (intent: ClickIntent) => void;
  onAfterDelete: () => void;
}

function SortableNoteItem(props: SortableNoteItemProps) {
  const dragEnabled =
    useSortPreferenceStore((s) => s.byPanel['plan'] ?? 'manual') === 'manual';
  const { attributes, listeners, setNodeRef, isDragging } =
    useSortable({
      id: props.note.id,
      disabled: !dragEnabled,
      data: {
        type: 'tree-node',
        docType: 'plan_note',
        docId: props.note.id,
        depth: 0,
        parentId: null,
        workId: props.workId,
        title: props.note.title,
        sortOrder: props.note.sort_order ?? 0,
        rowSnapshot: {
          id: props.note.id,
          title: props.note.title,
          work_id: props.workId,
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
        workId={props.workId}
        note={props.note}
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

function NoteItem({
  workId,
  note,
  selected,
  onSelect,
  onAfterDelete,
  dragAttributes,
  dragListeners,
}: {
  workId: string;
  note: NoteRow;
  selected: boolean;
  onSelect: (intent: ClickIntent) => void;
  onAfterDelete: () => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
}) {
  const writerId = useWriterId();
  const db = usePowerSync();
  const {
    updatePlanNoteTitle,
    deletePlanNote,
    createPlanNote,
    placePlanNote,
  } = useLocalWrite();
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
    void updatePlanNoteTitle(note.id, next.slice(0, 200));
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
      await deletePlanNote(note.id);
      onAfterDelete();
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async () => {
    // PR4: note.content는 useDecryptedPlanNoteList가 이미 복호화한 평문.
    // 평문을 createPlanNote에 넘기면 다시 work_key로 암호화되어 저장된다.
    const newId = await createPlanNote(
      workId,
      `${note.title?.trim() || '(제목 없음)'} (사본)`,
      Date.now(),
      note.content ?? null,
    );
    await placePlanNote(newId, workId, note.id, 'after');
  };

  const fetchSiblings = async (): Promise<string[]> => {
    const rows = await db.getAll<{ id: string }>(
      `SELECT id FROM plan_note
       WHERE work_id = ? AND writer_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
      [workId, writerId],
    );
    return rows.map((r) => r.id);
  };
  const handleMoveUp = async () => {
    const ids = await fetchSiblings();
    const idx = ids.indexOf(note.id);
    if (idx <= 0) return;
    await placePlanNote(note.id, workId, ids[idx - 1], 'before');
  };
  const handleMoveDown = async () => {
    const ids = await fetchSiblings();
    const idx = ids.indexOf(note.id);
    if (idx < 0 || idx >= ids.length - 1) return;
    await placePlanNote(note.id, workId, ids[idx + 1], 'after');
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
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            {...dragAttributes}
            {...dragListeners}
            className="group flex items-center"
          >
            <Tooltip side="right" content={SIDEBAR_ITEM_HINT}>
              <button
                type="button"
                {...clickHandlers}
                className={cn(
                  'flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
                  selected
                    ? 'bg-secondary font-medium text-primary'
                    : 'text-sidebar-foreground',
                )}
              >
                {note.title?.trim() || '(제목 없음)'}
              </button>
            </Tooltip>
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
            <Trash2 size={12} /> 삭제
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {deleteOpen && (
        <DeleteConfirmDialog
          title="기획 문서 삭제"
          message={`'${note.title?.trim() || '(제목 없음)'}'을(를) 삭제하시겠습니까?`}
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </>
  );
}

