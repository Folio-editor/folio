import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { Trash2 } from 'lucide-react';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDecryptedCharacterList } from '../../hooks/useDecryptedCharacter';
import { useDecryptedCharacterNoteList } from '../../hooks/useDecryptedCharacterNote';
import { useDeferredText } from '../../hooks/useDeferredText';
import { Input } from '../../components/ui/Input';
import { IconButton } from '../../components/ui/IconButton';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { BreadcrumbTitle } from '../../components/layout/BreadcrumbTitle';
import { ContentEditor } from '../../components/editor/ContentEditor';
import { EditorToolbarToggle } from '../../components/editor/EditorToolbarToggle';
import { DeleteConfirmDialog } from '../../components/ui/DeleteConfirmDialog';

interface CharacterNoteEditorProps {
  noteId: string;
  onBack: () => void;
  onBackToCharacter?: (characterId: string) => void;
  onSendToRight?: () => void;
}

interface CharacterNoteRow {
  id: string;
  title: string;
  content: string | null;
  character_id: string;
}

interface RawCharacterNoteJoinRow {
  id: string;
  character_id: string;
  writer_id: string;
  kind: string;
  title: string | null;
  content: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  work_id: string;
  encrypted_dek: string | null;
}

interface RawCharacterJoinRow {
  id: string;
  work_id: string;
  writer_id: string;
  name: string | null;
  gender: string | null;
  age: string | null;
  profile_image_url: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  encrypted_dek: string | null;
}

export function CharacterNoteEditor({ noteId, onBack, onBackToCharacter, onSendToRight }: CharacterNoteEditorProps) {
  const { updateCharacterNoteContent, updateCharacterNoteTitle, deleteCharacterNote } = useLocalWrite();

  const { data: rawNoteRows = [] } = useQuery<RawCharacterNoteJoinRow>(
    `SELECT cn.id, cn.character_id, cn.writer_id, cn.kind, cn.title, cn.content,
            cn.sort_order, cn.created_at, cn.updated_at,
            c.work_id AS work_id, w.encrypted_dek AS encrypted_dek
     FROM character_note cn
     JOIN character c ON c.id = cn.character_id
     LEFT JOIN work w ON w.id = c.work_id
     WHERE cn.id = ?`,
    [noteId],
  );
  const { data: decryptedNotes } = useDecryptedCharacterNoteList(rawNoteRows);
  const note: CharacterNoteRow | undefined = useMemo(() => {
    const n = decryptedNotes[0];
    if (!n) return undefined;
    return {
      id: n.id,
      title: n.title,
      content: n.content,
      character_id: n.character_id,
    };
  }, [decryptedNotes]);

  const { data: rawCharRows = [] } = useQuery<RawCharacterJoinRow>(
    note
      ? `SELECT c.id, c.work_id, c.writer_id, c.name, c.gender, c.age,
                c.profile_image_url, c.sort_order, c.created_at, c.updated_at,
                w.encrypted_dek AS encrypted_dek
         FROM character c
         LEFT JOIN work w ON w.id = c.work_id
         WHERE c.id = ?`
      : `SELECT NULL AS id, NULL AS work_id, NULL AS writer_id, NULL AS name,
                NULL AS gender, NULL AS age, NULL AS profile_image_url,
                NULL AS sort_order, NULL AS created_at, NULL AS updated_at,
                NULL AS encrypted_dek WHERE 0`,
    note ? [note.character_id] : [],
  );
  const { data: decryptedChars } = useDecryptedCharacterList(rawCharRows);
  const characterName = decryptedChars[0]?.name ?? '';

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
      onSendToRight={onSendToRight}
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
  onSendToRight,
  onTitleChange,
  onContentChange,
  onDelete,
}: {
  note: CharacterNoteRow;
  characterName: string;
  onBack: () => void;
  onSendToRight?: () => void;
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
        onSendToRight={onSendToRight}
        title={
          <BreadcrumbTitle
            items={['등장인물', characterName]}
            trailing={
              <Input
                value={title.value}
                onChange={(e) => title.onChange(e.target.value)}
                onBlur={title.onBlur}
                placeholder="문서 제목"
                className="min-w-0 flex-1 border-none px-0 text-sm font-semibold shadow-none focus-visible:ring-0"
              />
            }
          />
        }
        trailing={
          <div className="flex items-center gap-1">
            <EditorToolbarToggle />
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              title="문서 삭제"
              className="rounded p-2 text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
            >
              <Trash2 size={16} strokeWidth={1.75} />
            </button>
          </div>
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
