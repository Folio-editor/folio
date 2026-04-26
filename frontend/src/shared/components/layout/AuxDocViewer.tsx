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

// world_note는 parent_id 포함 — root 여부 판단 필요. 다른 docType은 기존 그대로.
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

const CHILD_QUERIES: Partial<Record<AuxDocType, { sql: string; docType: AuxDocType }>> = {
  world_note: {
    sql: 'SELECT id, name AS title, content FROM world_note WHERE parent_id = ? ORDER BY sort_order ASC',
    docType: 'world_note',
  },
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
  const { data: rows = [] } = useQuery<DocRow>(DOC_QUERIES[docType], [docId]);
  const doc = rows[0];

  const childConfig = CHILD_QUERIES[docType];
  const { data: children = [] } = useQuery<ChildRow>(
    childConfig ? childConfig.sql : 'SELECT NULL AS id, NULL AS title, NULL AS content WHERE 0',
    childConfig ? [docId] : [],
  );

  const {
    updateEpisode, updateWorldNoteContent, updatePlanNoteContent,
    updateCharacterNoteContent, updatePlot, updateForeshadow,
  } = useLocalWrite();

  // docType별 update 분기 — character는 본문 편집 미지원
  const canEdit = editable && docType !== 'character';
  const handleUpdate = (json: string) => {
    switch (docType) {
      case 'episode':        return void updateEpisode(docId, { content: json });
      case 'world_note':     return void updateWorldNoteContent(docId, json);
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

  // 세계관 root(parent_id NULL)면 사전형 통합 뷰 — 메인의 Hierarchy 화면 축소판.
  // 사이드바 너비/높이 제약으로 focus 모드/큰 minHeight는 미적용 (단순 stack).
  const isWorldNoteRoot =
    docType === 'world_note' && (doc.parent_id === null || doc.parent_id === undefined);

  if (isWorldNoteRoot) {
    return (
      <div className="flex flex-col gap-3 px-3 py-2">
        {/* 상위 본문 */}
        <WorldNoteInlineEditor
          noteId={docId}
          initialContent={doc.content}
          placeholder={canEdit ? '내용을 입력하세요…' : '내용 없음'}
          onUpdate={handleUpdate}
          editable={canEdit}
          size="xs"
        />

        {/* 하위 문서들 — 각 카드 인라인 편집 가능 */}
        {children.length > 0 && (
          <div className="border-t border-border/50 pt-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              하위 문서
            </p>
            <div className="flex flex-col divide-y divide-border">
              {children.map((child) => (
                <ChildSection
                  key={child.id}
                  noteId={child.id}
                  name={child.title}
                  content={child.content}
                  editable={canEdit}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 그 외: 단일 문서 뷰 — 본문 + (있으면) 하위 문서 링크
  return (
    <div className="px-3 py-2">
      {/* 캐릭터 특수 필드 */}
      {docType === 'character' && (doc.gender || doc.age) && (
        <div className="mb-2 flex gap-3 text-xs text-muted-foreground">
          {doc.gender && <span>성별: {doc.gender}</span>}
          {doc.age && <span>나이: {doc.age}</span>}
        </div>
      )}

      {/* 본문 — 항상 InlineEditor (editable에 따라 cursor 활성/비활성) */}
      <WorldNoteInlineEditor
        noteId={docId}
        initialContent={doc.content}
        placeholder={canEdit ? '내용을 입력하세요…' : '내용 없음'}
        onUpdate={handleUpdate}
        editable={canEdit}
        size="xs"
      />

      {/* 하위 문서 링크 (plot 등) */}
      {children.length > 0 && (
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
                    docType: childConfig!.docType,
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

/* ── 통합 뷰 안 하위 카드 — 메인 Hierarchy의 ChildSection 축소판 ── */

function ChildSection({
  noteId,
  name,
  content,
  editable,
}: {
  noteId: string;
  name: string;
  content: string | null;
  editable: boolean;
}) {
  const { updateWorldNoteContent } = useLocalWrite();
  return (
    <div className="py-2">
      <h3 className="mb-1 text-xs font-bold text-foreground">
        {name || '(이름 없음)'}
      </h3>
      <WorldNoteInlineEditor
        noteId={noteId}
        initialContent={content}
        placeholder={editable ? '내용을 입력하세요…' : '내용 없음'}
        onUpdate={(json) => void updateWorldNoteContent(noteId, json)}
        editable={editable}
        size="xs"
      />
    </div>
  );
}
