import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useWriterId } from '../../hooks/useWriterId';
import { usePersistentState } from '../../hooks/usePersistentState';
import { ViewToggle } from '../../components/ui/ViewToggle';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';

const previewExtensions = [
  StarterKit.configure({ code: false, codeBlock: false }),
  Highlight.configure({ multicolor: false }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
];

interface WorldNoteOverviewProps {
  workId: string;
  onNoteSelect: (id: string) => void;
}

interface NoteRow {
  id: string;
  name: string;
  content: string | null;
  parent_id: string | null;
}

export function WorldNoteOverview({ workId, onNoteSelect }: WorldNoteOverviewProps) {
  const writerId = useWriterId();
  const [viewMode, setViewMode] = usePersistentState<'grid' | 'list'>('folio.ui.view-mode.world-note', 'list');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: notes = [] } = useQuery<NoteRow>(
    `SELECT id, name, content, parent_id FROM world_note
     WHERE work_id = ? AND writer_id = ?
     ORDER BY sort_order ASC, created_at ASC`,
    [workId, writerId],
  );

  const rootNotes = useMemo(
    () => notes.filter((note) => note.parent_id === null),
    [notes],
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string, NoteRow[]>();
    for (const note of notes) {
      if (!note.parent_id) continue;
      if (!map.has(note.parent_id)) map.set(note.parent_id, []);
      map.get(note.parent_id)!.push(note);
    }
    return map;
  }, [notes]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MainPanelHeader
        title={<span className="text-lg font-semibold">세계관</span>}
        subtitle="작품의 배경과 설정을 관리합니다"
        trailing={<ViewToggle mode={viewMode} onChange={setViewMode} />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {rootNotes.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            좌측 사이드바에서 문서를 선택하거나 추가하세요.
          </p>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rootNotes.map((note) => (
              <GridCard key={note.id} note={note} onClick={() => onNoteSelect(note.id)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {rootNotes.map((note) => (
              <ListItem
                key={note.id}
                note={note}
                children={childrenByParent.get(note.id) ?? []}
                expanded={expandedIds.has(note.id)}
                onClick={() => onNoteSelect(note.id)}
                onToggle={() => toggleExpanded(note.id)}
                onChildClick={(id) => onNoteSelect(id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GridCard({ note, onClick }: { note: NoteRow; onClick: () => void }) {
  const previewHtml = useMemo(() => contentToHtml(note.content), [note.content]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-ring hover:bg-primary/5"
    >
      <span className="text-sm font-medium text-foreground">
        {note.name?.trim() || '(이름 없음)'}
      </span>
      {previewHtml ? (
        <div
          className="note-preview mt-1.5 line-clamp-3 text-xs text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      ) : null}
    </button>
  );
}

function ListItem({
  note,
  children,
  expanded,
  onClick,
  onToggle,
  onChildClick,
}: {
  note: NoteRow;
  children: NoteRow[];
  expanded: boolean;
  onClick: () => void;
  onToggle: () => void;
  onChildClick: (id: string) => void;
}) {
  const previewHtml = useMemo(() => contentToHtml(note.content), [note.content]);

  return (
    <div className="rounded-md border border-border bg-background transition-colors hover:border-ring">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-primary/5"
      >
        {children.length > 0 ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onToggle();
              }
            }}
            className="flex h-4 w-4 items-center justify-center"
          >
            <ChevronRight
              size={14}
              className={cn('transition-transform', expanded && 'rotate-90')}
            />
          </span>
        ) : (
          <span className="h-4 w-4" />
        )}

        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-foreground">
            {note.name?.trim() || '(이름 없음)'}
          </span>
          {children.length > 0 ? (
            <p className="mt-0.5 text-xs text-muted-foreground/70">
              하위 문서 {children.length}개
            </p>
          ) : previewHtml ? (
            <div
              className="note-preview mt-0.5 line-clamp-1 text-xs text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : null}
        </div>
      </button>

      {expanded && children.length > 0 && (
        <div className="border-t border-border bg-muted/20 px-3 py-2">
          <div className="flex flex-col gap-1">
            {children.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => onChildClick(child.id)}
                className="truncate rounded-md px-3 py-1.5 text-left text-xs text-foreground hover:bg-accent"
              >
                {child.name?.trim() || '(이름 없음)'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function contentToHtml(raw: string | null): string {
  if (!raw) return '';
  try {
    const json = JSON.parse(raw);
    return generateHTML(json, previewExtensions);
  } catch {
    return '';
  }
}
