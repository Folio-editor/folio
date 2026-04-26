import { useState, useEffect, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useDroppable, type DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useWriterId } from '../../../hooks/useWriterId';
import { useLocalWrite } from '../../../hooks/useLocalWrite';
import { WorkspaceSection, SECTION_TABLES, type ClickIntent } from '../../../types/workspace';
import { useSidebarClickHandler } from '../../../lib/sidebarClickHandler';
import { cn } from '../../../lib/cn';
import { useDragZoneStore } from '../../../lib/dragZoneStore';
import { useOptimisticRows } from '../../../lib/useOptimisticRows';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../../ui/context-menu';
import { DeleteConfirmDialog } from '../../ui/DeleteConfirmDialog';

type Section = Exclude<WorkspaceSection, 'plan' | 'world-note' | 'plot' | 'episode'>;

interface SectionItemListProps {
  section: Section;
  workId: string;
  searchTerm: string;
  selectedItemId: string | null;
  onItemSelect: (id: string | null, intent?: ClickIntent) => void;
}

interface Row {
  id: string;
  label: string | null;
  work_id?: string;
  sort_order?: number | null;
}

/**
 * 범용 섹션 항목 리스트 (character / foreshadow / idea-archive).
 * - 테이블별 라벨 필드 매핑으로 통일된 UI 제공
 * - 검색어는 라벨 필드에 LIKE 매칭
 * - foreshadow 섹션에만 인라인 생성 버튼 표시
 */
export function SectionItemList({
  section,
  workId,
  searchTerm,
  selectedItemId,
  onItemSelect,
}: SectionItemListProps) {
  const writerId = useWriterId();
  const { createForeshadow } = useLocalWrite();
  const table = SECTION_TABLES[section];
  const labelField = LABEL_FIELDS[section];
  const docType = table; // SECTION_TABLES가 곧 dnd 시스템의 docType

  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');

  const trimmed = searchTerm.trim();
  const whereSearch = trimmed ? `AND ${labelField} LIKE ? ESCAPE '\\'` : '';
  const sql = `SELECT id, ${labelField} AS label, work_id, sort_order FROM ${table}
     WHERE work_id = ? AND writer_id = ? ${whereSearch}
     ORDER BY sort_order ASC, created_at ASC`;
  const params = trimmed
    ? [workId, writerId, `%${escapeLike(trimmed)}%`]
    : [workId, writerId];

  const { data: rawRows = [] } = useQuery<Row>(sql, params);
  const rows = useOptimisticRows(rawRows, {
    docType,
    workId,
    matches: (row) => row.work_id === workId,
  });

  const handleCreate = () => {
    const trimmedTitle = createTitle.trim();
    setCreating(false);
    setCreateTitle('');
    if (!trimmedTitle) return;
    void (async () => {
      const id = await createForeshadow(workId, trimmedTitle, '중', rows.length);
      onItemSelect(id, 'default');
    })();
  };

  const handleCreateCancel = () => {
    setCreating(false);
    setCreateTitle('');
  };

  const handleCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
    if (e.key === 'Escape') { e.preventDefault(); handleCreateCancel(); }
  };

  const showCreateButton = section === 'foreshadow';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showCreateButton && (
        <div className="shrink-0 px-3 pt-2 pb-1">
          {creating ? (
            <input
              autoFocus
              type="text"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              onKeyDown={handleCreateKeyDown}
              onBlur={handleCreateCancel}
              placeholder="복선 제목을 입력 후 Enter"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus size={14} strokeWidth={2} />
              <span>새 복선</span>
            </button>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-1">
        {rows.length === 0 && !creating ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {trimmed ? '검색 결과가 없습니다.' : EMPTY_LABELS[section]}
          </p>
        ) : (
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
                  rawLabel={raw}
                  section={section}
                  docType={docType}
                  workId={workId}
                  sortOrder={row.sort_order ?? 0}
                  selected={selectedItemId === row.id}
                  onSelect={(intent) => onItemSelect(row.id, intent)}
                  onAfterDelete={() => {
                    if (selectedItemId === row.id) onItemSelect(null);
                  }}
                />
              );
            })}
          </SortableContext>
        )}
        <TreeRootEndDropZone docType={docType} lastItemId={rows[rows.length - 1]?.id ?? null} />
      </div>
    </div>
  );
}

