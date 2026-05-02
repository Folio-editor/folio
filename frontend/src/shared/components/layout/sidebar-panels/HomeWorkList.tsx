import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useDroppable, type DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { useWriterId } from '../../../hooks/useWriterId';
import { useLocalWrite } from '../../../hooks/useLocalWrite';
import { useDecryptedWorkList } from '../../../hooks/useDecryptedWork';
import { cn } from '../../../lib/cn';
import { useDragZoneStore } from '../../../lib/dragZoneStore';
import { useOptimisticRows } from '../../../lib/useOptimisticRows';
import { useSortPreferenceStore } from '../../../stores/sortPreferenceStore';
import { SidebarSortPicker } from './SidebarSortPicker';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../../ui/context-menu';
import { DeleteConfirmDialog } from '../../ui/DeleteConfirmDialog';

interface WorkRow {
  id: string;
  title: string;
  sort_order?: number | null;
}

interface HomeWorkListProps {
  selectedWorkId: string | null;
  searchTerm: string;
  onWorkSelect: (id: string) => void;
  onNewWork: (title: string) => void;
}

/**
 * home 액티비티 전용 작품 목록 패널.
 * - "+ 새 작품" 버튼 + 작품 리스트
 * - 검색어가 있으면 title LIKE 로 필터
 */
export function HomeWorkList({
  selectedWorkId,
  searchTerm,
  onWorkSelect,
  onNewWork,
}: HomeWorkListProps) {
  const writerId = useWriterId();
  const [showInput, setShowInput] = useState(false);
  const [title, setTitle] = useState('');

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onNewWork(trimmed);
    setTitle('');
    setShowInput(false);
  };

  const handleCancel = () => {
    setShowInput(false);
    setTitle('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') handleCancel();
  };

  const sortMode = useSortPreferenceStore((s) => s.byPanel['home-work'] ?? 'manual');
  const trimmed = searchTerm.trim();
  // PR2 — title이 v1: 암호문일 수 있어 DB의 LIKE/ORDER BY가 평문 기준으로 작동하지 않는다.
  // 모든 작품을 받아 batch 복호화 후 메모리에서 필터·정렬한다.
  const { data: rawWorks = [] } = useQuery<{
    id: string;
    writer_id: string;
    title: string | null;
    author_name: string | null;
    description: string | null;
    status: string;
    sort_order: number | null;
    created_at: string;
    updated_at: string;
    encrypted_dek: string | null;
  }>(
    `SELECT id, writer_id, title, author_name, description, status,
            sort_order, created_at, updated_at, encrypted_dek
     FROM work WHERE writer_id = ? AND status != 'trashed'`,
    [writerId],
  );
  const { data: decryptedWorks } = useDecryptedWorkList(rawWorks);

  const filteredAndSorted = useMemo<WorkRow[]>(() => {
    const lowerTerm = trimmed.toLowerCase();
    let list: WorkRow[] = decryptedWorks.map((w) => ({
      id: w.id,
      title: w.title,
      sort_order: w.sort_order,
    }));
    if (lowerTerm) {
      list = list.filter((w) => (w.title ?? '').toLowerCase().includes(lowerTerm));
    }
    if (sortMode === 'alpha') {
      list = list.sort((a, b) =>
        (a.title ?? '').localeCompare(b.title ?? '', 'ko'),
      );
    } else if (sortMode === 'recent') {
      // updated_at은 ISO 문자열이라 lexical 비교 = 시간 비교 — DB ORDER BY와 동일.
      // decryptedWorks에 updated_at이 있어야 정렬 가능 → rawWorks를 직접 참조.
      const updatedAtById = new Map(rawWorks.map((r) => [r.id, r.updated_at]));
      list = list.sort((a, b) => {
        const ua = updatedAtById.get(a.id) ?? '';
        const ub = updatedAtById.get(b.id) ?? '';
        return ub.localeCompare(ua);
      });
    } else {
      // manual (기본)
      list = list.sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );
    }
    return list;
  }, [decryptedWorks, trimmed, sortMode, rawWorks]);

  const works = useOptimisticRows(filteredAndSorted, {
    docType: 'work',
    matches: () => true,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pt-2 pb-1">
        <div className="flex items-center gap-1.5">
          {showInput ? (
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleCancel}
              placeholder="작품 제목을 입력 후 Enter"
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowInput(true)}
              className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus size={14} strokeWidth={2} />
              <span>새 작품</span>
            </button>
          )}
          <SidebarSortPicker panelKey="home-work" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-1">
        {works.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {trimmed ? '검색 결과가 없습니다.' : '작품이 없습니다.'}
          </p>
        ) : (
          <SortableContext items={works.map((w) => w.id)} strategy={verticalListSortingStrategy}>
            {works.map((work) => (
              <SortableWorkItem
                key={work.id}
                work={work}
                selected={selectedWorkId === work.id}
                onSelect={() => onWorkSelect(work.id)}
              />
            ))}
          </SortableContext>
        )}
        <WorkRootEndDropZone lastItemId={works[works.length - 1]?.id ?? null} />
      </div>
    </div>
  );
}

