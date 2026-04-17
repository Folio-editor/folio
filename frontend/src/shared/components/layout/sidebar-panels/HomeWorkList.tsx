import { useQuery } from '@powersync/react';
import { Plus } from 'lucide-react';
import { useWriterId } from '../../../hooks/useWriterId';
import { cn } from '../../../lib/cn';

interface WorkRow {
  id: string;
  title: string;
}

interface HomeWorkListProps {
  selectedWorkId: string | null;
  searchTerm: string;
  onWorkSelect: (id: string) => void;
  onNewWork: () => void;
}

/**
 * home 액티비티 전용 작품 목록 패널.
 * - "+ 새 작품" 버튼 + 작품 리스트
 * - 검색어가 있으면 title LIKE 로 필터
 */
export function HomeWorkList({
  selectedWorkId,
  searchTerm,
  onWorkSelect,
  onNewWork,
}: HomeWorkListProps) {
  const writerId = useWriterId();
  const trimmed = searchTerm.trim();
  const sql = trimmed
    ? `SELECT id, title FROM work
       WHERE writer_id = ? AND status != 'trashed' AND title LIKE ? ESCAPE '\\'
       ORDER BY sort_order ASC, created_at ASC`
    : `SELECT id, title FROM work
       WHERE writer_id = ? AND status != 'trashed'
       ORDER BY sort_order ASC, created_at ASC`;
  const params = trimmed ? [writerId, `%${escapeLike(trimmed)}%`] : [writerId];
  const { data: works = [] } = useQuery<WorkRow>(sql, params);

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      <button
        type="button"
        onClick={onNewWork}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-sidebar-accent"
      >
        <Plus size={14} strokeWidth={2} />
        <span>새 작품</span>
      </button>
      {works.length === 0 ? (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          {trimmed ? '검색 결과가 없습니다.' : '작품이 없습니다.'}
        </p>
      ) : (
        works.map((work) => (
          <button
            key={work.id}
            type="button"
            onClick={() => onWorkSelect(work.id)}
            className={cn(
              'truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
              selectedWorkId === work.id
                ? 'bg-primary/5 font-medium text-primary'
                : 'text-sidebar-foreground',
            )}
          >
            {work.title}
          </button>
        ))
      )}
    </div>
  );
}

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
