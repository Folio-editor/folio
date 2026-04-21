import { useState } from 'react';
import { useQuery } from '@powersync/react';
import { GripVertical, Trash2 } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useWriterId } from '../../../hooks/useWriterId';
import { useLocalWrite } from '../../../hooks/useLocalWrite';
import { DeleteConfirmDialog } from '../../ui/DeleteConfirmDialog';
import { WorkspaceSection, SECTION_TABLES } from '../../../types/workspace';
import { HandleOnlyPointerSensor } from '../../../lib/HandleOnlyPointerSensor';
import { cn } from '../../../lib/cn';

interface SectionItemListProps {
  section: Exclude<WorkspaceSection, 'plan' | 'world-note' | 'plot' | 'episode'>;
  workId: string;
  searchTerm: string;
  selectedItemId: string | null;
  onItemSelect: (id: string | null) => void;
}

interface Row {
  id: string;
  label: string | null;
}

/**
 * 범용 섹션 항목 리스트 (character / plot / episode / foreshadow / idea-archive).
 * - 테이블별 라벨 필드 매핑으로 통일된 UI 제공
 * - 검색어는 라벨 필드에 LIKE 매칭
 */
export function SectionItemList({
  section,
  workId,
  searchTerm,
  selectedItemId,
  onItemSelect,
}: SectionItemListProps) {
  const writerId = useWriterId();
  const { reorderItems, deleteForeshadow, deleteIdeaArchive } = useLocalWrite();
  const sensors = useSensors(useSensor(HandleOnlyPointerSensor));
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const table = SECTION_TABLES[section];
  const labelField = LABEL_FIELDS[section];

  const trimmed = searchTerm.trim();
  const whereSearch = trimmed ? `AND ${labelField} LIKE ? ESCAPE '\\'` : '';
  const sql = `SELECT id, ${labelField} AS label FROM ${table}
     WHERE work_id = ? AND writer_id = ? ${whereSearch}
     ORDER BY sort_order ASC, created_at ASC`;
  const params = trimmed
    ? [workId, writerId, `%${escapeLike(trimmed)}%`]
    : [workId, writerId];

  const { data: rows = [] } = useQuery<Row>(sql, params);

  if (rows.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-xs text-muted-foreground">
        {trimmed ? '검색 결과가 없습니다.' : EMPTY_LABELS[section]}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(event: DragEndEvent) => {
          const { active, over } = event;
          if (!over || active.id === over.id) return;
          const oldIndex = rows.findIndex((row) => row.id === active.id);
          const newIndex = rows.findIndex((row) => row.id === over.id);
          if (oldIndex === -1 || newIndex === -1) return;
          const reordered = arrayMove(rows, oldIndex, newIndex);
          void reorderItems(
            table,
            reordered.map((row, i) => ({ id: row.id, sortOrder: i * 1000 })),
          );
        }}
      >
        <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
          {rows.map((row) => {
            const raw = row.label?.trim() || '';
            const display =
              section === 'idea-archive'
                ? extractPlainText(raw) || PLACEHOLDER_LABELS[section]
                : raw || PLACEHOLDER_LABELS[section];
            return (
              <SortableSectionItem
                key={row.id}
                id={row.id}
                label={display}
                selected={selectedItemId === row.id}
                onSelect={() => onItemSelect(row.id)}
                onDelete={
                  section === 'foreshadow' || section === 'idea-archive'
                    ? () => setDeleteTarget({ id: row.id, label: display })
                    : null
                }
              />
            );
          })}
        </SortableContext>
      </DndContext>
      {deleteTarget && (
        <DeleteConfirmDialog
          title={DELETE_LABELS[section]}
          message={`"${deleteTarget.label}" 항목이 삭제됩니다.`}
          warning="이 작업은 되돌릴 수 없습니다."
          confirmLabel="삭제"
          busyLabel="삭제 중…"
          busy={deleteBusy}
          onConfirm={() => {
            setDeleteBusy(true);
            const action =
              section === 'foreshadow'
                ? deleteForeshadow(deleteTarget.id)
                : section === 'idea-archive'
                  ? deleteIdeaArchive(deleteTarget.id)
                  : Promise.resolve();
            void action.then(() => {
              if (selectedItemId === deleteTarget.id) onItemSelect(null);
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

function SortableSectionItem({
  id,
  label,
  selected,
  onSelect,
  onDelete,
}: {
  id: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
  onDelete: (() => void) | null;
}) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group flex items-center">
      <span
        {...listeners}
        data-dnd-handle
        className="cursor-grab opacity-0 transition-opacity group-hover:opacity-100"
      >
        <GripVertical size={12} className="text-muted-foreground" />
      </span>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
          selected
            ? 'bg-primary/5 font-medium text-primary'
            : 'text-sidebar-foreground',
        )}
      >
        {label}
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="삭제"
          className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 size={12} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

const LABEL_FIELDS: Record<SectionItemListProps['section'], string> = {
  character: 'name',
  foreshadow: 'title',
  'idea-archive': 'content',
};

const EMPTY_LABELS: Record<SectionItemListProps['section'], string> = {
  character: '등장인물이 없습니다.',
  foreshadow: '복선이 없습니다.',
  'idea-archive': '아이디어가 없습니다.',
};

const PLACEHOLDER_LABELS: Record<SectionItemListProps['section'], string> = {
  character: '(이름 없음)',
  foreshadow: '(제목 없음)',
  'idea-archive': '(내용 없음)',
};

const DELETE_LABELS: Record<SectionItemListProps['section'], string> = {
  character: '삭제',
  foreshadow: '복선 삭제',
  'idea-archive': '아이디어 삭제',
};

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** TipTap JSON content에서 일반 텍스트만 추출 */
function extractPlainText(raw: string): string {
  if (!raw) return '';
  try {
    const json = JSON.parse(raw);
    return collectText(json).trim();
  } catch {
    return raw;
  }
}

function collectText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n.text === 'string') return n.text;
  if (Array.isArray(n.content)) return n.content.map(collectText).join(' ');
  return '';
}
