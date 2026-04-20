import { useState, useEffect } from 'react';
import { useQuery } from '@powersync/react';
import { ArrowLeft } from 'lucide-react';
import { WorldNoteEditor } from './WorldNoteEditor';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { IconButton } from '../../components/ui/IconButton';

interface WorldNoteScreenProps {
  noteId: string;
  onBack: () => void;
}

interface NoteRow {
  id: string;
  name: string;
  content: string | null;
  parent_id: string | null;
}

interface ParentRow {
  name: string;
}

/**
 * 세계관 문서 편집 화면.
 * - 상단: 브레드크럼 경로 + 인라인 편집 가능한 문서 제목
 * - 하단: TipTap 에디터 (1초 debounce 자동저장)
 */
export function WorldNoteScreen({ noteId, onBack }: WorldNoteScreenProps) {
  const { updateWorldNoteContent, updateWorldNoteName } = useLocalWrite();

  const { data: rows = [] } = useQuery<NoteRow>(
    `SELECT id, name, content, parent_id FROM world_note WHERE id = ? LIMIT 1`,
    [noteId],
  );

  const note = rows[0] ?? null;

  // 부모 이름 조회
  const { data: parentRows = [] } = useQuery<ParentRow>(
    note?.parent_id
      ? `SELECT name FROM world_note WHERE id = ? LIMIT 1`
      : `SELECT '' AS name WHERE 0`,
    note?.parent_id ? [note.parent_id] : [],
  );
  const parentName = parentRows[0]?.name ?? null;

  const [nameInput, setNameInput] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    if (note) setNameInput(note.name);
  }, [note]);

  const handleNameBlur = async () => {
    setIsEditingName(false);
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === note?.name) return;
    await updateWorldNoteName(noteId, trimmed);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      void handleNameBlur();
    }
  };

  const handleContentUpdate = async (content: string) => {
    await updateWorldNoteContent(noteId, content);
  };

  if (!note) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        문서를 불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MainPanelHeader
        leading={
          <IconButton
            aria-label="뒤로"
            title="뒤로"
            onClick={onBack}
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </IconButton>
        }
        title={
          <span className="flex items-center gap-1 text-lg">
            <span className="text-sm text-muted-foreground">세계관</span>
            {parentName && (
              <>
                <span className="text-sm text-muted-foreground">/</span>
                <span className="text-sm text-muted-foreground">{parentName}</span>
              </>
            )}
            <span className="text-sm text-muted-foreground">/</span>
            {isEditingName ? (
              <input
                autoFocus
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={() => void handleNameBlur()}
                onKeyDown={handleNameKeyDown}
                className="w-full font-semibold text-foreground outline-none"
              />
            ) : (
              <span
                role="button"
                tabIndex={0}
                onClick={() => setIsEditingName(true)}
                onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingName(true); }}
                className="cursor-text font-semibold text-foreground hover:text-primary"
                title="클릭하여 제목 편집"
              >
                {note.name}
              </span>
            )}
          </span>
        }
      />

      {/* 에디터 */}
      <WorldNoteEditor
        noteId={noteId}
        initialContent={note.content}
        onUpdate={(content) => void handleContentUpdate(content)}
      />
    </div>
  );
}
