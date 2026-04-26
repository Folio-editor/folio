import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@powersync/react';
import { Trash2 } from 'lucide-react';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { DeleteConfirmDialog } from '../../components/ui/DeleteConfirmDialog';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useOptimisticMoveStore } from '../../lib/optimisticMoveStore';
import {
  WorldNoteRecursiveSection,
  type TreeNode,
} from './WorldNoteRecursiveSection';

interface WorldNoteHierarchyScreenProps {
  noteId: string;
  onBack: () => void;
  onSendToRight?: () => void;
}

interface DescendantRow {
  id: string;
  work_id: string;
  name: string;
  content: string | null;
  parent_id: string | null;
  sort_order: number;
  depth: number;
}

/**
 * 세계관 통합 뷰 — 선택한 노드를 root로 한 무제한 깊이 트리 렌더.
 *
 * - rootId = 선택 노드 자체 (손자 클릭 → 손자가 root처럼 가운데)
 * - RECURSIVE CTE로 모든 descendant 한 번에 fetch
 * - useDeferredValue로 큰 트리 진입 시 freeze 방지
 * - tree builder는 reference 안정화 (변경 안 된 노드 동일 reference 유지) → React.memo skip
 * - 자체 DndContext 없음 — 외부 통합 DndContext가 정렬/병합/우측 패널 보내기 처리
 */
