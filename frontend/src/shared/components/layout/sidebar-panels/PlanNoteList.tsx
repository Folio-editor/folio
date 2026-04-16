import { useEffect, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@powersync/react';
import { Plus } from 'lucide-react';
import { useWriterId } from '../../../hooks/useWriterId';
import { useLocalWrite } from '../../../hooks/useLocalWrite';
import { cn } from '../../../lib/cn';

interface NoteRow {
  id: string;
  title: string;
}

interface PlanNoteListProps {
  workId: string;
  searchTerm: string;
  selectedItemId: string | null;
  onItemSelect: (id: string | null) => void;
  onNewPlanNote: () => void;
}

/**
 * plan 섹션 전용 자유 문서 리스트.
 * - 상단 "+ 새 문서" 버튼
 * - title LIKE 검색 (sort_order → created_at)
 * - 항목 더블클릭으로 인라인 제목 편집 — 헤더의 CurrentNoteBar 와 동일 DB 필드
 */
export function PlanNoteList({
  workId,
  searchTerm,
  selectedItemId,
  onItemSelect,
  onNewPlanNote,
}: PlanNoteListProps) {
  const writerId = useWriterId();
  const { updatePlanNoteTitle } = useLocalWrite();
  const trimmed = searchTerm.trim();
  const whereSearch = trimmed ? `AND title LIKE ? ESCAPE '\\'` : '';
  const sql = `SELECT id, title FROM plan_note
     WHERE work_id = ? AND writer_id = ? ${whereSearch}
     ORDER BY sort_order ASC, created_at ASC`;
  const params = trimmed
    ? [workId, writerId, `%${escapeLike(trimmed)}%`]
    : [workId, writerId];
  const { data: notes = [] } = useQuery<NoteRow>(sql, params);

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      <button
        type="button"
        onClick={onNewPlanNote}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-100"
      >
        <Plus size={14} strokeWidth={2} />
        <span>새 문서</span>
      </button>
      {notes.length === 0 ? (
        <p className="px-2 py-6 text-center text-xs text-gray-400">
          {trimmed ? '검색 결과가 없습니다.' : '기획 문서가 없습니다.'}
        </p>
      ) : (
        notes.map((note) => (
          <NoteItem
            key={note.id}
            note={note}
            selected={selectedItemId === note.id}
            onSelect={() => onItemSelect(note.id)}
            onRename={(title) => void updatePlanNoteTitle(note.id, title)}
          />
        ))
      )}
    </div>
  );
}

interface NoteItemProps {
  note: NoteRow;
  selected: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
}

/**
 * 사이드바 리스트 개별 항목.
 *
 * - 단일 클릭 = 선택 (메인에 content 로드)
 * - 더블클릭 = 인라인 제목 편집 진입
 * - Enter / blur → 커밋, Escape → 취소
 * - 빈 문자열은 거부 (원래 제목 복원)
 * - 한글 IME 조합 중 Enter 는 확정용이므로 commit 하지 않음
 */
function NoteItem({ note, selected, onSelect, onRename }: NoteItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.title);

  // 외부에서 title 이 변경되면(동기화 등) 편집 중이 아닐 때만 반영
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
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
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
        className="w-full rounded-md border border-blue-400 bg-white px-2 py-1 text-sm text-gray-900 outline-none ring-1 ring-blue-400"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={() => setEditing(true)}
      title="더블클릭으로 이름 변경"
      className={cn(
        'truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100',
        selected
          ? 'bg-blue-50 font-medium text-blue-700'
          : 'text-gray-700',
      )}
    >
      {note.title?.trim() || '(제목 없음)'}
    </button>
  );
}

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
