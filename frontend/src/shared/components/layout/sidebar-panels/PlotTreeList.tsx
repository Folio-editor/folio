import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery, usePowerSync } from '@powersync/react';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  LayoutList,
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
import { useDecryptedPlotList, type RawPlotRow } from '../../../hooks/useDecryptedPlot';
import { decryptWorkFieldOnce } from '../../../crypto/fieldDecrypt';
import { useSidebarClickHandler } from '../../../lib/sidebarClickHandler';
import { cn } from '../../../lib/cn';
import { useDragZoneStore } from '../../../lib/dragZoneStore';
import { useOptimisticRows } from '../../../lib/useOptimisticRows';
import { useSortPreferenceStore } from '../../../stores/sortPreferenceStore';
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

interface PlotRow {
  id: string;
  title: string;
  status: string | null;
  work_id?: string;
  parent_id?: string | null;
  sort_order?: number | null;
  child_count?: number;
}

interface PlotTreeListProps {
  workId: string;
  searchTerm: string;
  selectedItemId: string | null;
  onItemSelect: (id: string | null, intent?: ClickIntent) => void;
}

const STATUS_DOT: Record<string, string> = {
  '예정': 'bg-muted-foreground/40',
  '작성중': 'bg-info',
  '완료': 'bg-success',
};

/**
 * 플롯 트리 리스트 (막 > 회차 계층).
 *
 * ├─ 1막: 시작                  ← 막 (parent_id IS NULL)
 * │   ├─ 1화: 주인공 각성  ●    ← 회차 (parent_id = act.id)
 * │   ├─ 2화: 동료 합류    ●
 * │   └─ + 새 회차
 * ├─ 2막: 전개
 * └─ + 새 막
 */
export function PlotTreeList({
  workId,
  searchTerm,
  selectedItemId,
  onItemSelect,
}: PlotTreeListProps) {
  const writerId = useWriterId();
  const { createPlot } = useLocalWrite();
  const [creating, setCreating] = useState(false);

  const sortMode = useSortPreferenceStore((s) => s.byPanel['plot'] ?? 'manual');
  const trimmed = searchTerm.trim();
  // title/status는 v1: 암호문 → SQL LIKE/ORDER BY title 불가, 클라이언트 측 필터/정렬
  const sql = `SELECT p.id, p.work_id, p.writer_id, p.parent_id, p.title, p.status, p.content,
                      p.sort_order, p.created_at, p.updated_at,
                      w.encrypted_dek AS encrypted_dek,
                      (SELECT COUNT(*) FROM plot c WHERE c.parent_id = p.id) AS child_count
               FROM plot p
               LEFT JOIN work w ON w.id = p.work_id
               WHERE p.work_id = ? AND p.writer_id = ? AND p.parent_id IS NULL
               ORDER BY p.sort_order ASC, p.created_at ASC`;
  const params = [workId, writerId];
  const { data: rawActRows = [], isFetching } = useQuery<RawPlotRow & { child_count?: number }>(
    sql,
    params,
  );
  const childCountById = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rawActRows) map.set(r.id, r.child_count ?? 0);
    return map;
  }, [rawActRows]);
  const { data: decryptedActs } = useDecryptedPlotList(rawActRows);
  const decryptedActsList: PlotRow[] = useMemo(
    () =>
      decryptedActs.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        work_id: p.work_id,
        parent_id: p.parent_id,
        sort_order: p.sort_order,
        child_count: childCountById.get(p.id) ?? 0,
      })),
    [decryptedActs, childCountById],
  );
  const sortedActs = useMemo(() => {
    const list = [...decryptedActsList];
    if (sortMode === 'recent') {
      // recent: created_at desc 가능하나 raw에 없어서 manual sort_order asc 유지
    } else if (sortMode === 'alpha') {
      list.sort((a, b) =>
        (a.title || '').localeCompare(b.title || '', undefined, { numeric: true }),
      );
    }
    if (trimmed) {
      const lower = trimmed.toLowerCase();
      return list.filter((r) => (r.title || '').toLowerCase().includes(lower));
    }
    return list;
  }, [decryptedActsList, sortMode, trimmed]);
  const acts = useOptimisticRows(sortedActs, {
    docType: 'plot',
    parentId: null,
    matches: (row) => row.work_id === workId,
  });
  const showEmpty = useDelayedEmptyState(acts.length === 0 && !creating && !isFetching);

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
    if (intent === 'default') {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
  };

  const [createTitle, setCreateTitle] = useState('');

  const handleCreateAct = () => {
    const trimmedTitle = createTitle.trim();
    setCreating(false);
    setCreateTitle('');
    if (!trimmedTitle) return;
    void (async () => {
      const id = await createPlot(workId, trimmedTitle, acts.length);
      onItemSelect(id, 'default');
    })();
  };

  const handleCreateCancel = () => {
    setCreating(false);
    setCreateTitle('');
  };

  const handleCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); handleCreateAct(); }
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
              placeholder="막 제목을 입력 후 Enter"
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus size={14} strokeWidth={2} />
              <span>새 막</span>
            </button>
          )}
          <SidebarSortPicker panelKey="plot" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-1">
      {/* 전체 — 작품의 모든 막+회차를 메인 PlotOverview로 표시 (검색 무관 항상 노출) */}
      <PlotAllItem
        selected={selectedItemId === '__all__'}
        onSelect={(intent) => onItemSelect('__all__', intent)}
      />
      {isFetching && acts.length === 0 && !creating ? (
        <SidebarListSkeleton />
      ) : showEmpty ? (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          {trimmed ? '검색 결과가 없습니다.' : '플롯이 없습니다.'}
        </p>
      ) : (
        <SortableContext items={acts.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          {acts.map((act) => (
            <SortableActItem
              key={act.id}
              workId={workId}
              act={act}
              selectedItemId={selectedItemId}
              expandedIds={expandedIds}
              onSelect={handleSelect}
              onToggleExpand={toggleExpand}
              onItemSelect={onItemSelect}
            />
          ))}
        </SortableContext>
      )}
      {/* 트리 끝 빈 영역 — 회차를 막 level로 빼낼 때 drop 타깃 (시각은 마지막 막 after 밑줄로) */}
      <PlotTreeRootEndDropZone lastItemId={acts[acts.length - 1]?.id ?? null} />
      </div>
    </div>
  );
}

