import { useState } from 'react';
import { useQuery } from '@powersync/react';
import { Trash2 } from 'lucide-react';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { Input } from '../../components/ui/Input';
import { IconButton } from '../../components/ui/IconButton';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { ContentEditor } from '../../components/editor/ContentEditor';
import { DeleteConfirmDialog } from '../../components/ui/DeleteConfirmDialog';

interface CharacterNoteEditorProps {
  noteId: string;
  onBack: () => void;
  onBackToCharacter?: (characterId: string) => void;
}

interface CharacterNoteRow {
  id: string;
  title: string;
  content: string | null;
  character_id: string;
}

interface CharacterNameRow {
  name: string;
}

export function CharacterNoteEditor({ noteId, onBack, onBackToCharacter }: CharacterNoteEditorProps) {
  const { updateCharacterNoteContent, updateCharacterNoteTitle, deleteCharacterNote } = useLocalWrite();

  const { data: noteRows = [] } = useQuery<CharacterNoteRow>(
    `SELECT id, title, content, character_id FROM character_note WHERE id = ?`,
    [noteId],
  );
  const note = noteRows[0];

  const { data: nameRows = [] } = useQuery<CharacterNameRow>(
    note
      ? `SELECT name FROM character WHERE id = ?`
      : `SELECT '' AS name WHERE 0`,
    note ? [note.character_id] : [],
  );
  const characterName = nameRows[0]?.name ?? '';

  if (!note) {
    return <div className="p-8 text-sm text-muted-foreground">문서를 불러오는 중…</div>;
  }

  const handleBack = () => {
    if (onBackToCharacter && note.character_id) {
      onBackToCharacter(note.character_id);
    } else {
      onBack();
    }
  };

  return (
    <NoteEditorInner
      key={noteId}
      note={note}
      characterName={characterName}
      onBack={handleBack}
      onTitleChange={(title) => void updateCharacterNoteTitle(noteId, title)}
      onContentChange={(content) => void updateCharacterNoteContent(noteId, content)}
      onDelete={() => deleteCharacterNote(noteId)}
    />
  );
}

function NoteEditorInner({
  note,
  characterName,
  onBack,
  onTitleChange,
  onContentChange,
  onDelete,
}: {
  note: CharacterNoteRow;
  characterName: string;
  onBack: () => void;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  onDelete: () => Promise<void> | void;
}) {
  const title = useDeferredText(note.id, note.title, onTitleChange);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        leading={<IconButton onClick={onBack} title="인물로 돌아가기">←</IconButton>}
        title={
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-muted-foreground">{characterName}</span>
            <span className="text-sm text-muted-foreground">{'>'}</span>
            <Input
              value={title.value}
              onChange={(e) => title.onChange(e.target.value)}
              onBlur={title.onBlur}
              placeholder="문서 제목"
              className="min-w-0 flex-1 border-none px-0 text-base font-medium shadow-none focus-visible:ring-0"
            />
          </div>
        }
        trailing={
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            title="문서 삭제"
            className="rounded p-2 text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
          >
            <Trash2 size={16} strokeWidth={1.75} />
          </button>
        }
      />
      <ContentEditor
        itemId={note.id}
        initialContent={note.content}
        placeholder="내용을 작성하세요…"
        onUpdate={onContentChange}
      />
      {confirmDelete && (
        <DeleteConfirmDialog
          title="문서 삭제"
          message={`"${note.title || '(제목 없음)'}" 문서가 영구 삭제됩니다.`}
          busy={deleteBusy}
          onConfirm={() => {
            setDeleteBusy(true);
            void Promise.resolve(onDelete()).then(() => {
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
