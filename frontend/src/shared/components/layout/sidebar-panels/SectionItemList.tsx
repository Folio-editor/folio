import { useQuery } from '@powersync/react';
import { useWriterId } from '../../../hooks/useWriterId';
import { WorkspaceSection, SECTION_TABLES } from '../../../types/workspace';
import { cn } from '../../../lib/cn';

interface SectionItemListProps {
  section: Exclude<WorkspaceSection, 'plan' | 'world-note'>;
  workId: string;
  searchTerm: string;
  selectedItemId: string | null;
  onItemSelect: (id: string | null) => void;
}

interface Row {
  id: string;
  label: string | null;
}

/**
 * 범용 섹션 항목 리스트 (character / plot / episode / foreshadow / idea-archive).
 * - 테이블별 라벨 필드 매핑으로 통일된 UI 제공
 * - 검색어는 라벨 필드에 LIKE 매칭
 */
export function SectionItemList({
  section,
  workId,
  searchTerm,
  selectedItemId,
  onItemSelect,
}: SectionItemListProps) {
  const writerId = useWriterId();
  const table = SECTION_TABLES[section];
  const labelField = LABEL_FIELDS[section];

  const trimmed = searchTerm.trim();
  const whereSearch = trimmed ? `AND ${labelField} LIKE ? ESCAPE '\\'` : '';
  const sql = `SELECT id, ${labelField} AS label FROM ${table}
     WHERE work_id = ? AND writer_id = ? ${whereSearch}
     ORDER BY sort_order ASC, created_at ASC`;
  const params = trimmed
    ? [workId, writerId, `%${escapeLike(trimmed)}%`]
    : [workId, writerId];

  const { data: rows = [] } = useQuery<Row>(sql, params);

  if (rows.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-xs text-muted-foreground">
        {trimmed ? '검색 결과가 없습니다.' : EMPTY_LABELS[section]}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      {rows.map((row) => {
        const display = row.label?.trim() || PLACEHOLDER_LABELS[section];
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => onItemSelect(row.id)}
            className={cn(
              'truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
              selectedItemId === row.id
                ? 'bg-primary/5 font-medium text-primary'
                : 'text-sidebar-foreground',
            )}
          >
            {display}
          </button>
        );
      })}
    </div>
  );
}

const LABEL_FIELDS: Record<SectionItemListProps['section'], string> = {
  character: 'name',
  plot: 'title',
  episode: 'title',
  foreshadow: 'title',
  'idea-archive': 'content',
};

const EMPTY_LABELS: Record<SectionItemListProps['section'], string> = {
  character: '등장인물이 없습니다.',
  plot: '플롯이 없습니다.',
  episode: '원고가 없습니다.',
  foreshadow: '복선이 없습니다.',
  'idea-archive': '아이디어가 없습니다.',
};

const PLACEHOLDER_LABELS: Record<SectionItemListProps['section'], string> = {
  character: '(이름 없음)',
  plot: '(제목 없음)',
  episode: '(제목 없음)',
  foreshadow: '(제목 없음)',
  'idea-archive': '(내용 없음)',
};

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
