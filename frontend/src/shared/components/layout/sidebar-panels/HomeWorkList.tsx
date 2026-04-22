import { useQuery } from '@powersync/react';
import { GripVertical, Plus } from 'lucide-react';
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

interface WorkRow {
  id: string;
  title: string;
}

interface HomeWorkListProps {
  selectedWorkId: string | null;
  searchTerm: string;
  onWorkSelect: (id: string) => void;
  onNewWork: () => void;
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
  const { reorderItems } = useLocalWrite();
  const sensors = useSensors(
    useSensor(HandleOnlyPointerSensor),
  );
  const trimmed = searchTerm.trim();
  const sql = trimmed
    ? `SELECT id, title FROM work
       WHERE writer_id = ? AND status != 'trashed' AND title LIKE ? ESCAPE '\\'
       ORDER BY sort_order ASC, created_at ASC`
    : `SELECT id, title FROM work
       WHERE writer_id = ? AND status != 'trashed'
       ORDER BY sort_order ASC, created_at ASC`;
  const params = trimmed ? [writerId, `%${escapeLike(trimmed)}%`] : [writerId];
  const { data: works = [] } = useQuery<WorkRow>(sql, params);

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      <button
        type="button"
        onClick={onNewWork}
        className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        <Plus size={14} strokeWidth={2} />
        <span>새 작품</span>
      </button>
      {works.length === 0 ? (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          {trimmed ? '검색 결과가 없습니다.' : '작품이 없습니다.'}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            const oldIndex = works.findIndex((w) => w.id === active.id);
            const newIndex = works.findIndex((w) => w.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return;
            const reordered = arrayMove(works, oldIndex, newIndex);
            void reorderItems(
              'work',
              reordered.map((w, i) => ({ id: w.id, sortOrder: i * 1000 })),
            );
          }}
        >
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
        </DndContext>
      )}
    </div>
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
  const { listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: work.id });
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
        className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
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
        {work.title}
      </button>
    </div>
  );
}

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
