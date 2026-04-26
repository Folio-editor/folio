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
 * 세계관 통합 뷰 — 선택 노드의 최상위 조상을 root로 한 무제한 깊이 트리 렌더.
 *
 * 포커스 모드:
 * - rootId = noteId의 최상위 조상 (parent_id 거슬러 올라간 끝)
 * - 사이드바에서 같은 트리 내 하위 노드 클릭 → 화면 유지, 해당 노드로 부드럽게 스크롤
 * - 다른 트리의 노드 클릭 시에만 트리 재구성
 *
 * - RECURSIVE CTE로 ancestor → root → descendants 한 번에 fetch
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

  // 클릭한 noteId 자체를 root로 — 그 노드의 모든 descendants fetch
  // 부모/조상은 트리에 포함되지 않음 (선택 노드가 통합 화면의 root가 됨)
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
    [noteId],
  );

  // 큰 트리 진입 시 freeze 방지 — 사용자 입력은 즉시, 백그라운드만 deferred
  const deferredRows = useDeferredValue(descendantRows);

  // 낙관적 store — 드래그 직후 UI 즉시 반영 (DB는 백그라운드)
  const optimisticMoves = useOptimisticMoveStore((s) => s.moves);

  // 변경 안 된 노드는 prev reference 그대로 재사용 → React.memo가 형제 노드 재렌더 skip
  // 변경된 노드 + 자식 배열이 달라진 부모만 새 객체 생성
  const prevMapRef = useRef<Map<string, TreeNode>>(new Map());
  const tree = useMemo<TreeNode | null>(() => {
    if (deferredRows.length === 0) return null;
    const rootRow = deferredRows.find((r) => r.depth === 0);
    if (!rootRow) return null;

    // 1패스: 노드 → effective row + children 누적 컨테이너
    type Working = {
      row: DescendantRow & { effParentId: string | null; effSortOrder: number };
      children: TreeNode[];
      prev: TreeNode | undefined;
      bodyEqual: boolean; // name/content/parent/sort/depth 모두 prev와 동일
    };
    const working = new Map<string, Working>();
    for (const row of deferredRows) {
      const move = optimisticMoves.get(row.id);
      const effParentId =
        move && move.docType === 'world_note' && move.newParentId !== undefined
          ? move.newParentId
          : row.parent_id;
      const effSortOrder =
        move && move.docType === 'world_note' ? move.newSortOrder : row.sort_order;
      const prev = prevMapRef.current.get(row.id);
      const bodyEqual =
        !!prev &&
        prev.name === row.name &&
        prev.content === row.content &&
        prev.parent_id === effParentId &&
        prev.sort_order === effSortOrder &&
        prev.depth === row.depth;
      working.set(row.id, {
        row: { ...row, effParentId, effSortOrder },
        children: [],
        prev,
        bodyEqual,
      });
    }

    // 2패스: 부모-자식 관계 구축 (children 배열에 임시 TreeNode 채움 — 실제 reference는 3패스에서 결정)
    // children 순서 결정 위해 sort_order 기준 사전 정렬
    const sortedRows = [...deferredRows].sort(
      (a, b) =>
        (working.get(a.id)!.row.effSortOrder ?? 0) -
        (working.get(b.id)!.row.effSortOrder ?? 0),
    );

    // 3패스: bottom-up — 자식 먼저 build, 부모는 children list 비교 후 prev 재사용 가능 여부 판단
    // depth 큰 순서로 처리하면 자식이 먼저 결정됨
    const built = new Map<string, TreeNode>();
    const sortedByDepthDesc = [...sortedRows].sort((a, b) => b.depth - a.depth);

    for (const row of sortedByDepthDesc) {
      const w = working.get(row.id)!;
      // 자식 노드들 가져와서 sort_order 순으로 정렬
      const childIds = sortedRows
        .filter((r) => working.get(r.id)!.row.effParentId === row.id)
        .map((r) => r.id);
      const childNodes = childIds
        .map((cid) => built.get(cid))
        .filter((n): n is TreeNode => !!n);
      // sort
      childNodes.sort((a, b) => a.sort_order - b.sort_order);

      // prev의 children과 reference 비교 — 모두 동일하면 children 변동 없음
      const childrenEqual =
        !!w.prev &&
        w.prev.children.length === childNodes.length &&
        w.prev.children.every((c, i) => c === childNodes[i]);

      if (w.bodyEqual && childrenEqual && w.prev) {
        // 완전히 동일 → prev 그대로 재사용
        built.set(row.id, w.prev);
      } else {
        built.set(row.id, {
          id: row.id,
          work_id: row.work_id,
          name: row.name,
          content: row.content,
          parent_id: w.row.effParentId,
          sort_order: w.row.effSortOrder,
          depth: row.depth,
          children: childNodes,
        });
      }
    }

    const root = built.get(rootRow.id) ?? null;
    prevMapRef.current = built;
    return root;
  }, [deferredRows, optimisticMoves]);

  const rootId = tree?.id ?? null;

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
    if (!tree || !rootId) return;
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