function PlotTreeRootEndDropZone({ lastItemId }: { lastItemId: string | null }) {
  const { setNodeRef } = useDroppable({
    id: 'plot-tree-root-end',
    data: { type: 'tree-root-end', docType: 'plot', lastItemId },
  });
  return (
    <div
      ref={setNodeRef}
      className="mt-1 min-h-15 flex-1"
      aria-label="root level로 빼내기"
    />
  );
}

/* ── 막 아이템 ── */

interface ActItemProps {
  workId: string;
  act: PlotRow;
  selectedItemId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string, intent: ClickIntent) => void;
  onToggleExpand: (id: string) => void;
  onItemSelect: (id: string | null, intent?: ClickIntent) => void;
}

function SortableActItem(props: ActItemProps) {
  const dragEnabled =
    useSortPreferenceStore((s) => s.byPanel['plot'] ?? 'manual') === 'manual';
  const { attributes, listeners, setNodeRef, isDragging } =
    useSortable({
      id: props.act.id,
      disabled: !dragEnabled,
      data: {
        type: 'tree-node',
        docType: 'plot',
        docId: props.act.id,
        depth: 0,
        parentId: null,
        title: props.act.title,
        sortOrder: props.act.sort_order ?? 0,
        rowSnapshot: {
          id: props.act.id,
          title: props.act.title,
          status: props.act.status,
          work_id: props.workId,
          parent_id: null,
          sort_order: props.act.sort_order ?? 0,
        },
      },
    });
  const style = { opacity: isDragging ? 0 : 1 };
  const zoneInfo = useDragZoneStore((s) =>
    s.overId === props.act.id ? s.zone : null,
  );
  return (
    <div ref={setNodeRef} style={style} className="relative">
      {zoneInfo === 'before' && (
        <div className="pointer-events-none absolute inset-x-0 -top-px h-0.5 bg-primary z-10" />
      )}
      <ActTreeItem
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

function ActTreeItem({
  workId,
  act,
  selectedItemId,
  expandedIds,
  onSelect,
  onToggleExpand,
  onItemSelect,
  dragAttributes,
  dragListeners,
  isMergeOver,
}: ActItemProps & {
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  isMergeOver?: boolean;
}) {
  const writerId = useWriterId();
  const db = usePowerSync();
  const { createPlot, updatePlot, deletePlot, placePlot } = useLocalWrite();
  const isExpanded = expandedIds.has(act.id);
  const isSelected = selectedItemId === act.id;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(act.title);
  const [creatingChild, setCreatingChild] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(act.title);
  }, [editing, act.title]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === act.title) {
      setDraft(act.title);
      return;
    }
    void updatePlot(act.id, { title: next.slice(0, 200) });
  };

  const cancel = () => {
    setDraft(act.title);
    setEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  };

  const handleCreateEpisode = async (name: string) => {
    setCreatingChild(false);
    if (!name.trim()) return;
    const id = await createPlot(workId, name.trim(), Date.now(), act.id);
    onItemSelect(id, 'default');
  };

  const handleQuickAddChild = () => {
    if (!isExpanded) onToggleExpand(act.id);
    setCreatingChild(true);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePlot(act.id);
      if (selectedItemId === act.id) onItemSelect(null);
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  /** 막 복제 — 같은 root 레벨에 사본 생성 (자식 회차들은 사본하지 않음) */
  const handleDuplicate = async () => {
    const rows = await db.getAll<{ content: string | null; encrypted_dek: string | null }>(
      `SELECT p.content, w.encrypted_dek
         FROM plot p LEFT JOIN work w ON w.id = p.work_id
         WHERE p.id = ? LIMIT 1`,
      [act.id],
    );
    const raw = rows[0];
    const content = raw
      ? await decryptWorkFieldOnce({
          workId,
          encryptedDek: raw.encrypted_dek,
          value: raw.content,
        })
      : null;
    const newId = await createPlot(
      workId,
      `${act.title?.trim() || '(제목 없음)'} (사본)`,
      Date.now(),
      null,
      content,
    );
    await placePlot(newId, null, act.id, 'after');
  };

  const fetchActSiblings = async (): Promise<string[]> => {
    const rows = await db.getAll<{ id: string }>(
      `SELECT id FROM plot
       WHERE work_id = ? AND writer_id = ? AND parent_id IS NULL
       ORDER BY sort_order ASC, created_at ASC`,
      [workId, writerId],
    );
    return rows.map((r) => r.id);
  };
  const handleMoveUp = async () => {
    const ids = await fetchActSiblings();
    const idx = ids.indexOf(act.id);
    if (idx <= 0) return;
    await placePlot(act.id, null, ids[idx - 1], 'before');
  };
  const handleMoveDown = async () => {
    const ids = await fetchActSiblings();
    const idx = ids.indexOf(act.id);
    if (idx < 0 || idx >= ids.length - 1) return;
    await placePlot(act.id, null, ids[idx + 1], 'after');
  };

  const actClickHandlers = useSidebarClickHandler((intent) => onSelect(act.id, intent));
  const childSortMode = useSortPreferenceStore((s) => s.byPanel['plot'] ?? 'manual');
  const childStatusFilter = useFilterPreferenceStore(
    (s) => s.byPanel['plot'] ?? (EMPTY_FILTER as string[]),
  );

  // title/status는 v1: 암호문 → SQL 필터/정렬 불가, 클라이언트 측 처리
  const { data: rawChildRows = [] } = useQuery<RawPlotRow>(
    isExpanded
      ? `SELECT p.id, p.work_id, p.writer_id, p.parent_id, p.title, p.status, p.content,
                p.sort_order, p.created_at, p.updated_at,
                w.encrypted_dek AS encrypted_dek
         FROM plot p
         LEFT JOIN work w ON w.id = p.work_id
         WHERE p.parent_id = ? AND p.writer_id = ?
         ORDER BY p.sort_order ASC, p.created_at ASC`
      : `SELECT NULL AS id, NULL AS work_id, NULL AS writer_id, NULL AS parent_id,
                NULL AS title, NULL AS status, NULL AS content,
                NULL AS sort_order, NULL AS created_at, NULL AS updated_at,
                NULL AS encrypted_dek WHERE 0`,
    isExpanded ? [act.id, writerId] : [],
  );
  const { data: decryptedChildRows } = useDecryptedPlotList(rawChildRows);
  const childList: PlotRow[] = useMemo(() => {
    let list: PlotRow[] = decryptedChildRows.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      work_id: p.work_id,
      parent_id: p.parent_id,
      sort_order: p.sort_order,
    }));
    if (childStatusFilter.length > 0) {
      const set = new Set(childStatusFilter);
      list = list.filter((r) => r.status != null && set.has(r.status));
    }
    if (childSortMode === 'alpha') {
      list = [...list].sort((a, b) =>
        (a.title || '').localeCompare(b.title || '', undefined, { numeric: true }),
      );
    }
    return list;
  }, [decryptedChildRows, childStatusFilter, childSortMode]);
  const episodes = useOptimisticRows(childList, {
    docType: 'plot',
    parentId: act.id,
    matches: (row) => row.parent_id === act.id,
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
              <button
                type="button"
                {...actClickHandlers}
                title="클릭=메인 / 더블·⌘+클릭=핀"
                className={cn(
                  'flex flex-1 items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
                  isSelected
                    ? 'bg-secondary font-medium text-primary'
                    : 'text-sidebar-foreground',
                )}
              >
                {(act.child_count ?? 0) > 0 ? (
                  <ChevronRight
                    size={12}
                    strokeWidth={2}
                    className={cn(
                      'shrink-0 transition-transform',
                      isExpanded && 'rotate-90',
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleExpand(act.id);
                    }}
                  />
                ) : (
                  <span className="inline-block w-3 shrink-0" aria-hidden="true" />
                )}
                {act.title?.trim() || '(제목 없음)'}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleQuickAddChild(); }}
                title="새 회차 추가"
                aria-label="새 회차 추가"
                className="ml-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-hover:opacity-100"
              >
                <Plus size={12} strokeWidth={1.75} />
              </button>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => onSelect(act.id, 'newTab')}>
              <SquareArrowOutUpRight size={12} /> 새 탭에서 열기
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onSelect(act.id, 'pin')}>
              <PanelRight size={12} /> 스테이지에 추가
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => handleQuickAddChild()}>
              <Plus size={12} /> 새 회차 추가
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
          title="막 삭제"
          message={`'${act.title?.trim() || '(제목 없음)'}'을(를) 삭제하시겠습니까?`}
          warning="하위 회차가 있다면 함께 처리됩니다. 이 작업은 되돌릴 수 없습니다."
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteOpen(false)}
        />
      )}

      {isExpanded && (
        <div className="ml-3 border-l border-border/50 pl-2">
          {episodes.length > 0 && (
            <SortableContext items={episodes.map((ep) => ep.id)} strategy={verticalListSortingStrategy}>
              {episodes.map((ep) => (
                <SortableEpisodeItem
                  key={ep.id}
                  workId={workId}
                  episode={ep}
                  parentActId={act.id}
                  selected={selectedItemId === ep.id}
                  onSelect={(intent) => onItemSelect(ep.id, intent)}
                  onRename={(title) => void updatePlot(ep.id, { title })}
                  onDelete={async () => {
                    await deletePlot(ep.id);
                    if (selectedItemId === ep.id) onItemSelect(null);
                  }}
                />
              ))}
            </SortableContext>
          )}

          {creatingChild && (
            <InlineCreateInput
              placeholder="회차 제목을 입력하세요"
              onConfirm={(name) => void handleCreateEpisode(name)}
              onCancel={() => setCreatingChild(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ── 회차 아이템 ── */

function SortableEpisodeItem(props: {
  workId: string;
  episode: PlotRow;
  parentActId: string;
  selected: boolean;
  onSelect: (intent: ClickIntent) => void;
  onRename: (title: string) => void;
  onDelete: () => Promise<void>;
}) {
  const dragEnabled =
    useSortPreferenceStore((s) => s.byPanel['plot'] ?? 'manual') === 'manual';
  const { attributes, listeners, setNodeRef, isDragging } =
    useSortable({
      id: props.episode.id,
      disabled: !dragEnabled,
      data: {
        type: 'tree-node',
        docType: 'plot',
        docId: props.episode.id,
        depth: 1,
        parentId: props.parentActId,
        title: props.episode.title,
        sortOrder: props.episode.sort_order ?? 0,
        rowSnapshot: {
          id: props.episode.id,
          title: props.episode.title,
          status: props.episode.status,
          parent_id: props.parentActId,
          sort_order: props.episode.sort_order ?? 0,
        },
      },
    });
  const style = { opacity: isDragging ? 0 : 1 };
  const zoneInfo = useDragZoneStore((s) =>
    s.overId === props.episode.id ? s.zone : null,
  );
  return (
    <div ref={setNodeRef} style={style} className="relative">
      {zoneInfo === 'before' && (
        <div className="pointer-events-none absolute inset-x-0 -top-px h-0.5 bg-primary z-10" />
      )}
      <EpisodeItem {...props} dragAttributes={attributes} dragListeners={listeners} />
      {zoneInfo === 'after' && (
        <div className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 bg-primary z-10" />
      )}
    </div>
  );
}

function EpisodeItem({
  workId,
  episode,
  parentActId,
  selected,
  onSelect,
  onRename,
  onDelete,
  dragAttributes,
  dragListeners,
}: {
  workId: string;
  episode: PlotRow;
  parentActId: string;
  selected: boolean;
  onSelect: (intent: ClickIntent) => void;
  onRename: (title: string) => void;
  onDelete: () => Promise<void>;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
}) {
  const writerId = useWriterId();
  const db = usePowerSync();
  const { createPlot, placePlot } = useLocalWrite();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(episode.title);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const clickHandlers = useSidebarClickHandler(onSelect);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async () => {
    const rows = await db.getAll<{ content: string | null; encrypted_dek: string | null }>(
      `SELECT p.content, w.encrypted_dek
         FROM plot p LEFT JOIN work w ON w.id = p.work_id
         WHERE p.id = ? LIMIT 1`,
      [episode.id],
    );
    const raw = rows[0];
    const content = raw
      ? await decryptWorkFieldOnce({
          workId,
          encryptedDek: raw.encrypted_dek,
          value: raw.content,
        })
      : null;
    const newId = await createPlot(
      workId,
      `${episode.title?.trim() || '(제목 없음)'} (사본)`,
      Date.now(),
      parentActId,
      content,
    );
    await placePlot(newId, parentActId, episode.id, 'after');
  };

  const fetchSiblings = async (): Promise<string[]> => {
    const rows = await db.getAll<{ id: string }>(
      `SELECT id FROM plot
       WHERE parent_id = ? AND writer_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
      [parentActId, writerId],
    );
    return rows.map((r) => r.id);
  };
  const handleMoveUp = async () => {
    const ids = await fetchSiblings();
    const idx = ids.indexOf(episode.id);
    if (idx <= 0) return;
    await placePlot(episode.id, parentActId, ids[idx - 1], 'before');
  };
  const handleMoveDown = async () => {
    const ids = await fetchSiblings();
    const idx = ids.indexOf(episode.id);
    if (idx < 0 || idx >= ids.length - 1) return;
    await placePlot(episode.id, parentActId, ids[idx + 1], 'after');
  };

  useEffect(() => {
    if (!editing) setDraft(episode.title);
  }, [editing, episode.title]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === episode.title) {
      setDraft(episode.title);
      return;
    }
    onRename(next.slice(0, 200));
  };

  const cancel = () => {
    setDraft(episode.title);
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
              {...clickHandlers}
              title="클릭=메인 / 더블·⌘+클릭=핀"
              className={cn(
                'flex flex-1 items-center gap-1.5 truncate rounded-md px-2 py-1 text-left text-xs hover:bg-sidebar-accent',
                selected
                  ? 'bg-secondary font-medium text-primary'
                  : 'text-sidebar-foreground',
              )}
            >
              <span className="truncate">{episode.title?.trim() || '(제목 없음)'}</span>
              {episode.status && (
                <span
                  className={cn(
                    'ml-auto h-2 w-2 shrink-0 rounded-full',
                    STATUS_DOT[episode.status] ?? 'bg-muted-foreground',
                  )}
                  title={episode.status}
                />
              )}
            </button>
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
          title="회차 삭제"
          message={`'${episode.title?.trim() || '(제목 없음)'}'을(를) 삭제하시겠습니까?`}
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </>
  );
}

/* ── 인라인 생성 입력 ── */

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
      className="mb-1 h-9 w-full rounded-lg border border-ring bg-background px-3 text-sm text-foreground outline-none ring-1 ring-ring placeholder:text-muted-foreground"
    />
  );
}

/* ── 플롯 "전체" 가상 항목 — 클릭 시 메인 PlotOverview로 진입 ── */

function PlotAllItem({
  selected,
  onSelect,
}: {
  selected: boolean;
  onSelect: (intent: ClickIntent) => void;
}) {
  const clickHandlers = useSidebarClickHandler(onSelect);
  return (
    <button
      type="button"
      {...clickHandlers}
      title="전체 플롯 — 작품의 모든 막과 회차"
      className={cn(
        'flex w-full items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent',
        selected
          ? 'bg-secondary font-medium text-primary'
          : 'text-sidebar-foreground',
      )}
    >
      <LayoutList size={12} strokeWidth={2} className="shrink-0" />
      <span className="truncate">전체</span>
    </button>
  );
}
