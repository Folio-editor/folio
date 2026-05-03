import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useWriterId } from '../../hooks/useWriterId';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useDecryptedWorldNoteList, type RawWorldNoteRow } from '../../hooks/useDecryptedWorldNote';
import { ViewToggle } from '../../components/ui/ViewToggle';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { contentToHtml } from '../../lib/tiptapPreview';

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

interface ItemProps {
  note: NoteRow;
  children: NoteRow[];
  expanded: boolean;
  onClick: () => void;
  onToggle: () => void;
  onChildClick: (id: string) => void;
}

export function WorldNoteOverview({ workId, onNoteSelect }: WorldNoteOverviewProps) {
  const writerId = useWriterId();
  const [viewMode, setViewMode] = usePersistentState<'grid' | 'list'>(
    'folio.ui.view-mode.world-note',
    'list',
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: rawRows = [] } = useQuery<RawWorldNoteRow>(
    `SELECT n.id, n.work_id, n.writer_id, n.parent_id, n.name, n.content,
            n.sort_order, n.created_at, n.updated_at,
            w.encrypted_dek AS encrypted_dek
     FROM world_note n
     LEFT JOIN work w ON w.id = n.work_id
     WHERE n.work_id = ? AND n.writer_id = ?
     ORDER BY n.sort_order ASC, n.created_at ASC`,
    [workId, writerId],
  );
  const { data: decryptedNotes } = useDecryptedWorldNoteList(rawRows);
  const notes: NoteRow[] = useMemo(
    () =>
      decryptedNotes.map((n) => ({
        id: n.id,
        name: n.name,
        content: n.content,
        parent_id: n.parent_id,
      })),
    [decryptedNotes],
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
      map.get(note.parent_id)?.push(note);
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
        title={<span className="text-lg font-semibold">{`\uC138\uACC4\uAD00`}</span>}
        subtitle={`\uC791\uD488\uC758 \uBC30\uACBD\uACFC \uC124\uC815\uC744 \uAD00\uB9AC\uD569\uB2C8\uB2E4`}
        trailing={<ViewToggle mode={viewMode} onChange={setViewMode} />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {rootNotes.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {`\uC88C\uCE21 \uC0AC\uC774\uB4DC\uBC14\uC5D0\uC11C \uBB38\uC11C\uB97C \uC120\uD0DD\uD558\uAC70\uB098 \uCD94\uAC00\uD558\uC138\uC694.`}
          </p>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rootNotes.map((note) => (
              <GridCard
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

function GridCard({ note, children, expanded, onClick, onToggle, onChildClick }: ItemProps) {
  const previewHtml = useMemo(() => contentToHtml(note.content), [note.content]);

  return (
    <div className="rounded-lg border border-border bg-background transition-colors hover:border-ring">
      <button
        type="button"
        onClick={onClick}
        className="flex h-[76px] w-full px-4 py-3 text-left hover:bg-primary/5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {children.length > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-accent"
                aria-label={expanded ? 'collapse' : 'expand'}
              >
                <ChevronRight size={14} className={cn('transition-transform', expanded && 'rotate-90')} />
              </button>
            ) : (
              <span className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="text-sm font-medium text-foreground">{note.name?.trim() || `(\uC774\uB984 \uC5C6\uC74C)`}</span>
          </div>
          {children.length > 0 ? (
            <p className="mt-1 pl-6 text-xs text-muted-foreground/70">{`\uD558\uC704 \uBB38\uC11C ${children.length}\uAC1C`}</p>
          ) : previewHtml ? (
            <div
              className="note-preview mt-1.5 line-clamp-3 pl-6 text-xs text-muted-foreground"
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
                {child.name?.trim() || `(\uC774\uB984 \uC5C6\uC74C)`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ListItem({ note, children, expanded, onClick, onToggle, onChildClick }: ItemProps) {
  const previewHtml = useMemo(() => contentToHtml(note.content), [note.content]);

  return (
    <div className="rounded-md border border-border bg-background transition-colors hover:border-ring">
      <button
        type="button"
        onClick={onClick}
        className="flex h-[64px] w-full items-center px-4 py-2.5 text-left hover:bg-primary/5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {children.length > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-accent"
                aria-label={expanded ? 'collapse' : 'expand'}
              >
                <ChevronRight size={14} className={cn('transition-transform', expanded && 'rotate-90')} />
              </button>
            ) : (
              <span className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="text-sm font-medium text-foreground">{note.name?.trim() || `(\uC774\uB984 \uC5C6\uC74C)`}</span>
          </div>
          {children.length > 0 ? (
            <p className="mt-0.5 pl-6 text-xs text-muted-foreground/70">{`\uD558\uC704 \uBB38\uC11C ${children.length}\uAC1C`}</p>
          ) : previewHtml ? (
            <div
              className="note-preview mt-0.5 line-clamp-1 pl-6 text-xs text-muted-foreground"
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
                {child.name?.trim() || `(\uC774\uB984 \uC5C6\uC74C)`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

