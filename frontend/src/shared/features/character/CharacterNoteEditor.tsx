import { useQuery } from '@powersync/react';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { Input } from '../../components/ui/Input';
import { IconButton } from '../../components/ui/IconButton';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { ContentEditor } from '../../components/editor/ContentEditor';

interface CharacterNoteEditorProps {
  noteId: string;
  onBack: () => void;
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

export function CharacterNoteEditor({ noteId, onBack }: CharacterNoteEditorProps) {
  const { updateCharacterNoteContent, updateCharacterNoteTitle } = useLocalWrite();

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

  return (
    <NoteEditorInner
      key={noteId}
      note={note}
      characterName={characterName}
      onBack={onBack}
      onTitleChange={(title) => void updateCharacterNoteTitle(noteId, title)}
      onContentChange={(content) => void updateCharacterNoteContent(noteId, content)}
    />
  );
}

function NoteEditorInner({
  note,
  characterName,
  onBack,
  onTitleChange,
  onContentChange,
}: {
  note: CharacterNoteRow;
  characterName: string;
  onBack: () => void;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
}) {
  const title = useDeferredText(note.id, note.title, onTitleChange);

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
      />
      <ContentEditor
        itemId={note.id}
        initialContent={note.content}
        placeholder="내용을 작성하세요…"
        onUpdate={onContentChange}
      />
    </div>
  );
}