export function WorldNoteHierarchyScreen({
  noteId,
  onBack,
  onSendToRight,
}: WorldNoteHierarchyScreenProps) {
  const { updateWorldNoteName, deleteWorldNote } = useLocalWrite();
  const rootId = noteId;

  const { data: descendantRows = [] } = useQuery<DescendantRow>(
    `WITH RECURSIVE descendants AS (
       SELECT id, work_id, name, content, parent_id, sort_order, created_at, 0 AS depth
       FROM world_note WHERE id = ?
       UNION ALL
       SELECT w.id, w.work_id, w.name, w.content, w.parent_id, w.sort_order, w.created_at, d.depth + 1
       FROM world_note w
       JOIN descendants d ON w.parent_id = d.id
     )
     SELECT id, work_id, name, content, parent_id, sort_order, depth FROM descendants
     ORDER BY depth ASC, sort_order ASC, created_at ASC`,
    [rootId],
  );

  // 큰 트리 진입 시 freeze 방지 — 사용자 입력은 즉시, 백그라운드만 deferred
  const deferredRows = useDeferredValue(descendantRows);

  // 낙관적 store — 드래그 직후 UI 즉시 반영 (DB는 백그라운드)
  const optimisticMoves = useOptimisticMoveStore((s) => s.moves);

  // 안전장치 B: descendantRows 변경 시 변경된 노드만 새 객체, 그 외는 이전 reference 유지
  // → React.memo가 형제 노드 재렌더 skip 가능
  const prevMapRef = useRef<Map<string, TreeNode>>(new Map());
  const tree = useMemo<TreeNode | null>(() => {
    if (deferredRows.length === 0) return null;
    const newMap = new Map<string, TreeNode>();
    for (const row of deferredRows) {
      // optimistic move 적용 — effective parent_id, sort_order
      const move = optimisticMoves.get(row.id);
      const effParentId =
        move && move.docType === 'world_note' && move.newParentId !== undefined
          ? move.newParentId
          : row.parent_id;
      const effSortOrder = move && move.docType === 'world_note'
        ? move.newSortOrder
        : row.sort_order;
      const prev = prevMapRef.current.get(row.id);
      if (
        prev &&
        prev.name === row.name &&
        prev.content === row.content &&
        prev.parent_id === effParentId &&
        prev.sort_order === effSortOrder &&
        prev.depth === row.depth
      ) {
        newMap.set(row.id, { ...prev, children: [] });
      } else {
        newMap.set(row.id, {
          ...row,
          parent_id: effParentId,
          sort_order: effSortOrder,
          children: [],
        });
      }
    }
    let root: TreeNode | null = null;
    for (const node of newMap.values()) {
      if (node.id === rootId) {
        root = node;
      } else if (node.parent_id && newMap.has(node.parent_id)) {
        newMap.get(node.parent_id)!.children.push(node);
      }
    }
    function sortRecursive(n: TreeNode) {
      n.children.sort((a, b) => a.sort_order - b.sort_order);
      n.children.forEach(sortRecursive);
    }
    if (root) sortRecursive(root);
    prevMapRef.current = newMap;
    return root;
  }, [deferredRows, rootId, optimisticMoves]);

  // 헤더 제목 인라인 편집
  const [headerEditing, setHeaderEditing] = useState(false);
  const [headerDraft, setHeaderDraft] = useState('');
  const headerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!headerEditing && tree) setHeaderDraft(tree.name);
  }, [headerEditing, tree]);

  useEffect(() => {
    if (headerEditing) headerInputRef.current?.select();
  }, [headerEditing]);

  const commitHeader = () => {
    setHeaderEditing(false);
    const next = headerDraft.trim();
    if (!tree) return;
    if (!next || next === tree.name) {
      setHeaderDraft(tree.name);
      return;
    }
    void updateWorldNoteName(rootId, next.slice(0, 200));
  };
  const cancelHeader = () => {
    if (tree) setHeaderDraft(tree.name);
    setHeaderEditing(false);
  };

  // 삭제 다이얼로그
  const [deleteTarget, setDeleteTarget] = useState<TreeNode | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const isDeletingRoot = deleteTarget?.id === rootId;

  if (!tree) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        문서를 불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        onClose={onBack}
        onSendToRight={onSendToRight}
        title={
          <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-lg">
            <span className="shrink-0 text-sm text-muted-foreground">세계관</span>
            <span className="shrink-0 text-sm text-muted-foreground">/</span>
            {headerEditing ? (
              <input
                ref={headerInputRef}
                autoFocus
                type="text"
                value={headerDraft}
                onChange={(e) => setHeaderDraft(e.target.value)}
                onBlur={commitHeader}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitHeader();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelHeader();
                  }
                }}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none"
              />
            ) : (
              <span
                role="button"
                tabIndex={0}
                onClick={() => setHeaderEditing(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setHeaderEditing(true);
                }}
                className="min-w-0 flex-1 cursor-text truncate text-sm font-semibold text-foreground hover:text-primary"
                title="클릭하여 제목 편집"
              >
                {tree.name || '(이름 없음)'}
              </span>
            )}
          </span>
        }
        trailing={
          <button
            type="button"
            onClick={() => setDeleteTarget(tree)}
            title="세계관 문서 삭제 (하위 포함)"
            aria-label="세계관 문서 삭제"
            className="rounded p-2 text-muted-foreground transition-colors hover:bg-destructive/5 hover:text-destructive"
          >
            <Trash2 size={16} strokeWidth={1.75} />
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-10 pt-8 pb-12">
          <SortableContext
            items={[`recursive:${tree.id}`]}
            strategy={verticalListSortingStrategy}
          >
            <WorldNoteRecursiveSection
              node={tree}
              depth={0}
              workId={tree.work_id}
              onRequestDelete={(n) => setDeleteTarget(n)}
            />
          </SortableContext>
        </div>
      </div>

      {deleteTarget && (
        <DeleteConfirmDialog
          title={isDeletingRoot ? '세계관 문서 삭제' : '하위 문서 삭제'}
          message={
            isDeletingRoot
              ? `"${deleteTarget.name || '(이름 없음)'}" 문서와 모든 하위 문서가 삭제됩니다.`
              : `"${deleteTarget.name || '(이름 없음)'}" 문서와 그 하위 문서가 삭제됩니다.`
          }
          warning="이 작업은 되돌릴 수 없습니다."
          confirmLabel="삭제"
          busyLabel="삭제 중…"
          busy={deleteBusy}
          onConfirm={() => {
            const id = deleteTarget.id;
            const wasRoot = isDeletingRoot;
            setDeleteBusy(true);
            void deleteWorldNote(id).then(() => {
              setDeleteBusy(false);
              setDeleteTarget(null);
              if (wasRoot) onBack();
            });
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
