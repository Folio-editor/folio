import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { LayoutGrid, List } from 'lucide-react';
import { useWriterId } from '../../hooks/useWriterId';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { cn } from '../../lib/cn';

const previewExtensions = [
  StarterKit.configure({ code: false, codeBlock: false }),
  Underline,
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
}

export function WorldNoteOverview({ workId, onNoteSelect }: WorldNoteOverviewProps) {
  const writerId = useWriterId();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const { data: notes = [] } = useQuery<NoteRow>(
    `SELECT id, name, content FROM world_note
     WHERE work_id = ? AND writer_id = ? AND parent_id IS NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [workId, writerId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MainPanelHeader
        title={<span className="text-lg font-semibold">세계관</span>}
        subtitle="작품의 배경과 설정을 관리합니다"
        trailing={<ViewToggle mode={viewMode} onChange={setViewMode} />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {notes.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            좌측 사이드바에서 문서를 선택하거나 추가하세요.
          </p>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {notes.map((note) => (
              <GridCard key={note.id} note={note} onClick={() => onNoteSelect(note.id)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {notes.map((note) => (
              <ListItem key={note.id} note={note} onClick={() => onNoteSelect(note.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 그리드 카드 ── */

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
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground/50">내용 없음</p>
      )}
    </button>
  );
}

/* ── 리스트 항목 ── */

function ListItem({ note, onClick }: { note: NoteRow; onClick: () => void }) {
  const previewHtml = useMemo(() => contentToHtml(note.content), [note.content]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3 text-left transition-colors hover:border-ring hover:bg-primary/5"
    >
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">
          {note.name?.trim() || '(이름 없음)'}
        </span>
        {previewHtml ? (
          <div
            className="note-preview mt-0.5 line-clamp-1 text-xs text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground/50">내용 없음</p>
        )}
      </div>
    </button>
  );
}

/* ── 뷰 모드 토글 ── */

function ViewToggle({
  mode,
  onChange,
}: {
  mode: 'grid' | 'list';
  onChange: (mode: 'grid' | 'list') => void;
}) {
  return (
    <div className="flex items-center rounded-md border border-border">
      <button
        type="button"
        onClick={() => onChange('grid')}
        title="그리드 보기"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-l-md transition-colors',
          mode === 'grid'
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <LayoutGrid size={14} />
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        title="리스트 보기"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-r-md transition-colors',
          mode === 'list'
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <List size={14} />
      </button>
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