function WorkRootEndDropZone({ lastItemId }: { lastItemId: string | null }) {
  const { setNodeRef } = useDroppable({
    id: 'work-tree-root-end',
    data: { type: 'tree-root-end', docType: 'work', lastItemId },
  });
  return (
    <div
      ref={setNodeRef}
      className="mt-1 min-h-15 flex-1"
      aria-label="작품 목록 끝으로 이동"
    />
  );
}

function SortableWorkItem({
  work,
  selected,
  onSelect,
}: {
  work: WorkRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const dragEnabled =
    useSortPreferenceStore((s) => s.byPanel['home-work'] ?? 'manual') === 'manual';
  const { attributes, listeners, setNodeRef, isDragging } =
    useSortable({
      id: work.id,
      disabled: !dragEnabled,
      data: {
        type: 'tree-node',
        docType: 'work',
        docId: work.id,
        depth: 0,
        parentId: null,
        title: work.title,
        sortOrder: work.sort_order ?? 0,
        rowSnapshot: {
          id: work.id,
          title: work.title,
          sort_order: work.sort_order ?? 0,
        },
      },
    });
  const style = { opacity: isDragging ? 0 : 1 };
  const zoneInfo = useDragZoneStore((s) => (s.overId === work.id ? s.zone : null));
  return (
    <div ref={setNodeRef} style={style} className="relative">
      {zoneInfo === 'before' && (
        <div className="pointer-events-none absolute inset-x-0 -top-px h-0.5 bg-primary z-10" />
      )}
      <WorkItem
        work={work}
        selected={selected}
        onSelect={onSelect}
        dragAttributes={attributes}
        dragListeners={listeners}
      />
      {zoneInfo === 'after' && (
        <div className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 bg-primary z-10" />
      )}
    </div>
  );
}

function WorkItem({
  work,
  selected,
  onSelect,
  dragAttributes,
  dragListeners,
}: {
  work: WorkRow;
  selected: boolean;
  onSelect: () => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
}) {
  const { updateWork, deleteWork } = useLocalWrite();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(work.title);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(work.title);
  }, [editing, work.title]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === work.title) {
      setDraft(work.title);
      return;
    }
    void updateWork(work.id, { title: next.slice(0, 200) });
  };

  const cancel = () => {
    setDraft(work.title);
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
      await deleteWork(work.id);
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
            <button
              type="button"
              onClick={onSelect}
              className={cn(
                'flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
                selected
                  ? 'bg-secondary font-medium text-primary'
                  : 'text-sidebar-foreground',
              )}
            >
              {work.title}
            </button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setEditing(true)}>
            <Pencil size={12} /> 이름 변경
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem destructive onSelect={() => setDeleteOpen(true)}>
            <Trash2 size={12} /> 휴지통으로 이동
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {deleteOpen && (
        <DeleteConfirmDialog
          title="작품 휴지통 이동"
          message={`'${work.title}'을(를) 휴지통으로 이동하시겠습니까?`}
          warning="30일 후 자동으로 영구 삭제됩니다. 휴지통에서 복원할 수 있습니다."
          confirmLabel="휴지통으로 이동"
          busyLabel="이동 중…"
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </>
  );
}

