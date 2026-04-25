import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import { GripVertical, Pencil, Plus } from 'lucide-react';
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
import { useSidebarClickHandler } from '../../../lib/sidebarClickHandler';
import { cn } from '../../../lib/cn';
import { setupDragTransfer } from '../../../lib/dragTransfer';
import type { ClickIntent } from '../../../types/workspace';
import { PlanTemplatePickerModal } from '../../../features/plan/PlanTemplatePickerModal';
import { serializeTemplateContent, type PlanTemplate } from '../../../features/plan/planTemplates';

interface NoteRow {
  id: string;
  title: string;
}

interface PlanNoteListProps {
  workId: string;
  searchTerm: string;
  selectedItemId: string | null;
  onItemSelect: (id: string | null, intent?: ClickIntent) => void;
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
  const [createTitle, setCreateTitle] = useState('');
  // 신규 문서 흐름 1단계: 템플릿 선택 모달.
  // 모달에서 템플릿 선택 → setCreating(true)로 인라인 입력 단계 진입.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PlanTemplate | null>(null);
  const sensors = useSensors(
    useSensor(HandleOnlyPointerSensor),
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

  const handleCreate = () => {
    const trimmedTitle = createTitle.trim();
    setCreating(false);
    setCreateTitle('');
    if (!trimmedTitle) {
      // 빈 제목으로 종료 시 템플릿 선택도 무효화 (다음 시도엔 다시 모달부터)
      setSelectedTemplate(null);
      return;
    }
    void createWithName(trimmedTitle);
  };

  const handleCreateCancel = () => {
    setCreating(false);
    setCreateTitle('');
    setSelectedTemplate(null);
  };

  const handleCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
    if (e.key === 'Escape') { e.preventDefault(); handleCreateCancel(); }
  };

  const { createPlanNote } = useLocalWrite();
  const createWithName = async (name: string) => {
    const content = selectedTemplate ? serializeTemplateContent(selectedTemplate) : null;
    const id = await createPlanNote(workId, name, Date.now(), content);
    setSelectedTemplate(null);
    onItemSelect(id, 'default');
  };

  // "+ 새 문서" 클릭 → 템플릿 선택 모달 진입
  const handleStartCreate = () => setPickerOpen(true);

  // 모달에서 템플릿 카드 선택 → 인라인 제목 입력 단계로 전환
  const handleTemplateSelect = (template: PlanTemplate) => {
    setSelectedTemplate(template);
    setPickerOpen(false);
    setCreating(true);
  };

  // 모달 ESC/배경 클릭 — creating 미진입 (모든 상태 초기화)
  const handlePickerClose = () => {
    setPickerOpen(false);
    setSelectedTemplate(null);
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
            placeholder="문서 이름을 입력 후 Enter"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
          />
        ) : (
          <button
            type="button"
            onClick={handleStartCreate}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus size={14} strokeWidth={2} />
            <span>새 문서</span>
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-1">
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
                onSelect={(intent) => onItemSelect(note.id, intent)}
                onRename={(title) => void updatePlanNoteTitle(note.id, title)}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
      </div>

      <PlanTemplatePickerModal
        open={pickerOpen}
        onSelect={handleTemplateSelect}
        onClose={handlePickerClose}
      />
    </div>
  );
}

/* ── 정렬 가능한 항목 래퍼 ── */

function SortableNoteItem(props: {
  note: NoteRow;
  selected: boolean;
  onSelect: (intent: ClickIntent) => void;
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
  onSelect: (intent: ClickIntent) => void;
  onRename: (title: string) => void;
  dragListeners?: Record<string, unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.title);
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
    <div
      className="group flex items-center"
      draggable="true"
      onDragStart={(e) => setupDragTransfer(e, 'plan_note', note.id, note.title)}
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
        {...clickHandlers}
        title="클릭=메인 / 더블·⌘+클릭=핀"
        className={cn(
          'flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
          selected
            ? 'bg-primary/5 font-medium text-primary'
            : 'text-sidebar-foreground',
        )}
      >
        {note.title?.trim() || '(제목 없음)'}
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        title="이름 변경"
        aria-label="이름 변경"
        className="ml-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-hover:opacity-100"
      >
        <Pencil size={12} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
