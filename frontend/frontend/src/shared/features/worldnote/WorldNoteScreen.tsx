import { useState, useEffect } from 'react';
import { useQuery } from '@powersync/react';
import { WorldNoteEditor } from './WorldNoteEditor';
import { useLocalWrite } from '../../hooks/useLocalWrite';

interface WorldNoteScreenProps {
  noteId: string;
}

interface NoteRow {
  id: string;
  name: string;
  content: string | null;
}

/**
 * 세계관 문서 편집 화면.
 * - 상단: 인라인 편집 가능한 문서 제목
 * - 하단: TipTap 에디터 (1초 debounce 자동저장)
 */
export function WorldNoteScreen({ noteId }: WorldNoteScreenProps) {
  const { updateWorldNoteContent, updateWorldNoteName } = useLocalWrite();

  const { data: rows = [] } = useQuery<NoteRow>(
    `SELECT id, name, content FROM world_note WHERE id = ? LIMIT 1`,
    [noteId],
  );

  const note = rows[0] ?? null;

  const [nameInput, setNameInput] = useState(note?.name ?? '');
  const [isEditingName, setIsEditingName] = useState(false);

  // note가 바뀌면(다른 문서 선택) 제목 동기화
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
      <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
        문서를 불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 제목 바 */}
      <div className="border-b px-8 py-3">
        {isEditingName ? (
          <input
            autoFocus
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={() => void handleNameBlur()}
            onKeyDown={handleNameKeyDown}
            className="w-full text-lg font-semibold text-gray-900 outline-none"
          />
        ) : (
          <h2
            role="button"
            tabIndex={0}
            onClick={() => setIsEditingName(true)}
            onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingName(true); }}
            className="cursor-text text-lg font-semibold text-gray-900 hover:text-blue-600"
            title="클릭하여 제목 편집"
          >
            {note.name}
          </h2>
        )}
      </div>

      {/* 에디터 */}
      <WorldNoteEditor
        noteId={noteId}
        initialContent={note.content}
        onUpdate={(content) => void handleContentUpdate(content)}
      />
    </div>
  );
}