function TreeRootEndDropZone({
  docType,
  lastItemId,
}: {
  docType: string;
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
      aria-label="목록 끝으로 이동"
    />
  );
}

interface SortableProps {
  id: string;
  label: string;
  rawLabel: string;
  section: Section;
  docType: string;
  workId: string;
  sortOrder: number;
  selected: boolean;
  onSelect: (intent: ClickIntent) => void;
  onAfterDelete: () => void;
}

function SortableSectionItem(props: SortableProps) {
  const { attributes, listeners, setNodeRef, isDragging } =
    useSortable({
      id: props.id,
      data: {
        type: 'tree-node',
        docType: props.docType,
        docId: props.id,
        depth: 0,
        parentId: null,
        workId: props.workId,
        title: props.label,
        sortOrder: props.sortOrder,
        rowSnapshot: {
          id: props.id,
          label: props.rawLabel,
          work_id: props.workId,
          sort_order: props.sortOrder,
        },
      },
    });
  const style = { opacity: isDragging ? 0 : 1 };
  const zoneInfo = useDragZoneStore((s) => (s.overId === props.id ? s.zone : null));
  return (
    <div ref={setNodeRef} style={style} className="relative">
      {zoneInfo === 'before' && (
        <div className="pointer-events-none absolute inset-x-0 -top-px h-0.5 bg-primary z-10" />
      )}
      <SectionItem
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

function SectionItem({
  id,
  label,
  rawLabel,
  section,
  selected,
  onSelect,
  onAfterDelete,
  dragAttributes,
  dragListeners,
}: SortableProps & {
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
}) {
  const {
    deleteCharacter,
    deleteForeshadow,
    deleteIdeaArchive,
    updateCharacter,
    updateForeshadow,
    updateIdea,
  } = useLocalWrite();
  const clickHandlers = useSidebarClickHandler(onSelect);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rawLabel);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // idea-archive는 본문 편집이 별도 화면(메인) — 사이드바 인라인 편집 X
  const allowInlineRename = section !== 'idea-archive';

  useEffect(() => {
    if (!editing) setDraft(rawLabel);
  }, [editing, rawLabel]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === rawLabel) {
      setDraft(rawLabel);
      return;
    }
    if (section === 'character') {
      void updateCharacter(id, { name: next.slice(0, 200) });
    } else if (section === 'foreshadow') {
      void updateForeshadow(id, { title: next.slice(0, 200) });
    }
  };

  const cancel = () => {
    setDraft(rawLabel);
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
      if (section === 'character') await deleteCharacter(id);
      else if (section === 'foreshadow') await deleteForeshadow(id);
      else await deleteIdeaArchive(id);
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
            className="group flex w-full items-center"
          >
            <button
              type="button"
              {...clickHandlers}
              title="클릭=메인 / 더블·⌘+클릭=핀"
              className={cn(
                'min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
                selected
                  ? 'bg-secondary font-medium text-primary'
                  : 'text-sidebar-foreground',
              )}
            >
              {label}
            </button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {allowInlineRename && (
            <>
              <ContextMenuItem onSelect={() => setEditing(true)}>
                <Pencil size={12} /> 이름 변경
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem destructive onSelect={() => setDeleteOpen(true)}>
            <Trash2 size={12} /> 삭제
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {deleteOpen && (
        <DeleteConfirmDialog
          title={DELETE_LABELS[section]}
          message={`'${label}'을(를) 삭제하시겠습니까?`}
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </>
  );
}

const LABEL_FIELDS: Record<Section, string> = {
  character: 'name',
  foreshadow: 'title',
  'idea-archive': 'content',
};

const EMPTY_LABELS: Record<Section, string> = {
  character: '등장인물이 없습니다.',
  foreshadow: '복선이 없습니다.',
  'idea-archive': '아이디어가 없습니다.',
};

const PLACEHOLDER_LABELS: Record<Section, string> = {
  character: '(이름 없음)',
  foreshadow: '(제목 없음)',
  'idea-archive': '(내용 없음)',
};

const DELETE_LABELS: Record<Section, string> = {
  character: '등장인물 삭제',
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
