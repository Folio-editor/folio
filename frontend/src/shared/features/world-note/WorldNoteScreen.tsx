import { useState, useEffect } from 'react';
import { useQuery } from '@powersync/react';
import { Trash2 } from 'lucide-react';
import { WorldNoteEditor } from './WorldNoteEditor';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { DeleteConfirmDialog } from '../../components/ui/DeleteConfirmDialog';

interface WorldNoteScreenProps {
  noteId: string;
  onBack: () => void;
  onSendToRight?: () => void;
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
export function WorldNoteScreen({ noteId, onBack, onSendToRight }: WorldNoteScreenProps) {
  const { updateWorldNoteContent, updateWorldNoteName, deleteWorldNote } = useLocalWrite();

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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

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
        onClose={onBack}
        onSendToRight={onSendToRight}
        title={
          <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-lg">
            <span className="shrink-0 text-sm text-muted-foreground">세계관</span>
            {parentName && (
              <>
                <span className="shrink-0 text-sm text-muted-foreground">/</span>
                <span className="max-w-40 truncate text-sm text-muted-foreground">{parentName}</span>
              </>
            )}
            <span className="shrink-0 text-sm text-muted-foreground">/</span>
            {isEditingName ? (
              <input
                autoFocus
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={() => void handleNameBlur()}
                onKeyDown={handleNameKeyDown}
                className="min-w-0 flex-1 bg-transparent font-semibold text-foreground outline-none"
              />
            ) : (
              <span
                role="button"
                tabIndex={0}
                onClick={() => setIsEditingName(true)}
                onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingName(true); }}
                className="min-w-0 flex-1 cursor-text truncate font-semibold text-foreground hover:text-primary"
                title="클릭하여 제목 편집"
              >
                {note.name}
              </span>
            )}
          </span>
        }
        trailing={
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            title="세계관 문서 삭제"
            aria-label="세계관 문서 삭제"
            className="rounded p-2 text-muted-foreground transition-colors hover:bg-destructive/5 hover:text-destructive"
          >
            <Trash2 size={16} strokeWidth={1.75} />
          </button>
        }
      />

      {/* 에디터 */}
      <WorldNoteEditor
        noteId={noteId}
        initialContent={note.content}
        onUpdate={(content) => void handleContentUpdate(content)}
      />

      {confirmDelete && (
        <DeleteConfirmDialog
          title="세계관 문서 삭제"
          message={`"${note.name || '(이름 없음)'}" 문서와 하위 문서가 삭제됩니다.`}
          warning="이 작업은 되돌릴 수 없습니다."
          confirmLabel="삭제"
          busyLabel="삭제 중…"
          busy={deleteBusy}
          onConfirm={() => {
            setDeleteBusy(true);
            void deleteWorldNote(noteId).then(() => {
              setDeleteBusy(false);
              setConfirmDelete(false);
              onBack();
            });
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
