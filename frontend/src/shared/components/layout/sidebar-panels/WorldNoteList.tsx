import { useQuery } from '@powersync/react';
import { Plus } from 'lucide-react';
import { useWriterId } from '../../../hooks/useWriterId';
import { cn } from '../../../lib/cn';

interface NoteRow {
  id: string;
  name: string;
}

interface WorldNoteListProps {
  workId: string;
  searchTerm: string;
  selectedItemId: string | null;
  onItemSelect: (id: string | null) => void;
  onNewWorldNote: () => void;
}

/**
 * 세계관(world-note) 섹션 전용 평면 리스트.
 * - parent_id IS NULL 로 최상위 노트만 표시 (기존 Sidebar.WorldNoteList 로직 이관)
 * - 상단 "+ 새 세계관 문서" 버튼
 */
export function WorldNoteList({
  workId,
  searchTerm,
  selectedItemId,
  onItemSelect,
  onNewWorldNote,
}: WorldNoteListProps) {
  const writerId = useWriterId();
  const trimmed = searchTerm.trim();
  const whereSearch = trimmed ? `AND name LIKE ? ESCAPE '\\'` : '';
  const sql = `SELECT id, name FROM world_note
     WHERE work_id = ? AND writer_id = ? AND parent_id IS NULL ${whereSearch}
     ORDER BY sort_order ASC, created_at ASC`;
  const params = trimmed
    ? [workId, writerId, `%${escapeLike(trimmed)}%`]
    : [workId, writerId];
  const { data: notes = [] } = useQuery<NoteRow>(sql, params);

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      <button
        type="button"
        onClick={onNewWorldNote}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-100"
      >
        <Plus size={14} strokeWidth={2} />
        <span>새 세계관 문서</span>
      </button>
      {notes.length === 0 ? (
        <p className="px-2 py-6 text-center text-xs text-gray-400">
          {trimmed ? '검색 결과가 없습니다.' : '세계관 문서가 없습니다.'}
        </p>
      ) : (
        notes.map((note) => (
          <button
            key={note.id}
            type="button"
            onClick={() => onItemSelect(note.id)}
            className={cn(
              'truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100',
              selectedItemId === note.id
                ? 'bg-blue-50 font-medium text-blue-700'
                : 'text-gray-700',
            )}
          >
            {note.name?.trim() || '(이름 없음)'}
          </button>
        ))
      )}
    </div>
  );
}

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
