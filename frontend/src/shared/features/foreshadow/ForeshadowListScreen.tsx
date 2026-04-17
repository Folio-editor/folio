import { useQuery } from '@powersync/react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { Button } from '../../components/ui/Button';
import { SectionHeader } from '../../components/layout/SectionHeader';

interface ForeshadowListScreenProps {
  workId: string;
  onSelect: (id: string) => void;
}

interface ForeshadowRow {
  id: string;
  title: string;
  status: string;
  importance: string;
}

const IMPORTANCE_COLOR: Record<string, string> = {
  '상': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  '중': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  '하': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_COLOR: Record<string, string> = {
  '진행중': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '완결': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  '폐기': 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

export function ForeshadowListScreen({ workId, onSelect }: ForeshadowListScreenProps) {
  const writerId = useWriterId();
  const { createForeshadow } = useLocalWrite();
  const { data: items = [] } = useQuery<ForeshadowRow>(
    `SELECT id, title, status, importance FROM foreshadow
     WHERE work_id = ? AND writer_id = ?
     ORDER BY sort_order ASC, created_at ASC`,
    [workId, writerId],
  );

  const handleNew = async () => {
    const id = await createForeshadow(workId, '새 복선', '중', items.length);
    onSelect(id);
  };

  return (
    <div className="flex h-full flex-col">
      <SectionHeader
        title="복선"
        description="복선의 설정과 회수 흐름을 관리합니다"
        actions={<Button onClick={() => void handleNew()}>+ 새 복선</Button>}
      />
      <div className="flex-1 overflow-y-auto p-6">
        {items.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">아직 복선이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className="flex flex-col items-start rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-ring hover:shadow-sm"
              >
                <div className="mb-2 flex gap-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${IMPORTANCE_COLOR[item.importance] ?? 'bg-muted'}`}
                  >
                    {item.importance}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[item.status] ?? 'bg-muted'}`}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground">{item.title}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
