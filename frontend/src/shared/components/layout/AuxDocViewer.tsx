import { useQuery } from '@powersync/react';
import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { FileText } from 'lucide-react';
import type { AuxDocType, AuxPanelItem } from '../../types/workspace';

/** generateHTML용 최소 확장 세트 */
const previewExtensions = [
  StarterKit.configure({ code: false, codeBlock: false }),
  Underline,
  Highlight.configure({ multicolor: false }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
];

interface AuxDocViewerProps {
  docType: AuxDocType;
  docId: string;
  onAddPanel: (item: Omit<AuxPanelItem, 'id' | 'collapsed'>) => void;
}

interface DocRow {
  title: string;
  content: string | null;
  gender?: string;
  age?: string;
}

interface ChildRow {
  id: string;
  title: string;
}

const DOC_QUERIES: Record<AuxDocType, string> = {
  episode: 'SELECT title, content FROM episode WHERE id = ?',
  world_note: 'SELECT name AS title, content FROM world_note WHERE id = ?',
  plan_note: 'SELECT title, content FROM plan_note WHERE id = ?',
  character_note: 'SELECT title, content FROM character_note WHERE id = ?',
  plot: 'SELECT title, content FROM plot WHERE id = ?',
  character: 'SELECT name AS title, gender, age, content FROM character WHERE id = ?',
  foreshadow: 'SELECT title, content FROM foreshadow WHERE id = ?',
};

const CHILD_QUERIES: Partial<Record<AuxDocType, { sql: string; docType: AuxDocType }>> = {
  world_note: {
    sql: 'SELECT id, name AS title FROM world_note WHERE parent_id = ? ORDER BY sort_order ASC',
    docType: 'world_note',
  },
  plot: {
    sql: 'SELECT id, title FROM plot WHERE parent_id = ? ORDER BY sort_order ASC',
    docType: 'plot',
  },
};

function contentToHtml(raw: string | null): string {
  if (!raw) return '';
  try {
    const json = JSON.parse(raw) as object;
    return generateHTML(json, previewExtensions);
  } catch {
    return '';
  }
}

export function AuxDocViewer({ docType, docId, onAddPanel }: AuxDocViewerProps) {
  const { data: rows = [] } = useQuery<DocRow>(DOC_QUERIES[docType], [docId]);
  const doc = rows[0];

  // 하위 문서 쿼리 (world_note, plot만 해당)
  const childConfig = CHILD_QUERIES[docType];
  const { data: children = [] } = useQuery<ChildRow>(
    childConfig ? childConfig.sql : 'SELECT NULL AS id, NULL AS title WHERE 0',
    childConfig ? [docId] : [],
  );

  if (!doc) {
    return (
      <div className="flex items-center justify-center px-3 py-6 text-xs text-muted-foreground">
        문서를 찾을 수 없습니다.
      </div>
    );
  }

  const html = contentToHtml(doc.content);

  return (
    <div className="px-3 py-2">
      {/* 캐릭터 특수 필드 */}
      {docType === 'character' && (doc.gender || doc.age) && (
        <div className="mb-2 flex gap-3 text-xs text-muted-foreground">
          {doc.gender && <span>성별: {doc.gender}</span>}
          {doc.age && <span>나이: {doc.age}</span>}
        </div>
      )}

      {/* 본문 */}
      {html ? (
        <div
          className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="py-2 text-xs text-muted-foreground/60">내용 없음</p>
      )}

      {/* 하위 문서 링크 */}
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
