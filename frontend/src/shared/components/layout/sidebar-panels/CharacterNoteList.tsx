import { useEffect, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import { ChevronRight, Plus } from 'lucide-react';
import { useWriterId } from '../../../hooks/useWriterId';
import { useLocalWrite } from '../../../hooks/useLocalWrite';
import { cn } from '../../../lib/cn';

interface CharacterRow {
  id: string;
  name: string;
}

interface CharacterNoteRow {
  id: string;
  kind: string;
  title: string;
}

interface CharacterNoteListProps {
  workId: string;
  searchTerm: string;
  selectedCharacterId: string | null;
  selectedNoteId: string | null;
  onCharacterSelect: (id: string) => void;
  onNoteSelect: (id: string | null) => void;
  onNewCharacterNote: () => void;
}

/**
 * 인물 트리 리스트.
 *
 * ├── 홍길동                    ← 인물 (클릭 → 메타 편집)
 * │   ├── 외형                  ← 고정 하위 문서
 * │   ├── 성격                  ← 고정 하위 문서
 * │   └── + 새 문서             ← 커스텀 추가
 * ├── 김영희
 * │   ├── 외형
 * │   └── 성격
 */
export function CharacterNoteList({
  workId,
  searchTerm,
  selectedCharacterId,
  selectedNoteId,
  onCharacterSelect,
  onNoteSelect,
  onNewCharacterNote,
}: CharacterNoteListProps) {
  const writerId = useWriterId();

  const trimmed = searchTerm.trim();
  const whereName = trimmed ? `AND name LIKE ? ESCAPE '\\'` : '';
  const sql = `SELECT id, name FROM character
     WHERE work_id = ? AND writer_id = ? ${whereName}
     ORDER BY sort_order ASC, created_at ASC`;
  const params = trimmed
    ? [workId, writerId, `%${escapeLike(trimmed)}%`]
    : [workId, writerId];
  const { data: characters = [] } = useQuery<CharacterRow>(sql, params);

  if (characters.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-xs text-muted-foreground">
        {trimmed ? '검색 결과가 없습니다.' : '등장인물이 없습니다.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      {characters.map((char) => (
        <CharacterTreeItem
          key={char.id}
          character={char}
          isExpanded={selectedCharacterId === char.id}
          selectedNoteId={selectedCharacterId === char.id ? selectedNoteId : null}
          onCharacterClick={() => {
            onNoteSelect(null);
            onCharacterSelect(char.id);
          }}
          onNoteSelect={onNoteSelect}
          onNewNote={onNewCharacterNote}
        />
      ))}
    </div>
  );
}

function CharacterTreeItem({
  character,
  isExpanded,
  selectedNoteId,
  onCharacterClick,
  onNoteSelect,
  onNewNote,
}: {
  character: CharacterRow;
  isExpanded: boolean;
  selectedNoteId: string | null;
  onCharacterClick: () => void;
  onNoteSelect: (id: string) => void;
  onNewNote: () => void;
}) {
  const writerId = useWriterId();
  const { updateCharacterNoteTitle } = useLocalWrite();

  const { data: notes = [] } = useQuery<CharacterNoteRow>(
    isExpanded
      ? `SELECT id, kind, title FROM character_note
         WHERE character_id = ? AND writer_id = ?
         ORDER BY sort_order ASC, created_at ASC`
      : `SELECT '' AS id, '' AS kind, '' AS title WHERE 0`,
    isExpanded ? [character.id, writerId] : [],
  );

  return (
    <div>
      {/* 인물 이름 (루트 노드) */}
      <button
        type="button"
        onClick={onCharacterClick}
        className={cn(
          'flex w-full items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
          isExpanded && !selectedNoteId
            ? 'bg-primary/5 font-medium text-primary'
            : isExpanded
              ? 'font-medium text-sidebar-foreground'
              : 'text-sidebar-foreground',
        )}
      >
        <ChevronRight
          size={12}
          strokeWidth={2}
          className={cn(
            'shrink-0 transition-transform',
            isExpanded && 'rotate-90',
          )}
        />
        {character.name?.trim() || '(이름 없음)'}
      </button>

      {/* 하위 노트 (트리 자식) */}
      {isExpanded && (
        <div className="ml-3 border-l border-border/50 pl-2">
          {notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              selected={selectedNoteId === note.id}
              onSelect={() => onNoteSelect(note.id)}
              onRename={(title) => void updateCharacterNoteTitle(note.id, title)}
            />
          ))}
          <button
            type="button"
            onClick={onNewNote}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-sidebar-accent"
          >
            <Plus size={12} strokeWidth={2} />
            <span>새 문서</span>
          </button>
        </div>
      )}
    </div>
  );
}

function NoteItem({
  note,
  selected,
  onSelect,
  onRename,
}: {
  note: CharacterNoteRow;
  selected: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
}) {
  const isFixed = note.kind === 'appearance' || note.kind === 'personality';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.title);

  useEffect(() => {
    if (!editing) setDraft(note.title);
  }, [editing, note.title]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === note.title) {
      setDraft(note.title);
      return;
    }
    onRename(next.slice(0, 200));
  };

  const cancel = () => {
    setDraft(note.title);
    setEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/\n/g, ''))}
        onBlur={commit}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={handleKeyDown}
        maxLength={200}
        className="w-full rounded-md border border-ring bg-background px-2 py-1 text-xs text-foreground outline-none ring-1 ring-ring"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={isFixed ? undefined : () => setEditing(true)}
      title={isFixed ? undefined : '더블클릭으로 이름 변경'}
      className={cn(
        'w-full truncate rounded-md px-2 py-1 text-left text-xs hover:bg-sidebar-accent',
        selected
          ? 'bg-primary/5 font-medium text-primary'
          : 'text-sidebar-foreground',
      )}
    >
      {note.title?.trim() || '(제목 없음)'}
    </button>
  );
}

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
