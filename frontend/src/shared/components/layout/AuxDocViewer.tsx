import { useMemo } from 'react';
import { useQuery } from '@powersync/react';
import { FileText } from 'lucide-react';
import type { AuxDocType, AuxPanelItem } from '../../types/workspace';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { WorldNoteInlineEditor } from '../../features/world-note/WorldNoteInlineEditor';

interface AuxDocViewerProps {
  docType: AuxDocType;
  docId: string;
  /** false면 본문 편집 불가 (lockedReadOnly 등). 기본 true. */
  editable?: boolean;
  onAddPanel: (item: Omit<AuxPanelItem, 'id' | 'collapsed'>) => void;
}

interface DocRow {
  title: string;
  content: string | null;
  parent_id?: string | null;
  gender?: string;
  age?: string;
}

interface ChildRow {
  id: string;
  title: string;
  content: string | null;
}

interface WorldNoteDescendantRow {
  id: string;
  name: string;
  content: string | null;
  parent_id: string | null;
  sort_order: number;
  depth: number;
}

const DOC_QUERIES: Record<AuxDocType, string> = {
  episode: 'SELECT title, content FROM episode WHERE id = ?',
  world_note:
    'SELECT name AS title, content, parent_id FROM world_note WHERE id = ?',
  plan_note: 'SELECT title, content FROM plan_note WHERE id = ?',
  character_note: 'SELECT title, content FROM character_note WHERE id = ?',
  plot: 'SELECT title, content FROM plot WHERE id = ?',
  character: 'SELECT name AS title, gender, age, content FROM character WHERE id = ?',
  foreshadow: 'SELECT title, content FROM foreshadow WHERE id = ?',
};

// world_note 외 docType만 자식 링크 — world_note는 통합 뷰에서 직접 재귀 렌더
const CHILD_QUERIES: Partial<Record<AuxDocType, { sql: string; docType: AuxDocType }>> = {
  plot: {
    sql: 'SELECT id, title, NULL AS content FROM plot WHERE parent_id = ? ORDER BY sort_order ASC',
    docType: 'plot',
  },
};

export function AuxDocViewer({
  docType,
  docId,
  editable = true,
  onAddPanel,
}: AuxDocViewerProps) {
  // world_note는 별도 통합 뷰 — 메인 Hierarchy 화면과 동일하게 자기 자신을 root로 한 트리
  if (docType === 'world_note') {
    return <WorldNoteAuxView docId={docId} editable={editable} />;
  }
  return (
    <NonWorldNoteAuxView
      docType={docType}
      docId={docId}
      editable={editable}
      onAddPanel={onAddPanel}
    />
  );
}

/* ── 세계관 보조 통합 뷰 — 자기 자신을 root로 한 무한 깊이 트리 (메인 Hierarchy 축소판) ── */

interface WorldNoteAuxNode {
  id: string;
  name: string;
  content: string | null;
  parent_id: string | null;
  sort_order: number;
  children: WorldNoteAuxNode[];
}

function WorldNoteAuxView({ docId, editable }: { docId: string; editable: boolean }) {
  const { data: rows = [] } = useQuery<WorldNoteDescendantRow>(
    `WITH RECURSIVE descendants AS (
       SELECT id, name, content, parent_id, sort_order, created_at, 0 AS depth
       FROM world_note WHERE id = ?
       UNION ALL
       SELECT w.id, w.name, w.content, w.parent_id, w.sort_order, w.created_at, d.depth + 1
       FROM world_note w
       JOIN descendants d ON w.parent_id = d.id
     )
     SELECT id, name, content, parent_id, sort_order, depth FROM descendants
     ORDER BY depth ASC, sort_order ASC, created_at ASC`,
    [docId],
  );

  const tree = useMemo<WorldNoteAuxNode | null>(() => {
    if (rows.length === 0) return null;
    const map = new Map<string, WorldNoteAuxNode>();
    for (const r of rows) {
      map.set(r.id, {
        id: r.id,
        name: r.name,
        content: r.content,
        parent_id: r.parent_id,
        sort_order: r.sort_order,
        children: [],
      });
    }
    let root: WorldNoteAuxNode | null = null;
    for (const node of map.values()) {
      if (node.id === docId) {
        root = node;
      } else if (node.parent_id && map.has(node.parent_id)) {
        map.get(node.parent_id)!.children.push(node);
      }
    }
    function sortRecursive(n: WorldNoteAuxNode) {
      n.children.sort((a, b) => a.sort_order - b.sort_order);
      n.children.forEach(sortRecursive);
    }
    if (root) sortRecursive(root);
    return root;
  }, [rows, docId]);

  if (!tree) {
    return (
      <div className="flex items-center justify-center px-3 py-6 text-xs text-muted-foreground">
        문서를 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col px-3 py-2">
      <WorldNoteAuxSection node={tree} depth={0} editable={editable} />
    </div>
  );
}

function WorldNoteAuxSection({
  node,
  depth,
  editable,
}: {
  node: WorldNoteAuxNode;
  depth: number;
  editable: boolean;
}) {
  const { updateWorldNoteContent } = useLocalWrite();
  const headingClass =
    depth === 0
      ? 'text-sm font-bold'
      : depth === 1
        ? 'text-xs font-bold'
        : 'text-[11px] font-semibold';
  return (
    <section
      style={{ paddingLeft: depth > 0 ? Math.min(depth, 4) * 8 : undefined }}
      className={depth > 0 ? 'mt-2' : undefined}
    >
      <h3 className={`${headingClass} mb-1 text-foreground`}>
        {node.name?.trim() || '(이름 없음)'}
      </h3>
      <WorldNoteInlineEditor
        noteId={node.id}
        initialContent={node.content}
        placeholder={editable ? '내용을 입력하세요…' : '내용 없음'}
        onUpdate={(json) => void updateWorldNoteContent(node.id, json)}
        editable={editable}
        size="xs"
      />
      {node.children.length > 0 && (
        <div className="mt-1.5">
          {node.children.map((child) => (
            <WorldNoteAuxSection
              key={child.id}
              node={child}
              depth={depth + 1}
              editable={editable}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ── world_note 외 docType — 단일 문서 뷰 + 자식 링크 ── */

function NonWorldNoteAuxView({
  docType,
  docId,
  editable,
  onAddPanel,
}: AuxDocViewerProps) {
  const { data: rows = [] } = useQuery<DocRow>(DOC_QUERIES[docType], [docId]);
  const doc = rows[0];

  const childConfig = CHILD_QUERIES[docType];
  const { data: children = [] } = useQuery<ChildRow>(
    childConfig ? childConfig.sql : 'SELECT NULL AS id, NULL AS title, NULL AS content WHERE 0',
    childConfig ? [docId] : [],
  );

  const {
    updateEpisode, updatePlanNoteContent,
    updateCharacterNoteContent, updatePlot, updateForeshadow,
  } = useLocalWrite();

  const canEdit = editable && docType !== 'character';
  const handleUpdate = (json: string) => {
    switch (docType) {
      case 'episode':        return void updateEpisode(docId, { content: json });
      case 'plan_note':      return void updatePlanNoteContent(docId, json);
      case 'character_note': return void updateCharacterNoteContent(docId, json);
      case 'plot':           return void updatePlot(docId, { content: json });
      case 'foreshadow':     return void updateForeshadow(docId, { content: json });
    }
  };

  if (!doc) {
    return (
      <div className="flex items-center justify-center px-3 py-6 text-xs text-muted-foreground">
        문서를 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      {docType === 'character' && (doc.gender || doc.age) && (
        <div className="mb-2 flex gap-3 text-xs text-muted-foreground">
          {doc.gender && <span>성별: {doc.gender}</span>}
          {doc.age && <span>나이: {doc.age}</span>}
        </div>
      )}
      <WorldNoteInlineEditor
        noteId={docId}
        initialContent={doc.content}
        placeholder={canEdit ? '내용을 입력하세요…' : '내용 없음'}
        onUpdate={handleUpdate}
        editable={canEdit}
        size="xs"
      />
      {children.length > 0 && childConfig && (
        <div className="mt-3 border-t border-border/50 pt-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            하위 문서
          </p>
          <div className="flex flex-col gap-0.5">
            {children.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() =>
                  onAddPanel({
                    docType: childConfig.docType,
                    docId: child.id,
                    title: child.title,
                  })
                }
                className="flex items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-foreground hover:bg-sidebar-accent"
              >
                <FileText size={11} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{child.title || '(제목 없음)'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
